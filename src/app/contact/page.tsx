// src/app/contact/page.tsx
"use client";

import { useState, type FormEvent } from "react";

const supportEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@technotrade.academy";

export default function ContactPage() {
  const [status, setStatus] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const topic = String(data.get("topic") || "");
    const message = String(data.get("message") || "").trim();

    if (name.length < 2 || message.length < 20) {
      setStatus("Enter a name of at least 2 characters and a message of at least 20 non-padding characters.");
      return;
    }

    const subject = encodeURIComponent(`${topic} enquiry — ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nReply email: ${email}\n\n${message}`);
    window.location.href = `mailto:${supportEmail}?subject=${subject}&body=${body}`;
    setStatus("Your email app has been requested. Review and send the draft to complete your enquiry. Nothing has been submitted through this website. If no app opens, email us directly.");
  }

  return (
    <main>
      <nav aria-label="Main navigation"><a href="/">TechnoTrade Academy</a><a href="/about">About</a></nav>
      <header>
        <p className="eyebrow">CONTACT</p>
        <h1>Ask before you enrol.</h1>
        <p>Questions about course content, access, or payments? We are here to help you make an informed decision.</p>
      </header>
      <div className="grid">
        <section className="card">
          <h2>Send an enquiry</h2>
          <p>This form prepares an email in your own email app. All fields are required.</p>
          <form onSubmit={submit}>
            <label htmlFor="name">Full name</label>
            <input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} />
            <label htmlFor="email">Reply email</label>
            <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
            <label htmlFor="topic">Topic</label>
            <select id="topic" name="topic" required defaultValue="">
              <option value="" disabled>Select a topic</option>
              <option>Course and instructors</option>
              <option>Access and learning support</option>
              <option>Payment or refund question</option>
              <option>Other</option>
            </select>
            <label htmlFor="message">Your message</label>
            <textarea id="message" name="message" rows={6} required minLength={20} maxLength={3000} aria-describedby="message-help" />
            <small id="message-help">20–3,000 characters. Never include passwords, card details, or OTPs.</small>
            <label className="consent">
              <input type="checkbox" required />
              <span>I agree to share these details by email so the academy can respond to this enquiry.</span>
            </label>
            <button type="submit">Prepare enquiry email</button>
            <p role="status" aria-live="polite">{status}</p>
          </form>
        </section>
        <aside className="card">
          <h2>Support</h2>
          <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          <h3>When to expect a reply</h3>
          <p>Please allow two business days for a response. This is a target, not a guaranteed turnaround; weekends and holidays may take longer.</p>
          <p>For payment questions, include your order reference and payment date—not sensitive banking information.</p>
          <h3>Your information</h3>
          <p>This page does not store form submissions. Sending the email shares its contents with the support inbox and the email providers involved.</p>
        </aside>
      </div>
      <section className="card faq">
        <h2>Frequently asked questions</h2>
        <details><summary>Is this suitable for beginners?</summary><p>The planned foundations curriculum starts with market basics. Request the full syllabus and prerequisites before enrolling.</p></details>
        <details><summary>Do you provide trading tips or guaranteed profits?</summary><p>No. The focus is education and risk management. Trading involves losses, and no outcome is guaranteed.</p></details>
        <details><summary>Where can I check access and refund terms?</summary><p>Final access duration, delivery details, and refund terms must be published before paid enrolment opens. Contact support if any purchase information is missing.</p></details>
        <details><summary>My payment status is unclear. Should I pay again?</summary><p>Do not immediately retry. Check your bank and contact support with the order reference so the transaction can be reconciled.</p></details>
      </section>
      <style>{`
        *{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#17253b;font-family:Arial,sans-serif}
        main{max-width:1040px;margin:auto;padding:24px}nav{display:flex;justify-content:space-between;gap:20px}
        a{color:#096b56;overflow-wrap:anywhere}header{padding:40px 0 24px;max-width:720px}.eyebrow{letter-spacing:3px;font-size:12px}
        h1{font-size:clamp(32px,5vw,48px)}p{line-height:1.7}.grid{display:grid;grid-template-columns:3fr 2fr;gap:24px}
        .card{background:white;padding:26px;border:1px solid #dae2ec;border-radius:16px}h2{margin-top:0}
        label{display:block;margin:18px 0 8px;font-weight:bold}input,select,textarea{width:100%;padding:12px;border:1px solid #8494aa;border-radius:8px;font:inherit}
        textarea{resize:vertical}small{display:block;margin-top:8px;line-height:1.5}.consent{display:flex;gap:10px;font-weight:normal;line-height:1.5}
        .consent input{width:auto;align-self:flex-start;margin-top:5px}button{padding:14px 20px;background:#096b56;color:white;border:0;border-radius:8px;font:inherit;cursor:pointer}
        :focus-visible{outline:3px solid #c48a25;outline-offset:3px}.faq{margin:24px 0}details{padding:16px 0;border-top:1px solid #dae2ec}
        summary{cursor:pointer;font-weight:bold}@media(max-width:720px){.grid{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}
