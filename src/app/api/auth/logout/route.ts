// POST /api/auth/logout — clear the session cookie.
import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await clearSession();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
