// Log in — email + password (primary). Email-code sign-in is still
// available as an alternative, via the OTP route used before.
"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { SiteNav, SiteFooter, pageWrap, cardStyle, inputStyle, buttonStyle } from "@/lib/nav";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [otpMode, setOtpMode] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [next, setNext] = useState("/learn");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("next");
    if (value && value.startsWith("/")) setNext(value);
  }, []);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Log in failed.");
      window.location.href = next;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Log in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Email-code sign-in is temporarily unavailable.");
      const response = await fetch(`${url}/auth/v1/${sent ? "verify" : "otp"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify(sent ? { email, token: code, type: "email" } : { email, create_user: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(sent ? "The code is invalid or expired." : "Unable to send a code.");
      if (!sent) {
        setSent(true);
        setMessage("Check your email for your sign-in code.");
        return;
      }
      if (!data.access_token) throw new Error("Sign-in could not be completed.");
      const session = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: data.access_token }),
      });
      if (!session.ok) throw new Error("Sign-in could not be completed.");
      window.location.href = next;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteNav />
      <main style={pageWrap}>
        <div style={{ maxWidth: 480, margin: "auto" }}>
          <h1 style={{ fontSize: 34 }}>Welcome back</h1>
          <p style={{ lineHeight: 1.7, color: "#526174" }}>Log in with your email and password to continue learning.</p>
          {!otpMode ? (
            <form onSubmit={submitPassword} style={cardStyle}>
              <label style={{ display: "block", marginBottom: 16 }}>
                Email address
                <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
              <label style={{ display: "block", marginBottom: 16 }}>
                Password
                <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </label>
              <button type="submit" style={buttonStyle} disabled={busy}>{busy ? "Please wait…" : "Log in"}</button>
              {message && <p role="status" style={{ color: "#b91c1c" }}>{message}</p>}
              <p>
                <button type="button" onClick={() => { setOtpMode(true); setMessage(""); }} style={{ background: "none", border: 0, color: "#0f766e", cursor: "pointer", padding: 0, font: "inherit" }}>
                  Sign in with an email code instead
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={submitOtp} style={cardStyle}>
              <label style={{ display: "block", marginBottom: 16 }}>
                Email address
                <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required disabled={sent || busy} />
              </label>
              {sent && (
                <label style={{ display: "block", marginBottom: 16 }}>
                  Email code
                  <input style={inputStyle} inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} />
                </label>
              )}
              <button type="submit" style={buttonStyle} disabled={busy}>{busy ? "Please wait…" : sent ? "Verify code" : "Email me a sign-in code"}</button>
              {message && <p role="status">{message}</p>}
              <p>
                <button type="button" onClick={() => { setOtpMode(false); setSent(false); setCode(""); setMessage(""); }} style={{ background: "none", border: 0, color: "#0f766e", cursor: "pointer", padding: 0, font: "inherit" }}>
                  Back to password sign-in
                </button>
              </p>
            </form>
          )}
          <p style={{ marginTop: 16 }}>
            New here? <Link href="/signup">Create an account</Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
