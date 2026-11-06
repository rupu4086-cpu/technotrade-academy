// Sign in with an email code (Supabase OTP), the same sign-in the Courses
// page uses. After the code is verified, the token is exchanged at
// /api/auth/session for the academy_session cookie, then the user is sent
// to the page they came from (default /learn). No password is used.

"use client";

import { useEffect, useState, type FormEvent } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [next, setNext] = useState("/learn");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("next");
    if (value && value.startsWith("/")) setNext(value);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Sign-in is temporarily unavailable.");
      const response = await fetch(
        `${url}/auth/v1/${sent ? "verify" : "otp"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key },
          body: JSON.stringify(
            sent
              ? { email, token: code, type: "email" }
              : { email, create_user: true },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          sent
            ? "The code is invalid or expired. Please try again."
            : "Unable to send a code. Please wait and try again.",
        );
      }
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
    <main style={{ maxWidth: 440, margin: "64px auto", padding: 24 }}>
      <h1>Sign in — TechnoTrade Academy</h1>
      <p>
        We email you a one-time code. No password is used. Admin access is
        only for the owner email configured for the academy.
      </p>
      <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <label>
          Email address
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={sent || busy}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {sent && (
          <label>
            Email code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={10}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Please wait…" : sent ? "Verify code" : "Email me a sign-in code"}
        </button>
        {sent && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSent(false);
              setCode("");
            }}
          >
            Use another email / resend
          </button>
        )}
      </form>
      {message && <p role="status">{message}</p>}
      <p>
        <a href="/">Back to home</a> · <a href="/courses">Browse courses</a>
      </p>
    </main>
  );
}
