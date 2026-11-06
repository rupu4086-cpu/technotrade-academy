// Shared records store for the public site.
//
// SINGLE STORE: PostgreSQL (Supabase) via the `pg` driver, table `records`.
// This replaces the old `node:sqlite` file store (`academy.sqlite` under
// `.data/`) that the course-detail, My Learning and hidden-admin pages used.
// A local SQLite file cannot work on Vercel: serverless functions have an
// ephemeral, mostly read-only filesystem, so data written to a file would
// vanish between requests. The `records` table is created automatically on
// first use (CREATE TABLE IF NOT EXISTS), so no manual migration is needed;
// it lives in the same PostgreSQL database as the checkout route's
// `academy_orders` / `academy_access` tables (DATABASE_URL).
//
// The store keeps the same key/value shape the old code used
// (`course:<id>`, `promo:<CODE>`, `enrollment:<userId>:<courseId>`,
// `order:<id>`, `settings`, `audit:<id>`), so page behaviour is unchanged —
// only the backend changed. All functions are async; call sites must await.
//
// Checkout rule preserved: nothing here marks an order paid or grants
// access. Payment verification lives in `src/app/learn/page.tsx`
// (re-checks the Razorpay payment link server-side) and in
// `src/app/api/checkout/route.ts` (signature + captured-status check);
// both only grant access after a verified captured payment.

import "server-only";
import { Pool } from "pg";

type GlobalWithPool = typeof globalThis & {
  technotradeStorePool?: Pool;
};

function pool(): Pool {
  const g = globalThis as GlobalWithPool;
  if (!g.technotradeStorePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing environment variable: DATABASE_URL");
    }
    g.technotradeStorePool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 10000,
    });
  }
  return g.technotradeStorePool;
}

async function ensureTable(): Promise<void> {
  // CREATE TABLE IF NOT EXISTS is safe to run concurrently.
  await pool().query(
    "CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
}

export async function getRecord<T>(key: string): Promise<T | undefined> {
  await ensureTable();
  const result = await pool().query<{ value: string }>(
    "SELECT value FROM records WHERE key = $1",
    [key],
  );
  const row = result.rows[0];
  return row ? (JSON.parse(row.value) as T) : undefined;
}

export async function allRecords<T>(prefix: string): Promise<T[]> {
  await ensureTable();
  const result = await pool().query<{ value: string }>(
    "SELECT value FROM records WHERE key LIKE $1",
    [`${prefix}%`],
  );
  return result.rows.map((row) => JSON.parse(row.value) as T);
}

export async function putRecord(key: string, value: unknown): Promise<void> {
  await ensureTable();
  await pool().query(
    "INSERT INTO records (key, value) VALUES ($1, $2) " +
      "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, JSON.stringify(value)],
  );
}
