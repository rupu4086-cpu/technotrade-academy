// Shared checkout maths and payment granting.
//
// CHECKOUT RULE (never break it): a paid course creates a PENDING order
// first. Access is granted ONLY after a Razorpay payment is verified:
// the checkout signature is checked, then the payment is re-read from
// Razorpay and must be status "captured", unrefunded, and for the exact
// order amount. A free course (or a Rs 0 total after a promo) is granted
// instantly. Promo discounts are calculated server-side only, from the
// promo_codes table, and usage is counted exactly once, at payment.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sb, type DbOrder, type DbPromo } from "./supabase";

export type { DbPromo } from "./supabase";

export const GST_RATE = 0.18;

export type Breakdown = {
  pricePaise: number;
  discountPaise: number;
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
};

export function validatePromo(promo: DbPromo, pricePaise: number): { ok: true; discountPaise: number } | { ok: false; reason: string } {
  if (!promo.is_active) return { ok: false, reason: "This promo code is not active." };
  if (promo.expires_at && Date.parse(promo.expires_at) <= Date.now())
    return { ok: false, reason: "This promo code has expired." };
  if (promo.usage_limit !== null && promo.used_count >= promo.usage_limit)
    return { ok: false, reason: "This promo code has reached its usage limit." };
  if (pricePaise < (promo.min_spend_paise || 0))
    return { ok: false, reason: "This promo code needs a higher order value." };
  let discount = 0;
  if (promo.type === "percent") {
    discount = Math.round((pricePaise * Math.min(Math.max(promo.value, 0), 90)) / 100);
  } else if (promo.type === "flat") {
    discount = promo.value;
  } else {
    return { ok: false, reason: "This promo code is not valid." };
  }
  if (promo.max_discount_paise !== null) discount = Math.min(discount, promo.max_discount_paise);
  discount = Math.min(discount, pricePaise);
  return { ok: true, discountPaise: discount };
}

export function priceBreakdown(pricePaise: number, discountPaise: number): Breakdown {
  const subtotal = Math.max(pricePaise - discountPaise, 0);
  const gst = Math.round(subtotal * GST_RATE);
  return { pricePaise, discountPaise, subtotalPaise: subtotal, gstPaise: gst, totalPaise: subtotal + gst };
}

type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
  amount_refunded: number;
};

export function razorpayAuth(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Payment setup is pending: Razorpay keys are not configured.");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: razorpayAuth() },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("The payment provider is temporarily unavailable.");
  return (await response.json()) as RazorpayPayment;
}

export function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  try {
    const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
    const actual = Buffer.from(signature, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Grant access for a paid order. Idempotent: safe to call twice. */
export async function grantOrder(order: DbOrder): Promise<{ granted: boolean; reason?: string }> {
  if (order.status === "paid") return { granted: true };
  // Already enrolled? Then mark the order paid only if a payment row exists.
  const existing = await sb<{ id: string }[]>(
    `enrollments?select=id&user_id=eq.${order.user_id}&course_id=eq.${order.course_id}`,
  );
  if (existing.length) {
    await sb(`orders?id=eq.${order.id}`, {
      method: "PATCH",
      body: { status: "paid", updated_at: new Date().toISOString() },
    });
    return { granted: true };
  }
  if (!order.razorpay_payment_id) return { granted: false, reason: "No payment recorded for this order." };
  const payment = await fetchRazorpayPayment(order.razorpay_payment_id);
  if (
    payment.id !== order.razorpay_payment_id ||
    payment.order_id !== order.razorpay_order_id ||
    payment.amount !== order.final_amount_paise ||
    payment.currency !== "INR" ||
    payment.status !== "captured" ||
    payment.captured !== true ||
    payment.amount_refunded !== 0
  ) {
    return { granted: false, reason: "Payment is not a captured, unrefunded payment for this order." };
  }
  // Record the payment, mark the order paid, enrol the student.
  await sb("payments", {
    method: "POST",
    prefer: "resolution=ignore-duplicates",
    body: {
      order_id: order.id,
      razorpay_payment_id: payment.id,
      amount_paise: payment.amount,
      status: "captured",
    },
  });
  await sb(`orders?id=eq.${order.id}`, {
    method: "PATCH",
    body: { status: "paid", razorpay_payment_id: payment.id, updated_at: new Date().toISOString() },
  });
  await sb("enrollments", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: { user_id: order.user_id, course_id: order.course_id, order_id: order.id },
  });
  // Promo usage counts exactly once, at payment, and only for this order.
  if (order.promo_code_id) {
    const redemptions = await sb<{ id: string }[]>(
      `promo_redemptions?select=id&order_id=eq.${order.id}`,
    );
    if (!redemptions.length) {
      await sb("promo_redemptions", {
        method: "POST",
        body: { promo_code_id: order.promo_code_id, user_id: order.user_id, order_id: order.id },
      });
      const promo = await sb<DbPromo[]>(`promo_codes?select=*&id=eq.${order.promo_code_id}&limit=1`);
      if (promo[0]) {
        await sb(`promo_codes?id=eq.${promo[0].id}`, {
          method: "PATCH",
          body: { used_count: promo[0].used_count + 1 },
        });
      }
    }
  }
  return { granted: true };
}

/** Grant a free / Rs 0 order instantly (no payment involved). */
export async function grantFreeOrder(order: DbOrder): Promise<void> {
  await sb(`orders?id=eq.${order.id}`, {
    method: "PATCH",
    body: { status: "paid", updated_at: new Date().toISOString() },
  });
  await sb("enrollments", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: { user_id: order.user_id, course_id: order.course_id, order_id: order.id },
  });
}
