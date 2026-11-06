// Pricing — Basic ₹999 / Pro ₹1,999 / Elite ₹4,999 (one-time plans).
import Link from "next/link";
import { SiteNav, SiteFooter, pageWrap, cardStyle } from "@/lib/nav";

const plans = [
  {
    name: "Basic", price: "₹999", note: "One-time payment",
    features: ["Stock Market Foundations course", "Self-paced lessons", "Community access", "Email support"],
    popular: false,
  },
  {
    name: "Pro", price: "₹1,999", note: "One-time payment · Most Popular",
    features: ["Everything in Basic", "Crypto + Forex foundations", "Trading psychology course", "Lesson progress tracking", "Priority support"],
    popular: true,
  },
  {
    name: "Elite", price: "₹4,999", note: "One-time payment",
    features: ["Everything in Pro", "Strategy Testing Lab (Advanced)", "All future foundation courses", "Direct mentor Q&A sessions"],
    popular: false,
  },
];

export default function PricingPage() {
  return (
    <>
      <SiteNav />
      <main style={pageWrap}>
        <p style={{ letterSpacing: 3, fontSize: 12, fontWeight: 700, color: "#0f766e" }}>PRICING</p>
        <h1 style={{ fontSize: 40, margin: "12px 0" }}>Simple, one-time pricing.</h1>
        <p style={{ lineHeight: 1.7, color: "#526174", maxWidth: 640 }}>
          No subscriptions, no hidden charges. Pay once for the plan that fits your learning path.
          Prices include 18% GST at checkout. Promo codes can be applied at checkout.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18, marginTop: 32 }}>
          {plans.map((plan) => (
            <article key={plan.name} style={{ ...cardStyle, borderColor: plan.popular ? "#0f766e" : "#dae2ec", borderWidth: plan.popular ? 2 : 1 }}>
              {plan.popular && <p style={{ color: "#0f766e", fontWeight: 700, margin: "0 0 8px" }}>MOST POPULAR</p>}
              <h2 style={{ margin: "0 0 4px" }}>{plan.name}</h2>
              <p style={{ fontSize: 32, fontWeight: 700, margin: "8px 0" }}>{plan.price}</p>
              <p style={{ color: "#526174", marginTop: 0 }}>{plan.note}</p>
              <ul style={{ lineHeight: 1.9, paddingLeft: 20 }}>
                {plan.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <Link href="/courses" style={{ display: "inline-block", background: "#0f766e", color: "#fff", padding: "12px 18px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
                Browse courses →
              </Link>
            </article>
          ))}
        </div>
        <p style={{ marginTop: 32, lineHeight: 1.7, color: "#526174" }}>
          Prices shown are for the plan, not per course — individual course prices are shown on the
          course pages and at checkout. Refund terms are stated on each course page before you pay.
          Education only — no trading signals, no guaranteed returns.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
