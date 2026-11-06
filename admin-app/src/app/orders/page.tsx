// Orders — read-only list, plus cancelling a pending order.
// Uses the owner's Supabase `orders` table:
//   amount_paise, discount_paise, final_amount_paise, status,
//   razorpay_order_id, razorpay_payment_id, created_at.
// SAFETY: there is deliberately no way to mark an order paid from this
// screen. Paid status only ever comes from a verified captured Razorpay
// payment (public site /api/checkout verify, or the Payments page's
// Razorpay re-check). Cancelling is only offered for pending orders.

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { adminDb, requireOwner } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Order = {
  id: string;
  user_id: string;
  course_id: string;
  amount_paise: number;
  discount_paise: number;
  final_amount_paise: number;
  status: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
};

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

async function cancelOrder(form: FormData) {
  "use server";
  await requireOwner();
  const id = form.get("id");
  if (typeof id !== "string" || !id || form.get("confirm") !== "on") {
    throw new Error("Confirm cancellation.");
  }
  // Only a pending order can be cancelled — paid/captured orders are never
  // touched here.
  const { error } = await adminDb()
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw new Error("Unable to cancel order.");
  revalidatePath("/orders");
}

export default async function OrdersPage() {
  await requireOwner();
  const db = adminDb();
  const [ordersRes, usersRes, coursesRes] = await Promise.all([
    db.from("orders").select("id,user_id,course_id,amount_paise,discount_paise,final_amount_paise,status,razorpay_order_id,razorpay_payment_id,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("users").select("id,email").limit(1000),
    db.from("courses").select("id,title").limit(1000),
  ]);
  if (ordersRes.error || usersRes.error || coursesRes.error) {
    throw new Error("Unable to load orders.");
  }
  const users = new Map<string, string>(
    (usersRes.data as { id: string; email: string }[]).map((u) => [u.id, u.email]),
  );
  const courses = new Map<string, string>(
    (coursesRes.data as { id: string; title: string }[]).map((c) => [c.id, c.title]),
  );
  const orders = ordersRes.data as Order[];

  return (
    <main style={{ maxWidth: 1000, margin: "32px auto", padding: 24 }}>
      <Link href="/">Dashboard</Link>
      <h1>Orders</h1>
      <p>
        Newest first (latest 500). Orders are never marked paid by hand —
        paid status only comes from a verified captured Razorpay payment.
      </p>
      {orders.length === 0 && <p>No orders.</p>}
      {orders.map((order) => (
        <section key={order.id} style={{ border: "1px solid #aaa", marginTop: 16, padding: 16 }}>
          <h2>{courses.get(order.course_id) || order.course_id}</h2>
          <p>
            {users.get(order.user_id) || order.user_id} · {money(order.final_amount_paise)}
            {order.discount_paise ? ` (discount ${money(order.discount_paise)})` : ""}
            {` · ${order.status}`}
            {` · ${new Date(order.created_at).toISOString()}`}
          </p>
          <p>
            Razorpay order: {order.razorpay_order_id || "—"}
            <br />
            Razorpay payment: {order.razorpay_payment_id || "—"}
          </p>
          {order.status === "pending" && (
            <form action={cancelOrder}>
              <input type="hidden" name="id" value={order.id} />
              <label><input type="checkbox" name="confirm" required /> Confirm cancellation </label>
              <button type="submit">Cancel pending order</button>
            </form>
          )}
        </section>
      ))}
    </main>
  );
}
