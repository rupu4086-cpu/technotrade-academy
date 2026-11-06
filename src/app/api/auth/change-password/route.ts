// POST /api/auth/change-password — signed-in user changes their own password.
import { NextResponse } from "next/server";
import { getSession, verifyPassword, hashPassword } from "@/lib/auth";
import { sb, getUserById, ConfigError } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const body = await request.json().catch(() => null);
    const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const next = typeof body?.newPassword === "string" ? body.newPassword : "";
    if (next.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
    const user = await getUserById(session.sub);
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if (!verifyPassword(current, user.password_hash))
      return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
    await sb(`users?id=eq.${user.id}`, {
      method: "PATCH",
      body: { password_hash: hashPassword(next), updated_at: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ConfigError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "Password could not be changed." }, { status: 500 });
  }
}
