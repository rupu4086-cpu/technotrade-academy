// src/app/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  adminDb,
  hasOwnerSession,
  signInOwner,
  signOutOwner,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function login(form: FormData) {
  "use server";
  if (!(await signInOwner(form))) redirect("/?error=1");
  redirect("/");
}

async function logout() {
  "use server";
  await signOutOwner();
  redirect("/");
}

async function dashboardStats() {
  const db = adminDb();
  const results = await Promise.all([
    db.from("courses").select("id", { count: "exact", head: true }),
    db.from("users").select("id", { count: "exact", head: true }).eq("role", "student"),
    db.from("orders").select("id", { count: "exact", head: true }),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("enquiries").select("id", { count: "exact", head: true }),
  ]);
  if (results.some((result) => result.error)) {
    throw new Error("Unable to load dashboard counts. Check the database schema.");
  }

  let revenue = 0;
  // Paginate rather than silently truncating at Supabase's response limit.
  for (let offset = 0; ; ) {
    const { data, error } = await db
      .from("payments")
      .select("id, amount")
      .eq("status", "captured")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Unable to load payment totals.");
    if (!data?.length) break;
    for (const payment of data) {
      const amount = Number(payment.amount);
      if (!Number.isFinite(amount)) throw new Error("Invalid payment amount.");
      revenue += amount;
    }
    offset += data.length;
  }

  return {
    "Total courses": results[0].count ?? 0,
    Students: results[1].count ?? 0,
    Orders: results[2].count ?? 0,
    Revenue: new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(revenue / 100),
    "Pending orders": results[3].count ?? 0,
    Enquiries: results[4].count ?? 0,
  };
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await hasOwnerSession())) {
    const { error } = await searchParams;
    return (
      <main style={{ maxWidth: 440, margin: "64px auto", padding: 24 }}>
        <h1>TechnoTrade Academy Admin</h1>
        <p>Owner login only</p>
        {error && <p role="alert">Unable to sign in. Check your credentials.</p>}
        <form action={login} style={{ display: "grid", gap: 16 }}>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={1024}
              required
            />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </main>
    );
  }

  const stats = await dashboardStats();
  const links = [
    ["Courses", "/courses"],
    ["Lessons", "/courses#lessons"],
    ["Promo", "/promo"],
    ["Orders", "/orders"],
    ["Payments", "/payments"],
    ["Ads", "/ads"],
    ["Enquiries", "/enquiries"],
    ["Community", "/community"],
  ];

  return (
    <main style={{ maxWidth: 1100, margin: "32px auto", padding: 24 }}>
      <header>
        <h1>TechnoTrade Academy Admin</h1>
        <form action={logout}>
          <button type="submit">Sign out</button>
        </form>
      </header>
      <nav aria-label="Admin navigation" style={{ display: "flex", flexWrap: "wrap", gap: 20, margin: "24px 0" }}>
        {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        {Object.entries(stats).map(([label, value]) => (
          <article key={label} style={{ border: "1px solid #aaa", padding: 20 }}>
            <h2>{label}</h2>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <p>Revenue: gross captured payments in INR. New ads are inactive by default.</p>
    </main>
  );
}
