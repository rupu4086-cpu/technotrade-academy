// POST /api/auth/login — email + password login.
import { NextResponse } from "next/server";
import { authenticate, issueSession } from "@/lib/auth";
import { ConfigError } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    const user = await authenticate(email, password);
    await issueSession(user);
    return NextResponse.json({ ok: true, email: user.email });
  } catch (error) {
    if (error instanceof ConfigError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Log in failed." }, { status: 401 });
  }
}
