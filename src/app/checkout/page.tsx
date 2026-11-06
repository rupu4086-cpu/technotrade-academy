// Checkout — promo code apply, price breakdown incl. 18% GST, Razorpay
// button, and an honest "payment setup pending" state when keys are missing.
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { SiteNav, SiteFooter, pageWrap, cardStyle, inputStyle, buttonStyle } from "@/lib/nav";

type Course = { id: string; slug: string; title: string; price: number };
type Breakdown = { pricePaise: number; discountPaise: number; subtotalPaise: number; gstPaise: number; totalPaise: number };
type PaymentResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: "payment.failed", callback: () => void): void };
type RazorpayConstructor = new (options: {
  key: string; amount: number; currency: string; name: string; description: string;
  order_id: string; prefill?: { email: string }; theme: { color: string };
  handler: (result: PaymentResult) => void;
  modal: { ondismiss: () => void };
}) => RazorpayInstance;

declare global { interface Window { Razorpay?: RazorpayConstructor } }

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

let scriptPromise: Promise<void> | undefined;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return (scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve() : reject(new Error("Checkout could not load.")));
    script.onerror = () => { script.remove(); scriptPromise = undefined; reject(new Error("Unable to load secure checkout.")); };
    document.head.appendChild(script);
  }));
}

export default function CheckoutPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseSlug, setCourseSlug] = useState("");
  const [razorpayConfigured, setRazorpayConfigured] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [promo, setPromo] = useState("");
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [promoMessage, setPromoMessage] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const pending = useRef<PaymentResult | null>(null);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("course") || "";
    setCourseSlug(slug);
    fetch("/api/checkout")
      .then((r) => r.json())
      .then((data) => {
        setCourses(data.courses || []);
        setRazorpayConfigured(data.razorpayConfigured !== false);
        if (data.error) setMessage(data.error);
      })
      .catch(() => setMessage("Could not load courses."))
      .finally(() => setLoading(false));
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      setSignedIn(Boolean(d.signedIn));
      if (d.email) setEmail(d.email);
    }).catch(() => undefined);
  }, []);

  const course = courses.find((c) => c.slug === courseSlug) || courses[0];
  useEffect(() => {
    if (course && !courseSlug) setCourseSlug(course.slug);
  }, [course, courseSlug]);

  async function quote(event?: FormEvent) {
    event?.preventDefault();
    if (!course) return;
    setPromoMessage("");
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "quote", courseId: course.id, promo }),
    });
    const data = await response.json();
    if (!response.ok) {
      setPromoMessage(data.error || "Promo could not be applied.");
      setBreakdown(null);
      return;
    }
    setBreakdown(data);
    setPromoMessage(promo ? "Promo code applied." : "Price updated.");
  }

  async function pay() {
    if (!course || busy || paid) return;
    if (!signedIn) {
      window.location.href = `/login?next=${encodeURIComponent(`/checkout?course=${course.slug}`)}`;
      return;
    }
    setBusy(true);
    setMessage("Creating a secure payment order…");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", courseId: course.id, promo }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create an order.");
      if (data.status === "granted") {
        setPaid(true);
        setMessage("Access granted. This course was free (or Rs 0 after promo).");
        return;
      }
      await loadCheckout();
      const checkout = new window.Razorpay!({
        key: data.key, order_id: data.orderId, amount: data.amount, currency: data.currency,
        name: "TechnoTrade Academy", description: course.title,
        prefill: { email }, theme: { color: "#0f766e" },
        handler: async (result) => {
          setMessage("Confirming payment securely…");
          try {
            const verification = await fetch("/api/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "verify", ...result }),
            });
            const confirmation = await verification.json();
            if (!verification.ok) throw new Error(confirmation.error || "Verification failed.");
            if (confirmation.status === "granted") {
              setPaid(true);
              setMessage("Payment verified. Course access has been granted to your account.");
            } else {
              pending.current = result;
              setMessage("Payment is not yet captured. Access remains locked — check again, do not pay again.");
            }
          } catch (error) {
            pending.current = result;
            setMessage(`${error instanceof Error ? error.message : "Verification failed."} If you paid, check the payment again instead of creating another order.`);
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => { setBusy(false); setMessage("Checkout closed. Access is granted only after a captured payment is verified."); } },
      });
      checkout.on("payment.failed", () => { setBusy(false); setMessage("Payment failed. No access has been granted for this attempt."); });
      checkout.open();
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Checkout unavailable.");
    }
  }

  async function checkAgain() {
    const result = pending.current;
    if (!result) return;
    setBusy(true);
    try {
      const verification = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", ...result }),
      });
      const confirmation = await verification.json();
      if (confirmation.status === "granted") {
        setPaid(true);
        pending.current = null;
        setMessage("Payment verified. Course access has been granted.");
      } else {
        setMessage("Payment is still not captured. Wait a moment, then check again — do not pay again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const shown = breakdown || (course ? { pricePaise: course.price, discountPaise: 0, subtotalPaise: course.price, gstPaise: Math.round(course.price * 0.18), totalPaise: course.price + Math.round(course.price * 0.18) } : null);

  return (
    <>
      <SiteNav />
      <main style={pageWrap}>
        <p style={{ letterSpacing: 3, fontSize: 12, fontWeight: 700, color: "#0f766e" }}>CHECKOUT</p>
        <h1 style={{ fontSize: 36, margin: "12px 0" }}>Secure checkout</h1>
        {!razorpayConfigured && (
          <p style={{ ...cardStyle, background: "#fef3c7" }}>
            <strong>Payment setup pending.</strong> Razorpay keys are not configured yet, so paid
            checkout is not available. Free courses still unlock instantly. No payment has been started.
          </p>
        )}
        {loading ? <p>Loading courses…</p> : !courses.length ? (
          <p style={cardStyle}>Courses coming soon. No published courses are available to buy yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
            <section style={cardStyle}>
              <label style={{ display: "block", marginBottom: 16 }}>
                Course
                <select style={inputStyle} value={course?.slug || ""} onChange={(e) => { setCourseSlug(e.target.value); setBreakdown(null); setPromoMessage(""); }}>
                  {courses.map((c) => <option key={c.id} value={c.slug}>{c.title} — {money(c.price)}</option>)}
                </select>
              </label>
              <form onSubmit={quote}>
                <label style={{ display: "block", marginBottom: 16 }}>
                  Promo code (optional)
                  <input style={inputStyle} value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} maxLength={40} placeholder="e.g. WELCOME10" />
                </label>
                <button type="submit" style={{ ...buttonStyle, background: "#17253b" }}>Apply promo</button>
              </form>
              {promoMessage && <p role="status">{promoMessage}</p>}
              {!signedIn && (
                <p>
                  Please <Link href={`/login?next=${encodeURIComponent(`/checkout?course=${course?.slug || ""}`)}`}>log in</Link> or{" "}
                  <Link href="/signup">sign up</Link> before paying, so the course is linked to your account.
                </p>
              )}
              <p style={{ fontSize: 13, color: "#526174", lineHeight: 1.7 }}>
                Access is granted only after a verified captured Razorpay payment. Never pay twice for
                the same order — use “Check payment again” if verification is interrupted.
              </p>
            </section>
            <aside style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Price breakdown</h2>
              {shown && course && (
                <div style={{ lineHeight: 2.2 }}>
                  <p style={{ display: "flex", justifyContent: "space-between", margin: 0 }}><span>Course price</span><strong>{money(shown.pricePaise)}</strong></p>
                  <p style={{ display: "flex", justifyContent: "space-between", margin: 0 }}><span>Promo discount</span><strong>− {money(shown.discountPaise)}</strong></p>
                  <p style={{ display: "flex", justifyContent: "space-between", margin: 0 }}><span>Subtotal</span><strong>{money(shown.subtotalPaise)}</strong></p>
                  <p style={{ display: "flex", justifyContent: "space-between", margin: 0 }}><span>GST (18%)</span><strong>{money(shown.gstPaise)}</strong></p>
                  <hr />
                  <p style={{ display: "flex", justifyContent: "space-between", margin: 0, fontSize: 20 }}><span>Total</span><strong>{money(shown.totalPaise)}</strong></p>
                </div>
              )}
              <button onClick={() => void pay()} disabled={busy || paid || !course || !razorpayConfigured} style={{ ...buttonStyle, width: "100%", marginTop: 16 }}>
                {paid ? "Access granted ✓" : busy ? "Please wait…" : !razorpayConfigured ? "Payment setup pending" : "Pay securely with Razorpay →"}
              </button>
              {pending.current && !paid && (
                <button onClick={() => void checkAgain()} disabled={busy} style={{ ...buttonStyle, width: "100%", marginTop: 12, background: "#17253b" }}>
                  Check payment again
                </button>
              )}
              {message && <p role="status">{message}</p>}
            </aside>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
