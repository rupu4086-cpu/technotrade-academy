// src/app/checkout/page.tsx
"use client";

import Script from "next/script";
import { useState } from "react";

type PaymentResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type RazorpayInstance = {
  open(): void;
  on(event: "payment.failed", callback: () => void): void;
};
// NOTE: this Window.Razorpay declaration must stay identical to the one in
// src/app/courses/page.tsx — TypeScript requires merged global declarations
// to have the same type.
type RazorpayConstructor = new (options: {
  key: string; amount: number; currency: string; name: string; description: string;
  order_id: string; prefill?: { email: string }; theme: { color: string };
  handler: (result: PaymentResult) => void;
  modal: { ondismiss: () => void };
}) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";
// Enable only after server payment endpoints and final course policies are live.
const enrolmentOpen = process.env.NEXT_PUBLIC_ENROLMENT_OPEN === "true";
const amount = 499900;
const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export default function CheckoutPage() {
  const [ready, setReady] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [promo, setPromo] = useState("");
  const [promoMessage, setPromoMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [message, setMessage] = useState("");
  const pending = !key || !enrolmentOpen;

  async function pay() {
    if (pending || !ready || !accepted || busy || paid || !window.Razorpay) return;
    setBusy(true);
    setMessage("Creating a secure payment order…");

    try {
      // Server must derive price from courseId, check availability and acceptance,
      // create a Razorpay order, and persist it against a secure checkout session.
      const response = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: "trading-foundations",
          policyVersion: "foundations-v1",
          acceptedPolicies: true,
        }),
      });
      if (response.status === 404 || response.status === 503) {
        throw new Error("Payment setup is pending. No payment has been initiated.");
      }
      if (!response.ok) throw new Error("Could not create an order. Please contact support.");
      const order = await response.json();
      if (
        typeof order.id !== "string" ||
        !order.id.startsWith("order_") ||
        order.amount !== amount ||
        order.currency !== "INR"
      ) {
        throw new Error("Order details differ from this summary. Payment stopped; contact support.");
      }

      const checkout = new window.Razorpay({
        key,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: "TechnoTrade Academy",
        description: "Trading Foundations",
        theme: { color: "#096b56" },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setMessage("Payment window closed. If your bank shows a debit, contact support before retrying.");
          },
        },
        handler: async (result) => {
          setMessage("Confirming payment securely…");
          try {
            // Server must verify the signature using its secret, match the
            // session/order/amount, confirm captured status, and fulfil once.
            // Use verified webhooks for delayed or interrupted confirmations.
            const verification = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(result),
            });
            if (!verification.ok) throw new Error();
            const confirmation = await verification.json();
            if (confirmation.status !== "paid") throw new Error();
            setPaid(true);
            setMessage(`Payment confirmed. Order reference: ${result.razorpay_order_id}. Contact support with this reference for access assistance.`);
          } catch {
            setMessage(`Payment confirmation is pending. Do not pay again. Contact support with order ${result.razorpay_order_id}.`);
          } finally {
            setBusy(false);
          }
        },
      });
      checkout.on("payment.failed", () => {
        setBusy(false);
        setMessage("Payment was not confirmed. Check your bank status before attempting another payment.");
      });
      checkout.open();
      setMessage("Complete your payment in the secure Razorpay window.");
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Payment unavailable. Please contact support.");
    }
  }

  return (
    <main>
      {key && enrolmentOpen && (
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
          onReady={() => setReady(true)}
          onError={() => setMessage("The payment service could not load. Refresh or contact support.")}
        />
      )}
      <nav aria-label="Main navigation"><a href="/">TechnoTrade Academy</a><a href="/contact">Payment support</a></nav>
      <header><p className="eyebrow">CHECKOUT</p><h1>A considered investment in learning.</h1><p>Review the course, costs, and policies before paying.</p></header>

      {pending && (
        <aside className="notice" role="status">
          <strong>Payment setup pending</strong>
          <p>Paid enrolment is not available. Payment credentials, secure server processing, and final course policies must be ready before payments are enabled. No money can be collected from this page in this state.</p>
        </aside>
      )}

      <div className="grid">
        <section className="card">
          <h2>Trading Foundations</h2>
          <p>A foundational learning programme focused on understanding markets and managing risk.</p>
          <ul>
            <li>Market structure, candlesticks, and order types</li>
            <li>Position sizing and risk planning</li>
            <li>Paper-trading exercises and journal reviews</li>
          </ul>
          <p><strong>Before enrolment:</strong> Confirm instructor details, schedule, delivery format, and access duration with support. These details must be finalised before enrolment opens.</p>
          <h3>Purchase policies</h3>
          <p>Review the <a href="/terms" target="_blank" rel="noopener noreferrer">terms of purchase (new tab)</a>, <a href="/refund-policy" target="_blank" rel="noopener noreferrer">refund policy (new tab)</a>, and <a href="/privacy" target="_blank" rel="noopener noreferrer">privacy policy (new tab)</a>. If a policy is unavailable or unclear, do not proceed; contact support.</p>
          <p>Education only—not personalised investment advice. Trading involves risk of loss. No profits or trading outcomes are guaranteed.</p>
        </section>

        <section className="card" aria-labelledby="summary-heading">
          <h2 id="summary-heading">Order summary</h2>
          <p>One-time payment · INR · No subscription</p>
          <form onSubmit={(event) => {
            event.preventDefault();
            setPromoMessage(promo.trim() ? "No active promo codes are available. No discount has been applied." : "Enter a promo code.");
          }}>
            <label htmlFor="promo">Promo code</label>
            <div className="promo">
              <input id="promo" value={promo} onChange={(event) => setPromo(event.target.value)} maxLength={40} autoComplete="off" disabled={busy || paid} />
              <button type="submit" className="secondary" disabled={busy || paid}>Check</button>
            </div>
            <p role="status">{promoMessage}</p>
          </form>
          <dl>
            <div><dt>Course price, inclusive of applicable taxes</dt><dd>{money(amount)}</dd></div>
            <div><dt>Discount</dt><dd>{money(0)}</dd></div>
            <div><dt>Additional checkout fees</dt><dd>{money(0)}</dd></div>
            <div className="total"><dt>Total payable</dt><dd>{money(amount)}</dd></div>
          </dl>
          <p className="small">No tax is added at checkout. Any applicable tax component will be itemised on the invoice. Your bank may charge its own fees.</p>
          <label className="accept">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy || paid || pending} />
            <span>I have read and accept the purchase, refund, and privacy policies, and understand the trading risk disclosure.</span>
          </label>
          <button className="pay" onClick={pay} disabled={pending || !ready || !accepted || busy || paid}>
            {paid ? "Payment confirmed" : pending ? "Payments not yet available" : busy ? "Payment in progress…" : !ready ? "Loading payment service…" : `Pay ${money(amount)} with Razorpay`}
          </button>
          <p role="status" aria-live="polite">{message}</p>
          <p className="small">Payment details are entered in Razorpay’s secure checkout, not in this page.</p>
        </section>
      </div>
      <style>{`
        *{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#17253b;font-family:Arial,sans-serif}
        main{max-width:1080px;margin:auto;padding:24px}nav{display:flex;justify-content:space-between;gap:20px}a{color:#096b56}
        header{padding:36px 0 20px;max-width:750px}.eyebrow{font-size:12px;letter-spacing:3px}h1{font-size:clamp(32px,5vw,48px)}
        p,li{line-height:1.7}li{margin-bottom:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
        .card{padding:26px;background:white;border:1px solid #dae2ec;border-radius:16px}h2{margin-top:0}
        .notice{padding:20px;background:#fff3d8;border:1px solid #d3a54c;border-radius:12px;margin-bottom:24px}.notice p{margin-bottom:0}
        label{display:block;font-weight:bold}.promo{display:flex;gap:8px;margin-top:10px}input:not([type=checkbox]){min-width:0;width:100%;padding:12px;border:1px solid #8494aa;border-radius:8px;font:inherit}
        button{padding:12px 16px;border:0;border-radius:8px;font:inherit;cursor:pointer;background:#096b56;color:white}
        .secondary{background:#e8eef5;color:#17253b}button:disabled{opacity:.6;cursor:not-allowed}
        dl>div{display:flex;justify-content:space-between;gap:20px;padding:14px 0;border-bottom:1px solid #dae2ec}
        dd{margin:0;white-space:nowrap}.total{font-weight:bold;font-size:20px}.small{font-size:13px;color:#526174}
        .accept{display:flex;gap:10px;font-weight:normal;font-size:14px;line-height:1.6;margin:24px 0}.accept input{align-self:flex-start;margin-top:5px}
        .pay{width:100%}:focus-visible{outline:3px solid #c48a25;outline-offset:3px}@media(max-width:760px){.grid{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}
