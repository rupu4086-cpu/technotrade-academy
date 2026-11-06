// Supabase data layer for the public site.
//
// Uses Supabase PostgREST (the REST API over the 15 tables already created
// in the owner's Supabase project). No Prisma migrations are run here and
// no new tables are created: the tables are courses, course_modules,
// course_lessons, enrollments, lesson_progress, orders, payments,
// promo_codes, promo_redemptions, webhook_events, enquiries, settings,
// ads and community_posts, plus users.
//
// Server-side calls use SUPABASE_SERVICE_ROLE_KEY when set, otherwise the
// anon key. Row Level Security is OFF on these tables (pre-existing state
// in the owner's project) — policies must be added in Supabase before a
// live deployment is trusted with real user data. Nothing here hardcodes
// any key: all credentials come from environment variables.
import "server-only";

export class ConfigError extends Error {}

function baseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new ConfigError("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL).");
  return url.replace(/\/$/, "");
}

function apiKey(): string {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new ConfigError("Supabase is not configured (no API key).");
  return key;
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(apiKeySafe());
}
function apiKeySafe(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export async function sb<T>(
  path: string,
  init?: { method?: string; body?: unknown; prefer?: string },
): Promise<T> {
  const response = await fetch(`${baseUrl()}/rest/v1/${path}`, {
    method: init?.method || "GET",
    headers: {
      apikey: apiKey(),
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init?.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase request failed (${response.status}): ${text.slice(0, 200)}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type DbUser = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  created_at?: string;
};

export type DbCourse = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  level: string;
  price_paise: number;
  original_price_paise: number | null;
  duration: string | null;
  lessons_count: number;
  language: string;
  status: string;
  instructor: string | null;
  thumbnail_url?: string | null;
  banner_url?: string | null;
};

export type DbModule = { id: string; course_id: string; title: string; position: number };
export type DbLesson = {
  id: string;
  course_id: string;
  module_id: string | null;
  title: string;
  video_url: string | null;
  video_type: string;
  duration_seconds: number | null;
  is_free_preview: boolean;
  position: number;
};
export type DbEnrollment = { id: string; user_id: string; course_id: string; order_id: string | null };
export type DbOrder = {
  id: string;
  user_id: string;
  course_id: string;
  amount_paise: number;
  discount_paise: number;
  final_amount_paise: number;
  promo_code_id: string | null;
  status: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  created_at?: string;
};
export type DbPromo = {
  id: string;
  code: string;
  type: string;
  value: number;
  max_discount_paise: number | null;
  min_spend_paise: number;
  usage_limit: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
};
export type DbPost = {
  id: string;
  user_id: string;
  category: string;
  content: string;
  created_at: string;
};

export async function listPublishedCourses(): Promise<DbCourse[]> {
  return sb<DbCourse[]>(
    "courses?select=*&status=eq.published&order=created_at.asc",
  );
}

export async function getCourseBySlug(slug: string): Promise<DbCourse | null> {
  const rows = await sb<DbCourse[]>(
    `courses?select=*&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`,
  );
  return rows[0] || null;
}

export async function getCourseById(id: string): Promise<DbCourse | null> {
  const rows = await sb<DbCourse[]>(
    `courses?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return rows[0] || null;
}

export async function listLessons(courseId: string): Promise<DbLesson[]> {
  return sb<DbLesson[]>(
    `course_lessons?select=*&course_id=eq.${encodeURIComponent(courseId)}&order=position.asc`,
  );
}

export async function listModules(courseId: string): Promise<DbModule[]> {
  return sb<DbModule[]>(
    `course_modules?select=*&course_id=eq.${encodeURIComponent(courseId)}&order=position.asc`,
  );
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const rows = await sb<DbUser[]>(
    `users?select=*&email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`,
  );
  return rows[0] || null;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  const rows = await sb<DbUser[]>(
    `users?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return rows[0] || null;
}

export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match =
    url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) ||
    url.match(/[?&]v=([A-Za-z0-9_-]{6,})/) ||
    url.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
  return match ? match[1] : null;
}

export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
