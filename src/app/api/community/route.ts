// Community API — GET lists posts, POST creates one (signed-in students
// only), DELETE removes your own post (or any post, for the owner).
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sb, ConfigError, type DbPost } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["Q&A", "Trade Setups", "Market Updates", "Discussion"];

export async function GET() {
  try {
    const posts = await sb<DbPost[]>("community_posts?select=*&order=created_at.desc&limit=100");
    const userIds = [...new Set(posts.map((p) => p.user_id))];
    const names = new Map<string, string>();
    for (const id of userIds) {
      const rows = await sb<{ id: string; name: string }[]>(`users?select=id,name&id=eq.${id}&limit=1`).catch(() => []);
      if (rows[0]) names.set(id, rows[0].name);
    }
    return NextResponse.json({
      posts: posts.map((p) => ({ id: p.id, category: p.category, content: p.content, created_at: p.created_at, author: names.get(p.user_id) || "Student" })),
    });
  } catch (error) {
    if (error instanceof ConfigError) return NextResponse.json({ posts: [], error: error.message }, { status: 503 });
    return NextResponse.json({ posts: [], error: "Community posts could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Please sign in to post." }, { status: 401 });
    const body = await request.json().catch(() => null);
    const category = typeof body?.category === "string" ? body.category : "Discussion";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!CATEGORIES.includes(category)) return NextResponse.json({ error: "Choose a valid category." }, { status: 400 });
    if (content.length < 2 || content.length > 2000) return NextResponse.json({ error: "Write a post of 2–2000 characters." }, { status: 400 });
    const created = await sb<DbPost[]>("community_posts", {
      method: "POST", prefer: "return=representation",
      body: { user_id: session.sub, category, content },
    });
    return NextResponse.json({ ok: true, post: created[0] });
  } catch (error) {
    if (error instanceof ConfigError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "Your post could not be saved." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const body = await request.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Missing post." }, { status: 400 });
    const rows = await sb<DbPost[]>(`community_posts?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
    const post = rows[0];
    if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    if (post.user_id !== session.sub && session.role !== "admin")
      return NextResponse.json({ error: "You can only delete your own posts." }, { status: 403 });
    await sb(`community_posts?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ConfigError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "Post could not be deleted." }, { status: 500 });
  }
}
