// POST /api/checkout — checkout on the real Supabase tables.
//
// Actions (all server-side, cookie session):
//   GET  -> { courses: published courses, razorpayConfigured }
//   POST { action: "quote", courseId, promo } -> price breakdown incl. 18% GST
//   POST { action: "create", courseId, promo } -> pending order first, then
//          a Razorpay order; free / Rs 0 totals are granted instantly.
//   POST { action: "verify", razorpay_order_id, razorpay_payment_id,
//          razorpay_signature } -> signature + re-read from Razorpay;
//          grants access ONLY for a captured, unrefunded payment.
//
// Never unlocks or marks an order paid before a verified payment.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  sb, listPublishedCourses, getCourseById, razorpayConfigured, ConfigError,
} from "@/lib/supabase";
import {
  validatePromo, priceBreakdown, verifySignature, fetchRazorpayPayment,
  grantOrder, grantFreeOrder, type DbPromo,
} from "@/lib/grant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function razorpay<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpError(502, "The payment provider is temporarily unavailable. Please retry.");
  return (await response.json()) as T;
}

export async function GET() {
  try {
    const courses = await listPublishedCourses();
    return json({
      courses: courses.map((c) => ({
        id: c.id, slug: c.slug, title: c.title, category: c.category,
        description: c.description, price: c.price_paise, level: c.level,
      })),
      razorpayConfigured: razorpayConfigured(),
    });
  } catch (error) {
    if (error instanceof ConfigError) return json({ courses: [], razorpayConfigured: false, error: error.message }, 503);
    return json({ courses: [], razorpayConfigured: razorpayConfigured(), error: "Could not load courses." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) throw new HttpError(401, "Please sign in to continue.");
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new HttpError(400, "Invalid request.");

    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const course = courseId ? await getCourseById(courseId) : null;
    if (!course || course.status !== "published") throw new HttpError(400, "Unknown course.");

    const promoCode = typeof body.promo === "string" ? body.promo.trim().toUpperCase() : "";
    let promo: DbPromo | null = null;
    let discount = 0;
    if (promoCode) {
      if (!/^[A-Z0-9_-]{1,40}$/.test(promoCode)) throw new HttpError(400, "Invalid promo code.");
      const rows = await sb<DbPromo[]>(`promo_codes?select=*&code=eq.${promoCode}&limit=1`);
      promo = rows[0] || null;
      if (!promo) throw new HttpError(400, "This promo code is invalid.");
      const checked = validatePromo(promo, course.price_paise);
      if (!checked.ok) throw new HttpError(400, checked.reason);
      discount = checked.discountPaise;
    }
    const breakdown = priceBreakdown(course.price_paise, discount);

    if (body.action === "quote") return json({ ...breakdown, promoCode: promo?.code || null });

    // Already enrolled?
    const enrolled = await sb<{ id: string }[]>(
      `enrollments?select=id&user_id=eq.${session.sub}&course_id=eq.${course.id}`,
    );
    if (enrolled.length) return json({ status: "granted", courseId: course.id });

    if (body.action === "create") {
      if (breakdown.totalPaise === 0) {
        const order = await sb<{ id: string }[]>("orders", {
          method: "POST", prefer: "return=representation",
          body: {
            user_id: session.sub, course_id: course.id,
            amount_paise: course.price_paise, discount_paise: discount,
            final_amount_paise: 0, promo_code_id: promo?.id || null, status: "pending",
          },
        });
        await grantFreeOrder(order[0] as never);
        return json({ status: "granted", courseId: course.id });
      }
      if (!razorpayConfigured()) {
        throw new HttpError(503, "Payment setup is pending: Razorpay keys are not configured. No payment has been started.");
      }
      // Reuse a recent pending order for the same course/amount, else create one.
      const recent = await sb<import("@/lib/supabase").DbOrder[]>(
        `orders?select=*&user_id=eq.${session.sub}&course_id=eq.${course.id}&status=eq.pending&order=created_at.desc&limit=1`,
      );
      let order = recent.find((o) => o.final_amount_paise === breakdown.totalPaise && o.razorpay_order_id);
      if (!order) {
        const created = await sb<import("@/lib/supabase").DbOrder[]>("orders", {
          method: "POST", prefer: "return=representation",
          body: {
            user_id: session.sub, course_id: course.id,
            amount_paise: course.price_paise, discount_paise: discount,
            final_amount_paise: breakdown.totalPaise, promo_code_id: promo?.id || null,
            status: "pending",
          },
        });
        order = created[0];
      }
      if (!order.razorpay_order_id) {
        const providerOrder = await razorpay<{ id: string; amount: number; currency: string; receipt: string }>("orders", {
          amount: breakdown.totalPaise, currency: "INR", receipt: order.id,
          notes: { academy_order_id: order.id },
        });
        if (!/^order_[A-Za-z0-9]+$/.test(providerOrder.id) || providerOrder.amount !== breakdown.totalPaise || providerOrder.currency !== "INR")
          throw new HttpError(502, "Payment provider order mismatch. No payment has been taken.");
        await sb(`orders?id=eq.${order.id}`, {
          method: "PATCH", body: { razorpay_order_id: providerOrder.id },
        });
        order.razorpay_order_id = providerOrder.id;
      }
      return json({
        status: "pending", key: process.env.RAZORPAY_KEY_ID,
        orderId: order.razorpay_order_id, amount: breakdown.totalPaise,
        currency: "INR", breakdown,
      });
    }

    if (body.action === "verify") {
      const razorpayOrderId = body.razorpay_order_id;
      const paymentId = body.razorpay_payment_id;
      const signature = body.razorpay_signature;
      if (
        typeof razorpayOrderId !== "string" || !/^order_[A-Za-z0-9]{1,80}$/.test(razorpayOrderId) ||
        typeof paymentId !== "string" || !/^pay_[A-Za-z0-9]{1,80}$/.test(paymentId) ||
        typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)
      ) throw new HttpError(400, "Invalid payment verification details.");
      if (!verifySignature(razorpayOrderId, paymentId, signature))
        throw new HttpError(400, "Payment signature verification failed.");
      const orders = await sb<import("@/lib/supabase").DbOrder[]>(
        `orders?select=*&razorpay_order_id=eq.${razorpayOrderId}&user_id=eq.${session.sub}&limit=1`,
      );
      const order = orders[0];
      if (!order) throw new HttpError(404, "Order not found.");
      // Re-read the payment from Razorpay; a signature alone is not proof.
      const payment = await fetchRazorpayPayment(paymentId);
      if (
        payment.id !== paymentId || payment.order_id !== razorpayOrderId ||
        payment.amount !== order.final_amount_paise || payment.currency !== "INR"
      ) throw new HttpError(400, "Payment does not match this order.");
      if (payment.status !== "captured" || payment.captured !== true || payment.amount_refunded !== 0)
        return json({ status: "pending", message: "Payment is not yet captured. Access remains locked." }, 202);
      await sb(`orders?id=eq.${order.id}`, {
        method: "PATCH", body: { razorpay_payment_id: paymentId },
      });
      const granted = await grantOrder({ ...order, razorpay_payment_id: paymentId });
      if (!granted.granted) throw new HttpError(409, granted.reason || "Payment could not be confirmed.");
      return json({ status: "granted", courseId: order.course_id });
    }

    throw new HttpError(400, "Unknown checkout action.");
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof ConfigError) return json({ error: error.message }, 503);
    console.error("Checkout failure", { type: error instanceof Error ? error.name : "Unknown" });
    return json({ error: "Checkout could not be completed. If you paid, retry verification rather than paying again." }, 500);
  }
}
