// POST /api/auth/session — exchange a verified Supabase access token for
// the academy's own session cookie (`academy_session`).
//
// The course-detail, My Learning and hidden-admin pages expect an
// `academy_session` cookie: base64url(JSON session) + "." +
// base64url(HMAC-SHA256(payload, SESSION_SECRET)). Nothing in the repo
// issued that cookie before this route existed, so those pages always
// redirected to a /login page that did not exist either. This route closes
// that loop using Supabase email OTP (the same sign-in the Courses page
// already uses): the browser gets a Supabase access token, posts it here,
// the server re-verifies it with Supabase, and only then issues the cookie.
// Role is "admin" only when the verified email matches ADMIN_EMAIL;
// otherwise "student". No password is ever accepted or stored here.

import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const sessionSecret = process.env.SESSION_SECRET;
    if (!url || !anonKey || !sessionSecret) {
      return NextResponse.json(
        { error: "Sign-in is not configured." },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => null);
    const token =
      body && typeof body.access_token === "string" ? body.access_token : "";
    if (!token || token.length > 8192) {
      return NextResponse.json({ error: "Invalid session." }, { status: 400 });
    }

    // Re-verify the token server-side; never trust a client claim alone.
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Your session has expired. Sign in again." },
        { status: 401 },
      );
    }
    const user = await response.json();
    if (
      typeof user.id !== "string" ||
      !user.id ||
      typeof user.email !== "string" ||
      !user.email ||
      !user.email_confirmed_at
    ) {
      return NextResponse.json(
        { error: "Please verify your email." },
        { status: 401 },
      );
    }

    const email = user.email.toLowerCase();
    const role =
      process.env.ADMIN_EMAIL &&
      email === process.env.ADMIN_EMAIL.trim().toLowerCase()
        ? "admin"
        : "student";
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        email,
        role,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", sessionSecret)
      .update(payload)
      .digest("base64url");

    (await cookies()).set("academy_session", `${payload}.${signature}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return NextResponse.json({ ok: true, role });
  } catch {
    return NextResponse.json(
      { error: "Sign-in could not be completed." },
      { status: 500 },
    );
  }
}
