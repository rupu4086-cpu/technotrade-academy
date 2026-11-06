// src/app/api/checkout/route.ts
// Dependencies: pg, @types/pg.
// Environment: DATABASE_URL (TLS configured), RAZORPAY_KEY_ID,
// RAZORPAY_KEY_SECRET, NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_ANON_KEY, optional CHECKOUT_PROMOS_JSON.
// Promo example: {"LEARN10":{"percent":10,"expiresAt":"2027-01-01T00:00:00Z","courseIds":["stock-foundations"]}}
// Configure Razorpay automatic capture. Configure Supabase email OTP templates.
// Run the schema below as a deployment migration; do not expose these tables via public APIs.
/*
CREATE TABLE academy_orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  course_id text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency = 'INR'),
  promo text,
  status text NOT NULL CHECK (status IN ('pending','creation_failed','paid')),
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX academy_orders_user_created ON academy_orders(user_id, created_at DESC);
CREATE TABLE academy_access (
  user_id uuid NOT NULL,
  course_id text NOT NULL,
  order_id uuid NOT NULL UNIQUE REFERENCES academy_orders(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);
*/
// Protected course-content endpoints MUST authenticate the user and query
// academy_access on the server. Never use client state as an entitlement check.

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const courses = [
  { id: "stock-foundations", title: "Stock Market Foundations", category: "Stock", description: "Understand exchanges, order types, company research, and the foundations of price analysis.", price: 249900, level: "Beginner" },
  { id: "crypto-foundations", title: "Crypto, Without the Noise", category: "Crypto", description: "Explore digital assets, wallet security, market liquidity, and practical risk awareness.", price: 249900, level: "Beginner" },
  { id: "forex-foundations", title: "Forex & the Global Economy", category: "Forex", description: "Learn currency pairs, macroeconomic drivers, leverage, and responsible position sizing.", price: 299900, level: "Beginner" },
  { id: "trading-psychology", title: "The Disciplined Trader", category: "Psychology", description: "Recognise behavioural biases, build a useful journal, and improve decision-making under uncertainty.", price: 199900, level: "All levels" },
  { id: "strategy-lab", title: "Strategy Testing Lab", category: "Advanced", description: "Study backtesting, transaction costs, overfitting, and robust evaluation before risking capital.", price: 499900, level: "Advanced" },
];

type Order = {
  id: string; user_id: string; course_id: string; amount: number; currency: string;
  status: string; razorpay_order_id: string | null;
};
type Promo = { percent: number; expiresAt: string; courseIds?: string[] };
type Payment = { id: string; order_id: string; amount: number; currency: string; status: string; captured: boolean; amount_refunded: number };
const globalDB = globalThis as typeof globalThis & { academyPool?: Pool };

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
// The academy_orders / academy_access tables are created automatically on
// first checkout use (CREATE TABLE IF NOT EXISTS), so a Vercel deploy
// works without a manual SQL step. They live in the same PostgreSQL
// database (DATABASE_URL) as the records store in src/lib/store.ts.
let tablesEnsured = false;
async function ensureCheckoutTables(): Promise<void> {
  if (tablesEnsured) return;
  const pool = db();
  await pool.query(`CREATE TABLE IF NOT EXISTS academy_orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  course_id text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency = 'INR'),
  promo text,
  status text NOT NULL CHECK (status IN ('pending','creation_failed','paid')),
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS academy_access (
  user_id uuid NOT NULL,
  course_id text NOT NULL,
  order_id uuid NOT NULL UNIQUE REFERENCES academy_orders(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
)`);
  await pool.query("CREATE INDEX IF NOT EXISTS academy_orders_user_created ON academy_orders(user_id, created_at DESC)");
  tablesEnsured = true;
}

function db() {
  return globalDB.academyPool ??= new Pool({
    connectionString: env("DATABASE_URL"), max: 5,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  });
}
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
async function userId(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 8192)
    throw new HttpError(401, "Please sign in to continue.");
  const response = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: env("NEXT_PUBLIC_SUPABASE_ANON_KEY") },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new HttpError(401, "Your session has expired. Sign in again.");
  const user = await response.json();
  if (typeof user.id !== "string" || !user.email_confirmed_at)
    throw new HttpError(401, "Please verify your email.");
  return user.id as string;
}
async function razorpay<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpError(502, "The payment provider is temporarily unavailable. Please retry.");
  return response.json() as Promise<T>;
}
function price(course: typeof courses[number], input: unknown) {
  if (input !== undefined && typeof input !== "string") throw new HttpError(400, "Invalid promo code.");
  const code = (typeof input === "string" ? input : "").trim().toUpperCase();
  if (!code) return { amount: course.price, code: null };
  if (!/^[A-Z0-9_-]{1,40}$/.test(code)) throw new HttpError(400, "Invalid promo code.");
  const promos: Record<string, Promo> = JSON.parse(process.env.CHECKOUT_PROMOS_JSON || "{}");
  const promo = Object.hasOwn(promos, code) ? promos[code] : undefined;
  if (!promo || !Number.isInteger(promo.percent) || promo.percent < 1 || promo.percent > 90 ||
      !Number.isFinite(Date.parse(promo.expiresAt)) || Date.parse(promo.expiresAt) <= Date.now() ||
      (promo.courseIds !== undefined && (!Array.isArray(promo.courseIds) || !promo.courseIds.includes(course.id)))) {
    throw new HttpError(400, "This promo code is invalid, expired, or not applicable to this course.");
  }
  return { amount: Math.round(course.price * (100 - promo.percent) / 100), code };
}

export function GET() {
  return json({ courses });
}

export async function POST(request: Request) {
  try {
    // Bearer-token authentication; no ambient-cookie authorization.
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 8192) throw new HttpError(413, "Request too large.");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    } catch { throw new HttpError(400, "Invalid JSON request."); }
    await ensureCheckoutTables();
    const user = await userId(request);

    if (body.action === "create") {
      const course = courses.find(item => item.id === body.courseId);
      if (!course) throw new HttpError(400, "Unknown course.");
      const { amount, code } = price(course, body.promo);
      const client = await db().connect();
      let order: Order | undefined;

      try {
        await client.query("BEGIN");
        // Serialise creation per user, including requests across server instances.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [user]);
        const access = await client.query("SELECT 1 FROM academy_access WHERE user_id=$1 AND course_id=$2", [user, course.id]);
        if (access.rowCount) {
          await client.query("COMMIT");
          return json({ status: "granted", courseId: course.id });
        }
        const recent = await client.query(
          "SELECT count(*)::int AS count FROM academy_orders WHERE user_id=$1 AND created_at > now()-interval '1 hour'", [user],
        );
        const reusable = await client.query<Order>(
          `SELECT * FROM academy_orders WHERE user_id=$1 AND course_id=$2 AND amount=$3
           AND status='pending' AND razorpay_order_id IS NOT NULL
           AND created_at > now()-interval '30 minutes' ORDER BY created_at DESC LIMIT 1`,
          [user, course.id, amount],
        );
        order = reusable.rows[0];
        if (!order) {
          if (recent.rows[0].count >= 10) throw new HttpError(429, "Too many checkout attempts. Please try again later.");
          // Commit a durable pending order BEFORE calling the payment provider.
          const result = await client.query<Order>(
            `INSERT INTO academy_orders(id,user_id,course_id,amount,currency,promo,status)
             VALUES($1,$2,$3,$4,'INR',$5,'pending') RETURNING *`,
            [randomUUID(), user, course.id, amount, code],
          );
          order = result.rows[0];
        }
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }

      if (!order!.razorpay_order_id) {
        try {
          const providerOrder = await razorpay<{ id: string; amount: number; currency: string; receipt: string }>("orders", {
            amount: order!.amount, currency: "INR", receipt: order!.id,
            notes: { academy_order_id: order!.id },
          });
          if (!/^order_[A-Za-z0-9]+$/.test(providerOrder.id) ||
              providerOrder.amount !== order!.amount || providerOrder.currency !== "INR" ||
              providerOrder.receipt !== order!.id) throw new Error("Provider order mismatch");
          await db().query("UPDATE academy_orders SET razorpay_order_id=$1 WHERE id=$2 AND status='pending'", [providerOrder.id, order!.id]);
          order!.razorpay_order_id = providerOrder.id;
        } catch (error) {
          // Never retry an uncertain provider creation against this local order.
          // Reconcile creation_failed rows with Razorpay by receipt operationally.
          await db().query("UPDATE academy_orders SET status='creation_failed' WHERE id=$1 AND razorpay_order_id IS NULL", [order!.id]);
          throw error;
        }
      }
      return json({ status: "pending", key: env("RAZORPAY_KEY_ID"), orderId: order!.razorpay_order_id, amount: order!.amount, currency: "INR" });
    }

    if (body.action === "verify") {
      const orderId = body.razorpay_order_id;
      const paymentId = body.razorpay_payment_id;
      const signature = body.razorpay_signature;
      if (typeof orderId !== "string" || !/^order_[A-Za-z0-9]{1,80}$/.test(orderId) ||
          typeof paymentId !== "string" || !/^pay_[A-Za-z0-9]{1,80}$/.test(paymentId) ||
          typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature))
        throw new HttpError(400, "Invalid payment verification details.");

      const result = await db().query<Order>(
        "SELECT * FROM academy_orders WHERE razorpay_order_id=$1 AND user_id=$2", [orderId, user],
      );
      const order = result.rows[0];
      if (!order) throw new HttpError(404, "Order not found.");

      const expected = createHmac("sha256", env("RAZORPAY_KEY_SECRET"))
        .update(`${order.razorpay_order_id}|${paymentId}`).digest();
      if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
        throw new HttpError(400, "Payment signature verification failed.");

      // A valid checkout signature alone is NOT proof of capture.
      const payment = await razorpay<Payment>(`payments/${encodeURIComponent(paymentId)}`);
      if (payment.id !== paymentId || payment.order_id !== order.razorpay_order_id ||
          payment.amount !== order.amount || payment.currency !== order.currency)
        throw new HttpError(400, "Payment does not match this order.");
      if (payment.status !== "captured" || payment.captured !== true || payment.amount_refunded !== 0)
        return json({ status: "pending", message: "No access granted. A captured, unrefunded payment is required." }, 202);

      const client = await db().connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query<Order>("SELECT * FROM academy_orders WHERE id=$1 FOR UPDATE", [order.id]);
        if (!locked.rows[0] || !["pending", "paid"].includes(locked.rows[0].status))
          throw new HttpError(409, "This order requires support review.");
        // Payment ID uniqueness prevents applying one payment to multiple orders.
        await client.query(
          `UPDATE academy_orders SET status='paid',razorpay_payment_id=$1,paid_at=COALESCE(paid_at,now())
           WHERE id=$2 AND (razorpay_payment_id IS NULL OR razorpay_payment_id=$1)`,
          [paymentId, order.id],
        );
        await client.query(
          `INSERT INTO academy_access(user_id,course_id,order_id) VALUES($1,$2,$3)
           ON CONFLICT(user_id,course_id) DO NOTHING`,
          [user, order.course_id, order.id],
        );
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      return json({ status: "granted", courseId: order.course_id });
    }

    throw new HttpError(400, "Unknown checkout action.");
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    // Do not log tokens, signatures, request bodies, or provider secrets.
    console.error("Academy checkout internal failure", { type: error instanceof Error ? error.name : "Unknown" });
    return json({ error: "Checkout could not be completed. If you paid, retry verification rather than paying again." }, 500);
  }
}
