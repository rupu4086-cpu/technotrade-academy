// Password auth for the public site.
//
// Signup creates a real row in the Supabase `users` table with a salted
// scrypt password hash (never a plain password). Login verifies the hash.
// The session is the academy's own HttpOnly cookie `academy_session`:
// base64url(JSON session) + "." + base64url(HMAC-SHA256(payload,
// SESSION_SECRET)), the same cookie format the OTP sign-in route issues,
// so both sign-in methods land on one session. Admin role is granted only
// when the verified email matches ADMIN_EMAIL.
import "server-only";
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { getUserByEmail, type DbUser } from "./supabase";

export type Session = { sub: string; email: string; name: string; role: string; exp: number };

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_COOKIE = "academy_session";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Sign-in is not configured (SESSION_SECRET).");
  return secret;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split(":");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function roleFor(email: string): string {
  const admin = process.env.ADMIN_EMAIL;
  return admin && email.toLowerCase() === admin.trim().toLowerCase() ? "admin" : "student";
}

export async function issueSession(user: DbUser): Promise<void> {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email.toLowerCase(),
      name: user.name,
      role: roleFor(user.email),
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  (await cookies()).set(SESSION_COOKIE, `${payload}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  let secret: string;
  try {
    secret = sessionSecret();
  } catch {
    return null;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    return typeof value.sub === "string" && value.sub && typeof value.email === "string" &&
      value.exp > Date.now() / 1000
      ? value
      : null;
  } catch {
    return null;
  }
}

export async function authenticate(email: string, password: string): Promise<DbUser> {
  const user = await getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("Incorrect email or password.");
  }
  return user;
}
