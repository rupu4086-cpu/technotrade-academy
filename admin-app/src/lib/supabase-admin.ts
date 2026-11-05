// src/lib/supabase-admin.ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "technotrade_owner";
const SESSION_SECONDS = 8 * 60 * 60;
let client: SupabaseClient | undefined;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function adminDb(): SupabaseClient {
  client ??= createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    },
  );
  return client;
}

function ownerEmail() {
  return env("ADMIN_EMAIL").trim().toLowerCase();
}

function signature(payload: string) {
  const key = createHmac("sha256", env("SUPABASE_SERVICE_ROLE_KEY"))
    .update(JSON.stringify(["technotrade-admin-session-v1", ownerEmail(), env("ADMIN_PASSWORD_HASH")]))
    .digest();
  return createHmac("sha256", key).update(payload).digest("hex");
}

function constantEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hasOwnerSession(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 2048) return false;
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return false;
  if (!constantEqual(signature(payload), mac)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return (
      session.email === ownerEmail() &&
      Number.isInteger(session.exp) &&
      session.exp > now &&
      session.exp <= now + SESSION_SECONDS
    );
  } catch {
    return false;
  }
}

export async function requireOwner(): Promise<void> {
  if (!(await hasOwnerSession())) redirect("/");
}

// Invoke only from a Server Action. Never expose this module through a client component.
export async function signInOwner(form: FormData): Promise<boolean> {
  const emailValue = form.get("email");
  const passwordValue = form.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";
  if (!email || email.length > 320 || !password || password.length > 1024) return false;

  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/i.exec(env("ADMIN_PASSWORD_HASH"));
  if (!match) throw new Error("ADMIN_PASSWORD_HASH must use the documented scrypt format.");

  // Always perform password derivation, including for an incorrect email.
  const derived = await derivePassword(password, match[1]);
  const passwordMatches = timingSafeEqual(derived, Buffer.from(match[2], "hex"));
  const emailMatches = constantEqual(email, ownerEmail());
  if (!passwordMatches || !emailMatches) return false;

  const payload = Buffer.from(JSON.stringify({
    email: ownerEmail(),
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  })).toString("base64url");

  (await cookies()).set(COOKIE, `${payload}.${signature(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return true;
}

export async function signOutOwner(): Promise<void> {
  (await cookies()).set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
