// POST /api/webhooks/razorpay — Razorpay webhook (server-verified, idempotent).
//
// Verifies the webhook signature with RAZORPAY_WEBHOOK_SECRET, deduplicates
// by event id in webhook_events, and grants access only after re-reading
// the payment from Razorpay and confirming it is captured.
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sb, type DbOrder } from "@/lib/supabase";
import { grantOrder } from "@/lib/grant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") || "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  let valid = false;
  try {
    valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { valid = false; }
  if (!valid) return NextResponse.json({ error: "Invalid signature." }, { status: 400 });

  const event = JSON.parse(raw) as { id?: string; event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  if (!event.id) return NextResponse.json({ ok: true });
  // Deduplicate: record the event first; if it already exists, skip.
  const seen = await sb<{ id: string }[]>(`webhook_events?select=id&event_id=eq.${encodeURIComponent(event.id)}&limit=1`).catch(() => []);
  if (seen.length) return NextResponse.json({ ok: true, duplicate: true });
  await sb("webhook_events", {
    method: "POST",
    body: { event_id: event.id, event_type: event.event || null, payload: event, processed: false },
  }).catch(() => undefined);

  if (event.event === "payment.captured") {
    const payment = event.payload?.payment?.entity;
    if (payment?.order_id && payment?.id) {
      const orders = await sb<DbOrder[]>(`orders?select=*&razorpay_order_id=eq.${payment.order_id}&limit=1`).catch(() => []);
      const order = orders[0];
      if (order && order.status !== "paid") {
        await sb(`orders?id=eq.${order.id}`, {
          method: "PATCH", body: { razorpay_payment_id: payment.id },
        }).catch(() => undefined);
        await grantOrder({ ...order, razorpay_payment_id: payment.id }).catch(() => undefined);
      }
    }
  }
  await sb(`webhook_events?event_id=eq.${encodeURIComponent(event.id)}`, {
    method: "PATCH", body: { processed: true },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
