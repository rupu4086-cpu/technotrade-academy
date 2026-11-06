// src/app/manage/[private-path]/page.tsx
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Administration", robots: { index: false, follow: false } };

// Data lives in PostgreSQL (see src/lib/store.ts). No local file storage.
// SESSION_SECRET authenticates sessions; SETTINGS_ENCRYPTION_KEY encrypts secrets.
// ADMIN_PRIVATE_PATH is a single, unguessable URL segment. It is not authentication.
// Cloudflare Stream account credentials stay in server environment variables.
// No webhook endpoint is implemented in these files; purchases are independently
// verified against Razorpay when the authenticated purchaser opens My Learning.

type Lesson = { id: string; title: string; minutes: number; videoId?: string; status?: string };
type Course = {
  id: string; slug: string; title: string; description: string; published: boolean;
  thumbnail?: string; thumbnailStatus?: string; price: number; prerequisites: string[];
  outcomes: string[]; instructor: { name: string; bio: string }; refundTerms: string;
  lessons: Lesson[]; previewLessonId?: string;
};
type Enrollment = { userId: string; courseId: string; status: string; completed: string[]; orderId?: string };
type Promo = { code: string; percent: number; active: boolean; expires?: string; courseId?: string };
type Settings = { keyId?: string; keySecret?: string; webhookSecret?: string };
type Order = {
  id: string; userId: string; courseId: string; amount: number; currency: string;
  linkId: string; status: string; refundId?: string; refundTerms: string;
};

import { getRecord as get, allRecords as all, putRecord as put } from "@/lib/store";

async function requireAdmin(path: string) {
  if (!process.env.ADMIN_PRIVATE_PATH || path !== process.env.ADMIN_PRIVATE_PATH) notFound();
  const secret = process.env.SESSION_SECRET;
  const token = (await cookies()).get("academy_session")?.value;
  if (!secret || !token) notFound();
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) notFound();
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) notFound();
  let user: { sub?: string; role?: string; exp?: number };
  try { user = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { notFound(); }
  if (!user.sub || user.role !== "admin" || !user.exp || user.exp <= Date.now() / 1000) notFound();
  return user.sub;
}

function encryptionKey() {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new Error("Set SETTINGS_ENCRYPTION_KEY to at least 32 random characters.");
  return createHash("sha256").update(secret).digest();
}
function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(b => b.toString("base64url")).join(".");
}
function decrypt(value: string) {
  const [iv, tag, ciphertext] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString();
}
async function razorpay(path: string, body?: unknown, idempotency?: string) {
  const settings = await get<Settings>("settings") || {};
  const id = settings.keyId || process.env.RAZORPAY_KEY_ID;
  const secret = settings.keySecret ? decrypt(settings.keySecret) : process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Razorpay credentials are missing.");
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(idempotency ? { "X-Refund-Idempotency": idempotency } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Razorpay request failed. Check credentials and payment status.");
  return response.json();
}
async function stream(path: string, body?: unknown) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!account || !token) throw new Error("Cloudflare Stream credentials are missing.");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/stream${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error("Video service request failed.");
  return data.result;
}
function text(form: FormData, key: string, max = 10000) {
  const value = String(form.get(key) || "").trim();
  if (value.length > max) throw new Error(`${key} is too long.`);
  return value;
}
const lines = (value: string) => value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
async function checkedCourse(id: string) {
  const course = await get<Course>(`course:${id}`);
  if (!course) throw new Error("Course not found.");
  return course;
}

async function manage(path: string, form: FormData) {
  "use server";
  const actor = await requireAdmin(path);
  const action = text(form, "action", 40);
  let message = "Changes saved.";
  try {
    if (action === "saveCourse") {
      const id = text(form, "courseId", 100) || randomUUID();
      const old = await get<Course>(`course:${id}`);
      const slug = text(form, "slug", 100);
      const title = text(form, "title", 180);
      const price = Math.round(Number(text(form, "price", 20)) * 100);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title) throw new Error("Enter a title and a lowercase hyphenated slug.");
      if ((await all<Course>("course:")).some(c => c.slug === slug && c.id !== id)) throw new Error("This slug already exists.");
      if (!Number.isSafeInteger(price) || price < 100 || price > 100000000) throw new Error("Enter a valid price between INR 1 and INR 1,000,000.");
      await put(`course:${id}`, {
        ...old, id, slug, title, price, published: false,
        description: text(form, "description"),
        prerequisites: lines(text(form, "prerequisites")),
        outcomes: lines(text(form, "outcomes")),
        instructor: { name: text(form, "instructorName", 180), bio: text(form, "instructorBio") },
        refundTerms: text(form, "refundTerms"),
        lessons: old?.lessons || [],
      } satisfies Course);
      message = "Course saved as a draft. Review it before publishing.";
    } else if (action === "publish") {
      const course = await checkedCourse(text(form, "courseId", 100));
      const published = !course.published;
      if (published && (!course.description || !course.outcomes.length || !course.refundTerms ||
          !course.instructor.name || !course.instructor.bio || !course.lessons.length ||
          course.lessons.some(l => !l.videoId || l.status !== "ready")))
        throw new Error("Publishing requires complete details, refund terms, outcomes, instructor details, and ready videos for every lesson.");
      await put(`course:${course.id}`, { ...course, published });
    } else if (action === "thumbnail") {
      const course = await checkedCourse(text(form, "courseId", 100));
      const file = form.get("thumbnail");
      if (!(file instanceof File) || !file.size || file.size > 500000) throw new Error("Upload a PNG, JPEG, or WebP image smaller than 500 KB.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const ext = bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ? "png"
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "jpg"
        : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "webp" : "";
      if (!ext) throw new Error("Unsupported image content.");
      // No file write: Vercel serverless storage is ephemeral and read-only
      // outside /tmp, so the thumbnail is stored as a data URL in the record.
      const mime = ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "image/webp";
      const current = await checkedCourse(course.id);
      await put(`course:${course.id}`, { ...current, thumbnail: `data:${mime};base64,${bytes.toString("base64")}`, thumbnailStatus: "ready" });
    } else if (action === "addLesson") {
      const course = await checkedCourse(text(form, "courseId", 100));
      const title = text(form, "lessonTitle", 180);
      const minutes = Number(text(form, "minutes", 10));
      if (!title || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error("Enter a lesson title and a duration from 1 to 1440 minutes.");
      await put(`course:${course.id}`, {
        ...course, published: false,
        lessons: [...course.lessons, { id: randomUUID(), title, minutes, status: "missing" }],
      });
    } else if (["move", "preview", "video", "refreshVideo"].includes(action)) {
      const course = await checkedCourse(text(form, "courseId", 100));
      const lessonId = text(form, "lessonId", 100);
      const index = course.lessons.findIndex(l => l.id === lessonId);
      if (index < 0) throw new Error("Lesson not found.");
      if (action === "move") {
        const target = index + (text(form, "direction", 10) === "up" ? -1 : 1);
        if (target >= 0 && target < course.lessons.length)
          [course.lessons[index], course.lessons[target]] = [course.lessons[target], course.lessons[index]];
      } else if (action === "preview") {
        course.previewLessonId = course.previewLessonId === lessonId ? undefined : lessonId;
      } else {
        let result;
        if (action === "video") {
          const source = new URL(text(form, "sourceUrl", 4000));
          if (source.protocol !== "https:" || source.username || source.password) throw new Error("Use a public HTTPS video source URL without embedded credentials.");
          result = await stream("/copy", {
            url: source.toString(), requireSignedURLs: true,
            meta: { name: `${course.title}: ${course.lessons[index].title}` },
          });
        } else {
          const id = course.lessons[index].videoId;
          if (!id || !/^[a-f0-9]{32}$/i.test(id)) throw new Error("Upload a video first.");
          result = await stream(`/${id}`);
        }
        const latest = await checkedCourse(course.id);
        const currentLesson = latest.lessons.find(l => l.id === lessonId);
        if (!currentLesson) throw new Error("Lesson no longer exists.");
        currentLesson.videoId = result.uid;
        currentLesson.status = result.readyToStream ? "ready" : result.status?.state || "processing";
        if (action === "video") latest.published = false;
        await put(`course:${course.id}`, latest);
      }
      if (action === "move" || action === "preview") await put(`course:${course.id}`, course);
    } else if (action === "promo") {
      const code = text(form, "code", 32).toUpperCase();
      const percent = Number(text(form, "percent", 10));
      const courseId = text(form, "courseId", 100);
      const expires = text(form, "expires", 40);
      if (!/^[A-Z0-9_-]{2,32}$/.test(code) || !Number.isInteger(percent) || percent < 1 || percent > 99)
        throw new Error("Use a valid promo code and a whole-number discount from 1 to 99.");
      if (courseId) await checkedCourse(courseId);
      if (expires && !Number.isFinite(Date.parse(expires))) throw new Error("Invalid expiration date.");
      await put(`promo:${code}`, {
        code, percent, courseId, expires: expires ? new Date(expires).toISOString() : "",
        active: form.get("active") === "on",
      } satisfies Promo);
    } else if (action === "enrollment") {
      const userId = text(form, "userId", 200);
      const courseId = text(form, "courseId", 100);
      const status = text(form, "status", 30);
      if (!userId || !["active", "revoked"].includes(status)) throw new Error("Enter an authenticated user ID and a valid status.");
      await checkedCourse(courseId);
      const key = `enrollment:${userId}:${courseId}`;
      const old = await get<Enrollment>(key);
      await put(key, { ...old, userId, courseId, status, completed: old?.completed || [] });
    } else if (action === "refund") {
      if (form.get("confirm") !== "on") throw new Error("Confirm the full refund.");
      const orderId = text(form, "orderId", 100);
      let order = await get<Order>(`order:${orderId}`);
      if (!order || !["paid", "refund_pending", "refund_failed"].includes(order.status)) throw new Error("Select a paid order eligible for a refund.");
      if (!order.refundId) {
        const link = await razorpay(`payment_links/${encodeURIComponent(order.linkId)}`);
        if (link.status !== "paid" || link.reference_id !== order.id || link.amount_paid !== order.amount)
          throw new Error("Payment verification failed.");
        const paymentId = link.payments?.find((p: { status: string; amount: number }) => p.status === "captured" && p.amount === order!.amount)?.payment_id;
        if (!paymentId) throw new Error("A matching captured payment was not found.");
        const payment = await razorpay(`payments/${encodeURIComponent(paymentId)}`);
        if (payment.amount !== order.amount || payment.currency !== order.currency || payment.status !== "captured")
          throw new Error("Payment amount or status does not match.");
        const refund = await razorpay(`payments/${encodeURIComponent(paymentId)}/refund`, {
          amount: order.amount, notes: { orderId: order.id, initiatedBy: actor },
        }, order.id);
        order = { ...order, refundId: refund.id, status: "refund_pending" };
        await put(`order:${order.id}`, order);
      }
      const refund = await razorpay(`refunds/${encodeURIComponent(order.refundId!)}`);
      const status = refund.status === "processed" ? "refunded" : refund.status === "failed" ? "refund_failed" : "refund_pending";
      await put(`order:${order.id}`, { ...order, status });
      if (status === "refunded") {
        const key = `enrollment:${order.userId}:${order.courseId}`;
        const enrollment = await get<Enrollment>(key);
        if (enrollment?.orderId === order.id) await put(key, { ...enrollment, status: "refunded" });
      }
      message = `Refund status: ${status.replaceAll("_", " ")}.`;
    } else if (action === "settings") {
      const settings = await get<Settings>("settings") || {};
      const keyId = text(form, "keyId", 200);
      const keySecret = text(form, "keySecret", 500);
      const webhookSecret = text(form, "webhookSecret", 500);
      if (keyId && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) throw new Error("Invalid Razorpay Key ID.");
      await put("settings", {
        keyId: keyId || settings.keyId,
        keySecret: keySecret ? encrypt(keySecret) : settings.keySecret,
        webhookSecret: webhookSecret ? encrypt(webhookSecret) : settings.webhookSecret,
      });
    } else throw new Error("Unknown operation.");
    await put(`audit:${randomUUID()}`, { actor, action, at: new Date().toISOString() });
  } catch (error) {
    message = error instanceof Error ? error.message : "Operation failed.";
  }
  redirect(`/manage/${encodeURIComponent(path)}?message=${encodeURIComponent(message)}`);
}

export default async function Admin({
  params, searchParams,
}: {
  params: Promise<{ "private-path": string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const path = (await params)["private-path"];
  await requireAdmin(path);
  const { message } = await searchParams;
  const action = manage.bind(null, path);
  const courses = await all<Course>("course:");
  const promos = await all<Promo>("promo:");
  const enrollments = await all<Enrollment>("enrollment:");
  const orders = await all<Order>("order:");
  const settings = await get<Settings>("settings") || {};
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const courseOptions = courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>);

  function editor(course?: Course) {
    return (
      <form action={action}>
        {hidden("action", "saveCourse")}{hidden("courseId", course?.id || "")}
        <p><label>Title <input name="title" required maxLength={180} defaultValue={course?.title} /></label></p>
        <p><label>Slug <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={course?.slug} /></label></p>
        <p><label>Description <textarea name="description" required defaultValue={course?.description} /></label></p>
        <p><label>Price in INR <input name="price" type="number" min="1" max="1000000" step="0.01" required defaultValue={course ? course.price / 100 : undefined} /></label></p>
        <p><label>Prerequisites, one per line <textarea name="prerequisites" defaultValue={course?.prerequisites.join("\n")} /></label></p>
        <p><label>Learning outcomes, one per line <textarea name="outcomes" required defaultValue={course?.outcomes.join("\n")} /></label></p>
        <p><label>Instructor name <input name="instructorName" required defaultValue={course?.instructor.name} /></label></p>
        <p><label>Instructor profile <textarea name="instructorBio" required defaultValue={course?.instructor.bio} /></label></p>
        <p><label>Refund terms, including eligibility, deadline, and contact method <textarea name="refundTerms" required defaultValue={course?.refundTerms} /></label></p>
        <button>Save as draft</button>
      </form>
    );
  }

  return (
    <main style={{ maxWidth: 1120, margin: "auto", padding: 24 }}>
      <h1>TechnoTrade Academy Administration</h1>
      {message && <p role="status">{message}</p>}
      <section>
        <h2>Courses</h2>
        <details><summary>Create course</summary>{editor()}</details>
        {courses.map(course => (
          <article key={course.id} style={{ border: "1px solid #aaa", padding: 16, marginBlock: 20 }}>
            <h3>{course.title} — {course.published ? "Published" : "Draft"}</h3>
            <details><summary>Edit course details</summary>{editor(course)}</details>
            <form action={action}>
              {hidden("action", "publish")}{hidden("courseId", course.id)}
              <button>{course.published ? "Unpublish" : "Publish course"}</button>
            </form>
            <h4>Thumbnail</h4>
            <p>Status: {course.thumbnailStatus || "Not uploaded"}</p>
            {course.thumbnail && <img src={course.thumbnail} alt={`${course.title} thumbnail`} width={180} />}
            <form action={action}>
              {hidden("action", "thumbnail")}{hidden("courseId", course.id)}
              <label>PNG, JPEG, or WebP, maximum 500 KB <input name="thumbnail" type="file" accept="image/png,image/jpeg,image/webp" required /></label>
              <button>Upload thumbnail</button>
            </form>
            <h4>Curriculum</h4>
            <p>Video uploads are imported from HTTPS source URLs into private Cloudflare Stream storage. Replacing a video returns the course to draft.</p>
            <ol>
              {course.lessons.map((lesson, index) => (
                <li key={lesson.id} style={{ marginBlock: 16 }}>
                  <strong>{lesson.title}</strong> · {lesson.minutes} min · Video: {lesson.status || "missing"}
                  {course.previewLessonId === lesson.id && " · Public preview"}
                  <form action={action}>
                    {hidden("action", "move")}{hidden("courseId", course.id)}{hidden("lessonId", lesson.id)}
                    <button name="direction" value="up" disabled={index === 0}>Move up</button>{" "}
                    <button name="direction" value="down" disabled={index === course.lessons.length - 1}>Move down</button>
                  </form>
                  <form action={action}>
                    {hidden("action", "preview")}{hidden("courseId", course.id)}{hidden("lessonId", lesson.id)}
                    <button>{course.previewLessonId === lesson.id ? "Remove public preview" : "Make public preview"}</button>
                  </form>
                  <form action={action}>
                    {hidden("action", "video")}{hidden("courseId", course.id)}{hidden("lessonId", lesson.id)}
                    <label>Video source URL <input name="sourceUrl" type="url" placeholder="https://…" required /></label>
                    <button>Import / replace video</button>
                  </form>
                  {lesson.videoId && <form action={action}>
                    {hidden("action", "refreshVideo")}{hidden("courseId", course.id)}{hidden("lessonId", lesson.id)}
                    <button>Refresh upload status</button>
                  </form>}
                </li>
              ))}
            </ol>
            <form action={action}>
              {hidden("action", "addLesson")}{hidden("courseId", course.id)}
              <label>Lesson title <input name="lessonTitle" required /></label>{" "}
              <label>Minutes <input name="minutes" type="number" min="1" max="1440" required /></label>{" "}
              <button>Add lesson</button>
            </form>
          </article>
        ))}
      </section>
      <section>
        <h2>Promo management</h2>
        <p>Save an existing code to update or deactivate it. Expiration times use UTC.</p>
        <form action={action}>
          {hidden("action", "promo")}
          <p><label>Code <input name="code" pattern="[A-Za-z0-9_-]{2,32}" required /></label></p>
          <p><label>Discount percentage <input name="percent" type="number" min="1" max="99" required /></label></p>
          <p><label>Course <select name="courseId"><option value="">All courses</option>{courseOptions}</select></label></p>
          <p><label>Expires, UTC <input name="expires" type="datetime-local" /></label></p>
          <p><label><input name="active" type="checkbox" defaultChecked /> Active</label></p>
          <button>Save promo</button>
        </form>
        <ul>{promos.map(p => <li key={p.code}>{p.code}: {p.percent}% · {p.active ? "Active" : "Inactive"} · {p.courseId ? courses.find(c => c.id === p.courseId)?.title : "All courses"} · {p.expires || "No expiry"}</li>)}</ul>
      </section>
      <section>
        <h2>Enrollment controls</h2>
        <p>Use the immutable user ID issued by your authentication system. Revoking access does not refund a payment.</p>
        <form action={action}>
          {hidden("action", "enrollment")}
          <label>User ID <input name="userId" required /></label>{" "}
          <label>Course <select name="courseId" required>{courseOptions}</select></label>{" "}
          <label>Status <select name="status"><option value="active">Grant access</option><option value="revoked">Revoke access</option></select></label>{" "}
          <button>Update enrollment</button>
        </form>
        <ul>{enrollments.map(e => <li key={`${e.userId}:${e.courseId}`}>{e.userId} · {courses.find(c => c.id === e.courseId)?.title || e.courseId} · {e.status}</li>)}</ul>
      </section>
      <section>
        <h2>Payments and refunds</h2>
        <p>Review the terms accepted at purchase before issuing a full refund. Access is removed only after a processed refund. Refresh pending refunds using the same control.</p>
        {orders.map(order => (
          <details key={order.id}>
            <summary>{order.id} · {order.userId} · INR {(order.amount / 100).toFixed(2)} · {order.status}</summary>
            <p>{courses.find(c => c.id === order.courseId)?.title || order.courseId}</p>
            <p style={{ whiteSpace: "pre-wrap" }}>{order.refundTerms}</p>
            {["paid", "refund_pending", "refund_failed"].includes(order.status) && (
              <form action={action}>
                {hidden("action", "refund")}{hidden("orderId", order.id)}
                <label><input name="confirm" type="checkbox" required /> I confirm this full refund or status check.</label>{" "}
                <button>{order.refundId ? "Refresh refund status" : "Issue full refund"}</button>
              </form>
            )}
          </details>
        ))}
      </section>
      <section>
        <h2>Razorpay settings</h2>
        <p>Leave fields blank to keep current values. Secrets are encrypted at rest and are never displayed.</p>
        <p>Key Secret: {settings.keySecret || process.env.RAZORPAY_KEY_SECRET ? "Configured" : "Not configured"} · Webhook Secret: {settings.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET ? "Configured" : "Not configured"}</p>
        <p>The webhook secret is stored for your webhook integration. This page does not register a webhook endpoint.</p>
        <form action={action} autoComplete="off">
          {hidden("action", "settings")}
          <p><label>Razorpay Key ID <input name="keyId" defaultValue={settings.keyId || process.env.RAZORPAY_KEY_ID || ""} /></label></p>
          <p><label>Razorpay Key Secret <input name="keySecret" type="password" autoComplete="new-password" /></label></p>
          <p><label>Razorpay Webhook Secret <input name="webhookSecret" type="password" autoComplete="new-password" /></label></p>
          <button>Save payment settings</button>
        </form>
      </section>
    </main>
  );
}
