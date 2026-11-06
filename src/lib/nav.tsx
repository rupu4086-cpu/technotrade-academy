// Shared site header and footer (Astra design: deep navy, off-white, teal).
// Client component: it asks /api/auth/me for the signed-in state instead
// of reading the session cookie directly (server-only code cannot be
// imported by the client pages that use this nav).
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function SiteNav() {
  const [session, setSession] = useState<{ email: string } | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.signedIn) setSession({ email: d.email }); })
      .catch(() => undefined);
  }, []);
  return (
    <header style={{ background: "#0b1f3a", color: "#f5f7fb" }}>
      <div
        style={{
          maxWidth: 1200, margin: "auto", padding: "0 24px", minHeight: 64,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ fontWeight: 700, fontSize: 17, color: "#f5f7fb", textDecoration: "none" }}>
          ↗ TechnoTrade <span style={{ color: "#14b8a6" }}>Academy</span>
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 14, flexWrap: "wrap" }} aria-label="Main navigation">
          <Link href="/courses" style={{ color: "#f5f7fb", textDecoration: "none" }}>Courses</Link>
          <Link href="/pricing" style={{ color: "#f5f7fb", textDecoration: "none" }}>Pricing</Link>
          <Link href="/community" style={{ color: "#f5f7fb", textDecoration: "none" }}>Community</Link>
          <Link href="/about" style={{ color: "#f5f7fb", textDecoration: "none" }}>About</Link>
          <Link href="/contact" style={{ color: "#f5f7fb", textDecoration: "none" }}>Contact</Link>
          {session ? (
            <>
              <Link href="/learn" style={{ color: "#f5f7fb", textDecoration: "none" }}>My Learning</Link>
              <Link href="/account" style={{ color: "#f5f7fb", textDecoration: "none" }}>Account</Link>
              <form action="/api/auth/logout" method="post" style={{ margin: 0 }}>
                <button type="submit" style={{ background: "transparent", border: "1px solid #14b8a6", color: "#f5f7fb", borderRadius: 6, padding: "8px 14px", cursor: "pointer" }}>
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" style={{ color: "#f5f7fb", textDecoration: "none" }}>Log in</Link>
              <Link
                href="/signup"
                style={{ background: "#0f766e", color: "#fff", textDecoration: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 600 }}
              >
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer style={{ background: "#081426", color: "#a3b0a7", marginTop: 64 }}>
      <div style={{ maxWidth: 1200, margin: "auto", padding: "32px 24px", fontSize: 12, lineHeight: 1.8 }}>
        <p>
          <strong style={{ color: "#f5f7fb" }}>Risk disclaimer:</strong> All content is for
          educational purposes only and is not investment, financial, legal, or tax advice.
          Trading stocks, cryptocurrencies, and forex involves substantial risk, including the
          loss of your entire capital. Past performance does not predict future results.
        </p>
        <p>© {new Date().getFullYear()} TechnoTrade Academy · Learn thoughtfully. Trade responsibly.</p>
      </div>
    </footer>
  );
}

export const pageWrap: React.CSSProperties = { maxWidth: 1080, margin: "auto", padding: "32px 24px" };
export const cardStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #dae2ec", borderRadius: 16, padding: 24,
};
export const inputStyle: React.CSSProperties = {
  width: "100%", padding: 12, border: "1px solid #8494aa", borderRadius: 8, font: "inherit",
};
export const buttonStyle: React.CSSProperties = {
  padding: "14px 20px", background: "#0f766e", color: "#fff", border: 0, borderRadius: 8,
  font: "inherit", cursor: "pointer", fontWeight: 600,
};
