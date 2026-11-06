// Account — profile, order history, password change.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { sb, money, type DbOrder, type DbCourse } from "@/lib/supabase";
import { SiteNav, SiteFooter, pageWrap, cardStyle } from "@/lib/nav";
import { ChangePasswordForm } from "./change-password-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=%2Faccount");

  let orders: (DbOrder & { courseTitle?: string })[] = [];
  let loadError = "";
  try {
    orders = await sb<DbOrder[]>(`orders?select=*&user_id=eq.${session.sub}&order=created_at.desc`);
    for (const order of orders) {
      const course = await sb<DbCourse[]>(`courses?select=title&id=eq.${order.course_id}&limit=1`).catch(() => []);
      order.courseTitle = course[0]?.title || "Course";
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Orders could not be loaded.";
  }

  return (
    <>
      <SiteNav />
      <main style={pageWrap}>
        <h1 style={{ fontSize: 34 }}>Your account</h1>
        <section style={{ ...cardStyle, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Profile</h2>
          <p><strong>Name:</strong> {session.name}</p>
          <p><strong>Email:</strong> {session.email}</p>
          <p><strong>Role:</strong> {session.role}</p>
        </section>
        <section style={{ ...cardStyle, marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Order history</h2>
          {loadError && <p role="status">{loadError}</p>}
          {!loadError && !orders.length && (
            <p>No orders yet. <Link href="/courses">Browse courses</Link></p>
          )}
          {orders.map((order) => (
            <div key={order.id} style={{ borderTop: "1px solid #dae2ec", padding: "12px 0" }}>
              <p style={{ margin: 0 }}>
                <strong>{order.courseTitle}</strong> — {money(order.final_amount_paise)} · {order.status}
              </p>
              <p style={{ margin: "4px 0 0", color: "#526174", fontSize: 13 }}>
                Order {order.id.slice(0, 8)}… {order.created_at ? `· ${new Date(order.created_at).toLocaleString("en-IN")}` : ""}
                {order.status === "paid" && <> · <Link href="/learn">Open in My Learning</Link></>}
                {order.status === "pending" && " · Payment pending — access unlocks only after a verified captured payment."}
              </p>
            </div>
          ))}
        </section>
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Change password</h2>
          <ChangePasswordForm />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
