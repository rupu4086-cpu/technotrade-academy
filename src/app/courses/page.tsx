// src/app/courses/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Category = "All" | "Stock" | "Crypto" | "Forex" | "Psychology" | "Advanced";
type Course = { id: string; title: string; category: Exclude<Category, "All">; description: string; price: number; level: string };
type PaymentResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: "payment.failed", callback: () => void): void };
type RazorpayConstructor = new (options: {
  key: string; amount: number; currency: string; name: string; description: string;
  order_id: string; prefill?: { email: string }; theme: { color: string };
  handler: (result: PaymentResult) => void;
  modal: { ondismiss: () => void };
}) => RazorpayInstance;

declare global { interface Window { Razorpay?: RazorpayConstructor } }

const categories: Category[] = ["All", "Stock", "Crypto", "Forex", "Psychology", "Advanced"];
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);

let scriptPromise: Promise<void> | undefined;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => window.Razorpay ? resolve() : reject(new Error("Checkout could not load."));
    script.onerror = () => { script.remove(); scriptPromise = undefined; reject(new Error("Unable to load secure checkout. Please retry.")); };
    document.head.appendChild(script);
  });
}

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [category, setCategory] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Course | null>(null);
  const [promo, setPromo] = useState("");
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<{ email: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [owned, setOwned] = useState<string[]>([]);
  const [pending, setPending] = useState<PaymentResult | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("category");
    if (categories.includes(initial as Category)) setCategory(initial as Category);
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => { if (data.signedIn) { setSession({ email: data.email }); setEmail(data.email); } })
      .catch(() => undefined);
    fetch("/api/checkout", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load courses. Please refresh.");
        setCourses((await response.json()).courses);
      })
      .catch(error => { if (error.name !== "AbortError") setMessage(error.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);


  async function api(body: object) {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Checkout failed. Please try again.");
    return data;
  }

  async function verify(result: PaymentResult) {
    setBusy(true);
    setPending(result);
    try {
      const data = await api({ action: "verify", ...result });
      if (data.status === "granted") {
        setOwned(current => [...new Set([...current, data.courseId])]);
        setPending(null);
        setMessage("Payment verified. Course access has been granted to your account.");
      } else {
        setMessage("Your payment is not yet captured. Access remains locked. Wait a moment, then check again—do not pay again.");
      }
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : "Verification failed."} If you paid, check the payment again instead of creating another order.`);
    } finally { setBusy(false); }
  }

  async function checkout() {
    if (!selected || !session) return;
    setBusy(true); setMessage("");
    try {
      await loadCheckout();
      const data = await api({ action: "create", courseId: selected.id, promo });
      if (data.status === "granted") {
        setOwned(current => [...new Set([...current, selected.id])]);
        setMessage("You already have access to this course."); setBusy(false); return;
      }
      const instance = new window.Razorpay!({
        key: data.key, order_id: data.orderId, amount: data.amount, currency: data.currency,
        name: "TechnoTrade Academy", description: selected.title,
        prefill: { email: session.email }, theme: { color: "#355b2b" },
        handler: result => { void verify(result); },
        modal: { ondismiss: () => { setBusy(false); setMessage("Checkout closed. Access is granted only after a captured payment is verified."); } },
      });
      // Native dialogs sit above third-party checkout overlays.
      dialog.current?.close();
      instance.on("payment.failed", () => { setBusy(false); setMessage("Payment failed. No access has been granted for this attempt."); });
      instance.open();
    } catch (error) { setBusy(false); setMessage(error instanceof Error ? error.message : "Checkout unavailable."); }
  }

  const visible = courses.filter(course =>
    (category === "All" || course.category === category) &&
    `${course.title} ${course.description}`.toLowerCase().includes(query.toLowerCase().trim()),
  );

  return (
    <main className="catalog">
      <header><Link href="/" className="brand">↗ TechnoTrade Academy</Link><span><Link href="/pricing">Pricing</Link> · <Link href="/community">Community</Link> · <Link href="/learn">My Learning</Link> · <Link href="/login">Log in</Link> · <Link href="/signup">Sign Up</Link></span></header>
      <section className="heading"><p className="eyebrow">INVEST IN YOUR UNDERSTANDING</p><h1>A stronger process<br />starts with <em>learning.</em></h1><p>Explore focused courses for every stage of your trading education.<br />No signals. No promises of profit. Just a clearer way forward.</p></section>
      <section aria-label="Course catalog">
        <div className="toolbar">
          <div className="filters" aria-label="Filter courses">{categories.map(item => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
          <label className="search"><span className="sr-only">Search courses</span><input type="search" placeholder="Search courses…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        </div>
        <p className="count" aria-live="polite">{loading ? "Loading courses…" : `${visible.length} courses • Self-paced • English`}</p>
        <div className="grid">
          {visible.map((course, index) => (
            <article className="card" key={course.id}>
              <div className={`art art-${course.category.toLowerCase()}`} aria-hidden="true"><span className="art-label">{course.category.toUpperCase()} / FIELD NOTES</span><span className="art-symbol">{["↗", "◈", "⇄", "◎", "⌁"][categories.indexOf(course.category) - 1]}</span><span className="art-number">0{index + 1}</span></div>
              <div className="card-content"><div className="meta"><span>{course.category}</span><span>{course.level}</span></div><h2>{course.title}</h2><p>{course.description}</p><div className="card-bottom"><strong>{money(course.price)}<small>One-time payment</small></strong><button onClick={() => { setSelected(course); setPromo(""); setMessage(""); dialog.current?.showModal(); }}>{owned.includes(course.id) ? "Access granted ✓" : "View & enrol ↗"}</button></div></div>
            </article>
          ))}
        </div>
        {!loading && !courses.length && <p className="empty">Courses coming soon. No published courses are available yet — the owner adds courses from the separate admin app.</p>}
        {!loading && courses.length > 0 && !visible.length && <p className="empty">No courses match your search. Try another topic or filter.</p>}
      </section>
      <div className="status" aria-live="polite">{message}</div>
      {pending && <button className="primary" disabled={busy} onClick={() => void verify(pending)}>{busy ? "Checking…" : "Check payment again"}</button>}
      <aside className="note"><span>↗</span><div><h2>Not sure where to start?</h2><p>Begin with foundations and risk management before exploring advanced strategies.</p></div><Link href="/#contact">Ask a question →</Link></aside>
      <footer>Education only—not investment advice. Trading involves substantial risk. Returns are not guaranteed.<br /><Link href="/#contact">Contact & enquiries</Link> · © {new Date().getFullYear()} TechnoTrade Academy</footer>

      <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); }}>
        <button className="close" aria-label="Close checkout" disabled={busy} onClick={() => dialog.current?.close()}>×</button>
        <p className="eyebrow">YOUR NEXT CHAPTER</p><h2>{selected?.title}</h2><p>{selected?.description}</p><p className="price">{selected && money(selected.price)} <small>INR · One-time payment</small></p>
        {selected && owned.includes(selected.id) ? <p>Your account has access to this course.</p> : <>
          {!session ? <><p>Sign in securely to associate your purchase with your account.</p><p><Link href="/login">Log in</Link> or <Link href="/signup">create an account</Link> — it takes a minute, and your course will be linked to your account.</p></> : <><p>Signed in as {session.email}</p><label>Promo code (optional)<input value={promo} maxLength={40} onChange={event => setPromo(event.target.value.toUpperCase())} disabled={busy} /></label><p className="fine">Promo codes are validated on the server. Review the final amount in Razorpay before paying. Access stays locked until payment is verified as captured.</p><button className="primary" disabled={busy || !!pending} onClick={() => void checkout()}>{busy ? "Preparing checkout…" : "Continue to Razorpay ↗"}</button></>}
        </>}
        <p role="status" className="fine">{message}</p>
      </dialog>
      <style jsx global>{`
        *{box-sizing:border-box}body{margin:0;background:#0d1412;color:#f2f5ee;font-family:Arial,Helvetica,sans-serif}a{color:inherit;text-decoration:none}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:wait}button:focus-visible,a:focus-visible{outline:2px solid #bef264;outline-offset:4px}.catalog{max-width:1200px;margin:auto;padding:0 32px}header{display:flex;justify-content:space-between;align-items:center;gap:20px;height:100px;font-size:13px;border-bottom:1px solid #2d382f}.brand{font-size:18px;font-weight:700;letter-spacing:-.5px}.heading{padding:65px 0 45px}.eyebrow{color:#bef264;font-size:10px;font-weight:700;letter-spacing:2px}h1{font-size:clamp(40px,5vw,62px);font-weight:500;letter-spacing:-2.5px;line-height:1.1;margin:22px 0}em{color:#bef264;font-style:normal}.heading>p:last-child{color:#a3b0a7;line-height:1.8;font-size:15px}.toolbar{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #354037;padding-bottom:23px}.filters{display:flex;gap:8px;flex-wrap:wrap}.filters button{border:1px solid #354037;border-radius:6px;background:transparent;color:#b7c2ba;padding:10px 16px;font-size:12px}.filters button[aria-pressed=true]{background:#bef264;color:#142016;border-color:#bef264}input{background:#17211b;color:#f2f5ee;border:1px solid #3b493e;border-radius:5px;padding:12px;width:100%;outline:none}input:focus{border-color:#bef264;box-shadow:0 0 0 1px #bef264}.search{width:230px;flex-shrink:0;margin:0}.count{color:#9aa89e;font-size:11px;margin:24px 0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.card{border:1px solid #354037;border-radius:10px;overflow:hidden;background:#141e18;display:flex;flex-direction:column}.art{height:175px;position:relative;overflow:hidden;background:repeating-linear-gradient(0deg,transparent,transparent 30px,#ffffff08 31px),repeating-linear-gradient(90deg,transparent,transparent 30px,#ffffff08 31px),#253823;color:#c5ed99}.art-crypto{background-color:#292b42;color:#b9b9ff}.art-forex{background-color:#193b37;color:#92d9cc}.art-psychology{background-color:#3c3026;color:#edc196}.art-advanced{background-color:#31323b;color:#c7d4f6}.art-label{position:absolute;top:20px;left:22px;font-size:8px;letter-spacing:1.6px}.art-symbol{position:absolute;right:35px;top:0;font-size:160px;line-height:1.2;transform:rotate(-12deg)}.art-number{position:absolute;bottom:20px;left:22px;font-size:12px;opacity:.7}.card-content{padding:24px;flex:1;display:flex;flex-direction:column}.meta{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#b5c3b8}.meta span:first-child{color:#bef264}h2{font-size:21px;font-weight:500;letter-spacing:-.6px;line-height:1.3}.card p{font-size:13px;line-height:1.8;color:#a3b0a7;margin:0 0 25px}.card-bottom{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;border-top:1px solid #354037;padding-top:20px}.card-bottom strong{font-size:21px;font-weight:500}.card-bottom small{display:block;font-size:9px;color:#a3b0a7;margin-top:6px}.card-bottom button{background:transparent;border:1px solid #56634c;color:#d0efad;border-radius:5px;padding:10px;font-size:11px}.card-bottom button:hover{background:#253823}.note{display:flex;align-items:center;gap:25px;margin:55px 0;padding:30px;background:#19241b;border:1px solid #354037;border-radius:8px}.note>span{font-size:35px;color:#bef264}.note h2{margin:0 0 10px;font-size:20px}.note p{font-size:13px;color:#a3b0a7;margin:0;line-height:1.6}.note a{font-size:13px;margin-left:auto;white-space:nowrap}footer{border-top:1px solid #354037;padding:28px 0 40px;font-size:11px;line-height:2;color:#9aa89e}.status{font-size:14px;line-height:1.7;margin-top:24px;color:#d0efad}.empty{padding:50px 0;color:#a3b0a7}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}dialog{background:#17211b;color:#f2f5ee;border:1px solid #53614b;border-radius:12px;padding:32px;width:min(480px,calc(100% - 32px));max-height:90vh}dialog::backdrop{background:#000b}dialog h2{padding-right:20px}dialog p{font-size:14px;line-height:1.7;color:#b8c4ba}.close{position:absolute;right:18px;top:14px;background:none;border:0;color:#fff;font-size:28px}label{display:flex;flex-direction:column;gap:8px;font-size:12px;margin:18px 0}.primary{background:#bef264;color:#172112;border:0;border-radius:5px;font-weight:700;padding:14px 20px}.secondary{display:block;background:none;border:0;color:#bfccbd;font-size:12px;margin-top:15px;padding:6px 0}dialog .price{color:#bef264;font-size:24px}dialog .price small{display:block;color:#a3b0a7;font-size:11px}dialog .fine{font-size:11px;line-height:1.8}@media(max-width:1000px){.grid{grid-template-columns:repeat(2,1fr)}.toolbar{flex-direction:column}.search{width:100%}}@media(max-width:600px){.catalog{padding:0 20px}.brand{font-size:14px}header{height:80px;font-size:11px}.heading{padding-top:40px}h1{letter-spacing:-1.5px}.grid{grid-template-columns:1fr}.filters button{padding:9px 12px}.note{align-items:flex-start;flex-wrap:wrap;padding:22px}.note>div{flex:1}.note a{margin-left:0;width:100%}.art{height:180px}}
      `}</style>
    </main>
  );
}
