// Sign Up — name, email, password. Creates a real account in Supabase.
"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { SiteNav, SiteFooter, pageWrap, cardStyle, inputStyle, buttonStyle } from "@/lib/nav";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign up failed.");
      window.location.href = "/learn";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteNav />
      <main style={pageWrap}>
        <div style={{ maxWidth: 480, margin: "auto" }}>
          <h1 style={{ fontSize: 34 }}>Create your account</h1>
          <p style={{ lineHeight: 1.7, color: "#526174" }}>
            Your password is stored as a salted hash, never in plain text. No account is created until you submit this form.
          </p>
          <form onSubmit={submit} style={cardStyle}>
            <label style={{ display: "block", marginBottom: 16 }}>
              Full name
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={100} />
            </label>
            <label style={{ display: "block", marginBottom: 16 }}>
              Email address
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={254} />
            </label>
            <label style={{ display: "block", marginBottom: 16 }}>
              Password
              <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} />
              <small style={{ color: "#526174" }}>At least 8 characters.</small>
            </label>
            <button type="submit" style={buttonStyle} disabled={busy}>{busy ? "Creating your account…" : "Sign Up"}</button>
            {message && <p role="status" style={{ color: "#b91c1c" }}>{message}</p>}
          </form>
          <p style={{ marginTop: 16 }}>
            Already have an account? <Link href="/login">Log in</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
