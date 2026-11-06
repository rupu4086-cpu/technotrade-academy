// Account — profile, order history, password change.
"use client";

import { useState, type FormEvent } from "react";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Password changed." : data.error || "Could not change password.");
    if (response.ok) {
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  const input: React.CSSProperties = { width: "100%", padding: 12, border: "1px solid #8494aa", borderRadius: 8, font: "inherit" };
  return (
    <form onSubmit={submit}>
      <label style={{ display: "block", marginBottom: 12 }}>
        Current password
        <input style={input} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      <label style={{ display: "block", marginBottom: 12 }}>
        New password
        <input style={input} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
      </label>
      <button type="submit" style={{ padding: "12px 18px", background: "#0f766e", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
        Change password
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
