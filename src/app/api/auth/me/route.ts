// GET /api/auth/me — who is signed in (cookie session).
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ signedIn: false });
  return NextResponse.json({ signedIn: true, email: session.email, name: session.name, role: session.role });
}
