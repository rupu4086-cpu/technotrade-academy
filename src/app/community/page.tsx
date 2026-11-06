// Community — trader community for signed-in students.
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { SiteNav, SiteFooter, pageWrap, cardStyle, inputStyle, buttonStyle } from "@/lib/nav";

type Post = { id: string; category: string; content: string; created_at: string; author: string };
const CATEGORIES = ["Q&A", "Trade Setups", "Market Updates", "Discussion"];

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState("Discussion");
  const [filter, setFilter] = useState("All");
  const [content, setContent] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const response = await fetch("/api/community");
    const data = await response.json();
    setPosts(data.posts || []);
    setLoading(false);
    if (data.error) setMessage(data.error);
  }

  useEffect(() => {
    void load();
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setSignedIn(Boolean(d.signedIn))).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, content }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Could not post.");
      return;
    }
    setContent("");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this post?")) return;
    const response = await fetch("/api/community", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      const data = await response.json();
      setMessage(data.error || "Could not delete.");
      return;
    }
    await load();
  }

  const visible = filter === "All" ? posts : posts.filter((p) => p.category === filter);

  return (
    <>
      <SiteNav />
      <main style={pageWrap}>
        <p style={{ letterSpacing: 3, fontSize: 12, fontWeight: 700, color: "#0f766e" }}>COMMUNITY</p>
        <h1 style={{ fontSize: 40, margin: "12px 0" }}>Trader Community</h1>
        <p style={{ lineHeight: 1.7, color: "#526174", maxWidth: 640 }}>
          Ask questions, share trade setups and market updates with other students. Only signed-in
          students can post. Be respectful — no signals, no profit promises.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "24px 0" }}>
          {["All", ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              style={{
                padding: "10px 16px", borderRadius: 6, cursor: "pointer",
                background: filter === c ? "#0f766e" : "#fff", color: filter === c ? "#fff" : "#17253b",
                border: "1px solid #dae2ec",
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {signedIn ? (
          <form onSubmit={submit} style={{ ...cardStyle, marginBottom: 24 }}>
            <label style={{ display: "block", marginBottom: 12 }}>
              Category
              <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ display: "block", marginBottom: 12 }}>
              Your post
              <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={content} onChange={(e) => setContent(e.target.value)} required minLength={2} maxLength={2000} placeholder="Share a question, a setup you are studying, or a market update…" />
            </label>
            <button type="submit" style={buttonStyle}>Post</button>
          </form>
        ) : (
          <p style={cardStyle}>
            <Link href="/login">Log in</Link> or <Link href="/signup">sign up</Link> to post in the community.
          </p>
        )}
        {message && <p role="status">{message}</p>}

        {loading ? <p>Loading posts…</p> : !visible.length ? (
          <p style={cardStyle}>No community posts yet. Be the first to start a discussion.</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {visible.map((post) => (
              <article key={post.id} style={cardStyle}>
                <p style={{ margin: "0 0 6px", color: "#0f766e", fontWeight: 700, fontSize: 13 }}>
                  {post.category} · {post.author} · {new Date(post.created_at).toLocaleString("en-IN")}
                </p>
                <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{post.content}</p>
                {signedIn && (
                  <button onClick={() => void remove(post.id)} style={{ background: "none", border: 0, color: "#b91c1c", cursor: "pointer", padding: "8px 0 0", font: "inherit" }}>
                    Delete
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
        <section style={{ ...cardStyle, marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Community guidelines</h2>
          <ul style={{ lineHeight: 1.9 }}>
            <li>Education and discussion only — no buy/sell recommendations.</li>
            <li>No guaranteed returns, no screenshots of profits as proof.</li>
            <li>Be respectful. Posts that break the rules can be removed.</li>
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
