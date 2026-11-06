// POST /api/auth/signup — create a real account in the Supabase users table.
import { NextResponse } from "next/server";
import { sb, getUserByEmail, ConfigError } from "@/lib/supabase";
import { hashPassword, issueSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

    const existing = await getUserByEmail(email);
    if (existing) return NextResponse.json({ error: "An account with this email already exists. Please log in." }, { status: 409 });

    const created = await sb<{ id: string; email: string; name: string; role: string }[]>("users", {
      method: "POST", prefer: "return=representation",
      body: { email, name, password_hash: hashPassword(password), role: "student" },
    });
    const user = created[0];
    if (!user) return NextResponse.json({ error: "Account could not be created." }, { status: 500 });
    await issueSession(user as never);
    return NextResponse.json({ ok: true, email: user.email });
  } catch (error) {
    if (error instanceof ConfigError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "Sign up could not be completed. Please try again." }, { status: 500 });
  }
}
