// src/app/courses/[slug]/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createDecipheriv, createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Lesson = { id: string; title: string; minutes: number; videoId?: string; status?: string };
type Course = {
  id: string; slug: string; title: string; description: string; published: boolean;
  thumbnail?: string; price: number; prerequisites: string[]; outcomes: string[];
  instructor: { name: string; bio: string }; refundTerms: string;
  lessons: Lesson[]; previewLessonId?: string;
};
type Session = { sub: string; email: string; role: string; exp: number };
type Promo = { code: string; percent: number; active: boolean; expires?: string; courseId?: string };
type Enrollment = { status: string };
type Order = {
  id: string; userId: string; courseId: string; amount: number; currency: string;
  linkId: string; url: string; status: string; promo?: string; refundTerms: string; createdAt: string;
};

mkdirSync(join(process.cwd(), ".data"), { recursive: true });
const db = new DatabaseSync(join(process.cwd(), ".data", "academy.sqlite"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
const get = <T,>(key: string): T | undefined => {
  const row = db.prepare("SELECT value FROM records WHERE key=?").get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : undefined;
};
const all = <T,>(prefix: string): T[] =>
  (db.prepare("SELECT value FROM records WHERE key LIKE ?").all(`${prefix}%`) as { value: string }[]).map(r => JSON.parse(r.value));
const put = (key: string, value: unknown) =>
  db.prepare("INSERT INTO records VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value));

// Authentication must issue academy_session as an HttpOnly, Secure, SameSite=Lax
// cookie: base64url(JSON session) + "." + base64url(HMAC-SHA256(payload)).
async function session(): Promise<Session | null> {
  const secret = process.env.SESSION_SECRET;
  const token = (await cookies()).get("academy_session")?.value;
  if (!secret || !token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    return typeof value.sub === "string" && value.sub.length > 0 &&
      typeof value.email === "string" && value.exp > Date.now() / 1000 ? value : null;
  } catch { return null; }
}

function decrypt(value?: string) {
  if (!value) return "";
  const secret = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!secret) throw new Error("Payment settings are unavailable.");
  const [iv, tag, ciphertext] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString();
}

async function paymentLink(body: unknown) {
  const settings = get<{ keyId?: string; keySecret?: string }>("settings") || {};
  const id = settings.keyId || process.env.RAZORPAY_KEY_ID;
  const secret = settings.keySecret ? decrypt(settings.keySecret) : process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Checkout is not configured.");
  const response = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Checkout is temporarily unavailable.");
  return response.json() as Promise<{ id: string; short_url: string }>;
}

async function previewToken(videoId: string) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!account || !token || !/^[a-f0-9]{32}$/i.test(videoId)) return null;
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/stream/${videoId}/token`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    });
    const data = await response.json();
    return response.ok && data.success ? data.result.token as string : null;
  } catch { return null; }
}

async function buy(form: FormData) {
  "use server";
  const user = await session();
  if (!user) redirect("/login?next=%2Flearn");
  const course = get<Course>(`course:${String(form.get("courseId") || "")}`);
  if (!course?.published) notFound();
  const back = `/courses/${encodeURIComponent(course.slug)}`;
  if (get<Enrollment>(`enrollment:${user.sub}:${course.id}`)?.status === "active")
    redirect(`/learn?course=${encodeURIComponent(course.id)}`);
  if (form.get("terms") !== "on") redirect(`${back}?error=terms`);

  const code = String(form.get("promo") || "").trim().toUpperCase();
  const promo = code ? get<Promo>(`promo:${code}`) : undefined;
  if (code && (!promo?.active || (promo.courseId && promo.courseId !== course.id) ||
      (promo.expires && Date.parse(promo.expires) <= Date.now())))
    redirect(`${back}?error=promo`);

  const amount = Math.round(course.price * (1 - (promo?.percent || 0) / 100));
  if (!Number.isSafeInteger(amount) || amount < 100) redirect(`${back}?error=price`);

  // Reuse an outstanding checkout to reduce accidental duplicate payments.
  const pending = all<Order>("order:").find(order =>
    order.userId === user.sub && order.courseId === course.id &&
    order.status === "pending" && order.amount === amount && order.promo === code &&
    Date.now() - Date.parse(order.createdAt) < 25 * 60 * 1000);
  if (pending) redirect(pending.url);

  let url = "";
  try {
    const origin = new URL(process.env.APP_URL || "");
    if (origin.protocol !== "https:" && origin.hostname !== "localhost") throw new Error("Invalid application URL");
    const id = randomUUID();
    const link = await paymentLink({
      amount, currency: "INR", accept_partial: false, reference_id: id,
      description: course.title.slice(0, 200),
      customer: { email: user.email },
      notify: { email: false, sms: false }, reminder_enable: false,
      expire_by: Math.floor(Date.now() / 1000) + 1800,
      callback_url: new URL("/learn", origin).toString(), callback_method: "get",
      notes: { userId: user.sub, courseId: course.id, promo: code },
    });
    if (!link.id || new URL(link.short_url).protocol !== "https:") throw new Error("Invalid checkout");
    put(`order:${id}`, {
      id, userId: user.sub, courseId: course.id, amount, currency: "INR",
      linkId: link.id, url: link.short_url, status: "pending", promo: code,
      refundTerms: course.refundTerms, createdAt: new Date().toISOString(),
    } satisfies Order);
    url = link.short_url;
  } catch { redirect(`${back}?error=checkout`); }
  redirect(url);
}

export default async function CourseDetail({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const course = all<Course>("course:").find(c => c.slug === slug && c.published);
  if (!course) notFound();
  const user = await session();
  const owned = user && get<Enrollment>(`enrollment:${user.sub}:${course.id}`)?.status === "active";
  const preview = course.lessons.find(l => l.id === course.previewLessonId && l.status === "ready");
  const token = preview?.videoId ? await previewToken(preview.videoId) : null;
  const errors: Record<string, string> = {
    promo: "This promo code is invalid, expired, or not applicable.",
    terms: "Please accept the refund terms before continuing.",
    checkout: "Checkout is unavailable. Please try again shortly.",
    price: "This price cannot be processed. Please contact support.",
  };
  return (
    <main style={{ maxWidth: 1040, margin: "auto", padding: 24 }}>
      <nav aria-label="Main navigation"><Link href="/">TechnoTrade Academy</Link> · <Link href="/learn">My Learning</Link></nav>
      <header>
        <h1>{course.title}</h1>
        <p>{course.description}</p>
        {course.thumbnail && <img src={course.thumbnail} alt="" width={640} style={{ maxWidth: "100%", height: "auto" }} />}
        <p>{course.lessons.length} lessons · {course.lessons.reduce((n, l) => n + l.minutes, 0)} minutes</p>
      </header>
      <section aria-labelledby="outcomes">
        <h2 id="outcomes">What you will learn</h2>
        <ul>{course.outcomes.map((text, i) => <li key={i}>{text}</li>)}</ul>
      </section>
      <section aria-labelledby="prerequisites">
        <h2 id="prerequisites">Prerequisites</h2>
        {course.prerequisites.length ? <ul>{course.prerequisites.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>No prerequisites specified.</p>}
      </section>
      <section aria-labelledby="curriculum">
        <h2 id="curriculum">Curriculum</h2>
        <ol>{course.lessons.map(l => <li key={l.id}>{l.title} — {l.minutes} min{l.id === course.previewLessonId ? " · Free preview" : ""}</li>)}</ol>
      </section>
      <section aria-labelledby="preview">
        <h2 id="preview">Preview lesson</h2>
        {token ? <iframe title={`Preview: ${preview!.title}`} src={`https://iframe.videodelivery.net/${token}`} allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen style={{ width: "100%", aspectRatio: "16 / 9", border: 0 }} /> : <p>A preview is not currently available.</p>}
      </section>
      <section><h2>Your instructor</h2><h3>{course.instructor.name}</h3><p>{course.instructor.bio}</p></section>
      <section aria-labelledby="pricing">
        <h2 id="pricing">Course access</h2>
        <p><strong>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(course.price / 100)}</strong> · One-time payment</p>
        <h3>Refund terms</h3><p style={{ whiteSpace: "pre-wrap" }}>{course.refundTerms}</p>
        {error && <p role="alert">{errors[error] || "Please try again."}</p>}
        {owned ? <Link href={`/learn?course=${encodeURIComponent(course.id)}`}>Continue learning</Link> : (
          <form action={buy}>
            <input type="hidden" name="courseId" value={course.id} />
            <p><label>Promo code <input name="promo" maxLength={32} autoComplete="off" /></label></p>
            <p>Any valid discount is applied to the final amount shown in Razorpay checkout.</p>
            <p><label><input type="checkbox" name="terms" required /> I have read and accept the refund terms.</label></p>
            <button type="submit">Buy Now</button>
            <p>Secure checkout through Razorpay. Access is activated after payment verification.</p>
          </form>
        )}
      </section>
    </main>
  );
}
