// Payments — list, plus a Razorpay re-check for one payment.
// Uses the owner's Supabase `payments` table:
//   order_id, razorpay_payment_id, amount_paise, status, created_at.
// The "Check with Razorpay" action fetches the payment from Razorpay with
// the server keys and only then updates the stored status — and only to
// the status Razorpay itself reports (captured / failed). It never marks
// a payment captured from this screen without Razorpay confirming it,
// and it never grants course access (that happens only in the public
// site's verified checkout flow).

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { adminDb, requireOwner } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payment = {
  id: string;
  order_id: string;
  razorpay_payment_id: string | null;
  amount_paise: number;
  status: string;
  created_at: string;
};

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

async function checkWithRazorpay(form: FormData) {
  "use server";
  await requireOwner();
  const id = form.get("id");
  if (typeof id !== "string" || !id) throw new Error("Invalid payment.");
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay keys are not configured for this admin app.");
  }
  const db = adminDb();
  const { data, error } = await db
    .from("payments")
    .select("id,order_id,razorpay_payment_id,amount_paise,status")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("Payment not found.");
  const payment = data as Payment;
  if (!payment.razorpay_payment_id) throw new Error("This payment has no Razorpay payment ID.");
  if (!/^pay_[A-Za-z0-9]{1,80}$/.test(payment.razorpay_payment_id)) {
    throw new Error("Invalid Razorpay payment ID.");
  }
  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(payment.razorpay_payment_id)}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
    },
  );
  if (!response.ok) throw new Error("Razorpay could not confirm this payment. Try again later.");
  const live = await response.json();
  // Only trust Razorpay's own report, and only if it matches this record.
  if (live.id !== payment.razorpay_payment_id || live.amount !== payment.amount_paise) {
    throw new Error("Razorpay's record does not match this payment. No change was made.");
  }
  const status = live.status === "captured" ? "captured" : live.status === "failed" ? "failed" : payment.status;
  if (status === payment.status) return;
  const { error: updateError } = await db.from("payments").update({ status }).eq("id", id);
  if (updateError) throw new Error("Unable to update payment status.");
  revalidatePath("/payments");
}

export default async function PaymentsPage() {
  await requireOwner();
  const db = adminDb();
  const [paymentsRes, ordersRes] = await Promise.all([
    db.from("payments").select("id,order_id,razorpay_payment_id,amount_paise,status,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("orders").select("id,final_amount_paise,status").limit(1000),
  ]);
  if (paymentsRes.error || ordersRes.error) throw new Error("Unable to load payments.");
  const orders = new Map<string, { final_amount_paise: number; status: string }>(
    (ordersRes.data as { id: string; final_amount_paise: number; status: string }[]).map((o) => [
      o.id,
      { final_amount_paise: o.final_amount_paise, status: o.status },
    ]),
  );
  const payments = paymentsRes.data as Payment[];
  const keysConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

  return (
    <main style={{ maxWidth: 1000, margin: "32px auto", padding: 24 }}>
      <Link href="/">Dashboard</Link>
      <h1>Payments</h1>
      <p>
        Newest first (latest 500). {keysConfigured ? "Razorpay keys are configured — you can re-check a payment against Razorpay." : "Razorpay keys are NOT configured for this admin app — re-check is unavailable until they are set in the deployment environment."}
      </p>
      <p>
        Razorpay Key ID: {process.env.RAZORPAY_KEY_ID ? "configured" : "not configured"} ·
        Key Secret: {process.env.RAZORPAY_KEY_SECRET ? "configured" : "not configured"} ·
        Webhook Secret: {process.env.RAZORPAY_WEBHOOK_SECRET ? "configured" : "not configured"}
        {" "}(secrets are never shown).
      </p>
      {payments.length === 0 && <p>No payments.</p>}
      {payments.map((payment) => {
        const order = orders.get(payment.order_id);
        return (
          <section key={payment.id} style={{ border: "1px solid #aaa", marginTop: 16, padding: 16 }}>
            <h2>{money(payment.amount_paise)} · {payment.status}</h2>
            <p>
              Razorpay payment: {payment.razorpay_payment_id || "—"}
              <br />
              Order: {payment.order_id}
              {order ? ` · order total ${money(order.final_amount_paise)} · order ${order.status}` : ""}
              <br />
              {new Date(payment.created_at).toISOString()}
            </p>
            {keysConfigured && payment.razorpay_payment_id && (
              <form action={checkWithRazorpay}>
                <input type="hidden" name="id" value={payment.id} />
                <button type="submit">Check with Razorpay</button>
              </form>
            )}
          </section>
        );
      })}
    </main>
  );
}
