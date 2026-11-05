// src/app/learn/page.tsx
import Link from "next/link";
import Script from "next/script";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createDecipheriv, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Session = { sub: string; email: string; role: string; exp: number };
type Lesson = { id: string; title: string; minutes: number; videoId?: string; status?: string };
type Course = { id: string; title: string; thumbnail?: string; lessons: Lesson[] };
type Enrollment = { userId: string; courseId: string; status: string; completed: string[]; orderId?: string };
type Order = {
  id: string; userId: string; courseId: string; amount: number; currency: string;
  linkId: string; status: string; createdAt: string;
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

async function requireUser(): Promise<Session> {
  const secret = process.env.SESSION_SECRET;
  const token = (await cookies()).get("academy_session")?.value;
  if (secret && token) {
    const [payload, signature, extra] = token.split(".");
    if (payload && signature && !extra) {
      const expected = createHmac("sha256", secret).update(payload).digest();
      const actual = Buffer.from(signature, "base64url");
      if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
        try {
          const user = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
          if (typeof user.sub === "string" && user.sub && typeof user.email === "string" && user.exp > Date.now() / 1000) return user;
        } catch {}
      }
    }
  }
  redirect("/login?next=%2Flearn");
}

function decrypt(value: string) {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!secret) throw new Error("Payment settings unavailable");
  const [iv, tag, ciphertext] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString();
}

async function verifyPurchases(user: Session) {
  const pending = all<Order>("order:").filter(o => o.userId === user.sub && o.status === "pending");
  if (!pending.length) return false;
  const settings = get<{ keyId?: string; keySecret?: string }>("settings") || {};
  let failed = false;
  try {
    const id = settings.keyId || process.env.RAZORPAY_KEY_ID;
    const secret = settings.keySecret ? decrypt(settings.keySecret) : process.env.RAZORPAY_KEY_SECRET;
    if (!id || !secret) return true;
    await Promise.all(pending.slice(-20).map(async order => {
      try {
        const response = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(order.linkId)}`, {
          cache: "no-store", signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
        });
        if (!response.ok) throw new Error("Verification failed");
        const link = await response.json();
        if (link.status === "paid" && link.reference_id === order.id &&
            link.amount === order.amount && link.amount_paid === order.amount && link.currency === order.currency) {
          // Never trust callback query parameters as proof of payment.
          db.exec("BEGIN IMMEDIATE");
          try {
            const current = get<Order>(`order:${order.id}`);
            if (current?.status === "pending") {
              put(`order:${order.id}`, { ...current, status: "paid" });
              const key = `enrollment:${user.sub}:${order.courseId}`;
              const existing = get<Enrollment>(key);
              put(key, {
                userId: user.sub, courseId: order.courseId, status: "active",
                completed: existing?.completed || [], orderId: order.id,
              } satisfies Enrollment);
            }
            db.exec("COMMIT");
          } catch (error) { db.exec("ROLLBACK"); throw error; }
        } else if (["expired", "cancelled"].includes(link.status)) {
          const current = get<Order>(`order:${order.id}`);
          if (current?.status === "pending") put(`order:${order.id}`, { ...current, status: link.status });
        }
      } catch { failed = true; }
    }));
  } catch { failed = true; }
  return failed;
}

async function completeLesson(form: FormData) {
  "use server";
  const user = await requireUser();
  const courseId = String(form.get("courseId") || "");
  const lessonId = String(form.get("lessonId") || "");
  const course = get<Course>(`course:${courseId}`);
  const key = `enrollment:${user.sub}:${courseId}`;
  db.exec("BEGIN IMMEDIATE");
  try {
    const enrollment = get<Enrollment>(key);
    if (enrollment?.status !== "active" || !course?.lessons.some(l => l.id === lessonId)) throw new Error("Access denied");
    put(key, { ...enrollment, completed: [...new Set([...enrollment.completed, lessonId])] });
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  revalidatePath("/learn");
  const index = course!.lessons.findIndex(l => l.id === lessonId);
  const next = course!.lessons[index + 1] || course!.lessons[index];
  redirect(`/learn?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(next.id)}`);
}

async function playbackToken(videoId: string) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!account || !apiToken || !/^[a-f0-9]{32}$/i.test(videoId)) return null;
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/stream/${videoId}/token`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 14400 }),
    });
    const data = await response.json();
    return response.ok && data.success ? data.result.token as string : null;
  } catch { return null; }
}

export default async function MyLearning({
  searchParams,
}: { searchParams: Promise<{ course?: string; lesson?: string }> }) {
  const user = await requireUser();
  const verificationFailed = await verifyPurchases(user);
  const query = await searchParams;
  const enrollments = all<Enrollment>("enrollment:").filter(e => e.userId === user.sub);
  const active = enrollments.filter(e => e.status === "active");
  const courses = active.map(e => ({ enrollment: e, course: get<Course>(`course:${e.courseId}`) }))
    .filter((x): x is { enrollment: Enrollment; course: Course } => Boolean(x.course));
  const selected = courses.find(x => x.course.id === query.course) || courses[0];
  const course = selected?.course;
  const enrollment = selected?.enrollment;
  const lesson = course?.lessons.find(l => l.id === query.lesson) ||
    course?.lessons.find(l => !enrollment?.completed.includes(l.id)) || course?.lessons[0];
  const token = lesson?.videoId && lesson.status === "ready" ? await playbackToken(lesson.videoId) : null;
  const resumeKey = lesson ? `academy:${user.sub}:${course!.id}:${lesson.id}` : "";
  const percent = (c: Course, e: Enrollment) => c.lessons.length
    ? Math.round(c.lessons.filter(l => e.completed.includes(l.id)).length / c.lessons.length * 100) : 0;
  const hasPending = all<Order>("order:").some(o => o.userId === user.sub && o.status === "pending");

  return (
    <main style={{ maxWidth: 1100, margin: "auto", padding: 24 }}>
      <nav><Link href="/">TechnoTrade Academy</Link></nav>
      <h1>My Learning</h1>
      {(verificationFailed || hasPending) && (
        <p role="status">
          {verificationFailed ? "Payment verification is temporarily unavailable." : "An unfinished or recently paid checkout is awaiting confirmation."}
          {" "}<a href="/learn">Check payment status again</a>
        </p>
      )}
      {!courses.length && <p>No active courses yet. <Link href="/">Explore courses</Link></p>}
      <section aria-labelledby="purchased">
        <h2 id="purchased">Your courses</h2>
        <ul>
          {courses.map(({ course: c, enrollment: e }) => (
            <li key={c.id} style={{ marginBottom: 16 }}>
              <Link href={`/learn?course=${encodeURIComponent(c.id)}`}>{c.title}</Link>
              <div><progress max={100} value={percent(c, e)} aria-label={`${c.title} progress`} /> {percent(c, e)}% complete</div>
            </li>
          ))}
        </ul>
        {enrollments.filter(e => e.status !== "active").map(e => (
          <p key={e.courseId}>{get<Course>(`course:${e.courseId}`)?.title || "Course"} — Access inactive ({e.status.replaceAll("_", " ")})</p>
        ))}
      </section>
      {course && lesson && enrollment && (
        <section aria-labelledby="current-course">
          <h2 id="current-course">{course.title}</h2>
          <h3>{lesson.title}</h3>
          {token ? (
            <>
              <iframe
                key={`${lesson.id}:${token}`}
                id="lesson-player"
                title={lesson.title}
                src={`https://iframe.videodelivery.net/${token}`}
                data-resume-key={resumeKey}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                style={{ width: "100%", aspectRatio: "16 / 9", border: 0 }}
              />
              <p id="resume-status" role="status">Playback position is saved on this browser. Completed lessons sync to your account.</p>
              <Script id={`resume-${lesson.id}-${token.slice(-12)}`} strategy="afterInteractive">{`
                (() => {
                  const frame = document.getElementById("lesson-player");
                  if (!frame || frame.dataset.bound) return;
                  const initialize = () => {
                    if (!window.Stream || !frame.isConnected || frame.dataset.bound) return;
                    frame.dataset.bound = "true";
                    const player = window.Stream(frame);
                    const key = frame.dataset.resumeKey;
                    let lastSaved = 0;
                    player.addEventListener("loadedmetadata", () => {
                      try {
                        const seconds = Number(localStorage.getItem(key) || 0);
                        if (Number.isFinite(seconds) && seconds > 0 && seconds < player.duration - 5) {
                          player.currentTime = seconds;
                          const status = document.getElementById("resume-status");
                          if (status) status.textContent = "Resumed at " + Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0") + ". Position is saved on this browser.";
                        }
                      } catch {}
                    });
                    const save = () => {
                      try { localStorage.setItem(key, String(player.currentTime || 0)); } catch {}
                    };
                    player.addEventListener("timeupdate", () => {
                      if (Date.now() - lastSaved > 5000) { save(); lastSaved = Date.now(); }
                    });
                    player.addEventListener("pause", save);
                    player.addEventListener("ended", () => {
                      try { localStorage.removeItem(key); } catch {}
                      const status = document.getElementById("resume-status");
                      if (status) status.textContent = "Lesson finished. Mark it complete to update your progress.";
                    });
                  };
                  if (window.Stream) initialize();
                  else {
                    const script = document.createElement("script");
                    script.src = "https://embed.cloudflarestream.com/embed/sdk.latest.js";
                    script.onload = initialize;
                    script.onerror = () => {
                      const status = document.getElementById("resume-status");
                      if (status) status.textContent = "Automatic resume is unavailable. You can still use the player.";
                    };
                    document.head.appendChild(script);
                  }
                })();
              `}</Script>
            </>
          ) : <p role="status">This lesson video is processing or temporarily unavailable. Please try again later.</p>}
          <form action={completeLesson}>
            <input type="hidden" name="courseId" value={course.id} />
            <input type="hidden" name="lessonId" value={lesson.id} />
            <button type="submit">{enrollment.completed.includes(lesson.id) ? "Continue to next lesson" : "Mark complete and continue"}</button>
          </form>
          <nav aria-label="Course curriculum">
            <h3>Curriculum</h3>
            <ol>
              {course.lessons.map(l => (
                <li key={l.id}>
                  <Link aria-current={lesson.id === l.id ? "page" : undefined} href={`/learn?course=${encodeURIComponent(course.id)}&lesson=${encodeURIComponent(l.id)}`}>
                    {l.title}
                  </Link>
                  {" "}— {l.minutes} min{enrollment.completed.includes(l.id) ? " · Completed" : ""}
                </li>
              ))}
            </ol>
          </nav>
        </section>
      )}
    </main>
  );
}
