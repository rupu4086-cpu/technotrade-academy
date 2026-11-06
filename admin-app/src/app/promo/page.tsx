// Promo codes — list, create, edit, delete.
// Uses the owner's Supabase `promo_codes` table:
//   code (unique), type ('PERCENTAGE' | 'FIXED'), value,
//   max_discount_paise, min_spend_paise, usage_limit, used_count,
//   expires_at, is_active.
// Meaning of `value`: PERCENTAGE = whole percent (1–90); FIXED = paise.
// `used_count` is read-only here — it is maintained by checkout, never
// edited by hand, so usage can never be faked from this screen.

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { adminDb, requireOwner } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Promo = {
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

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalInt(form: FormData, name: string): number | null {
  const raw = text(form, name);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}.`);
  return value;
}

function dateValue(form: FormData, name: string): string | null {
  const raw = text(form, name);
  if (!raw) return null;
  // datetime-local fields on this page explicitly represent UTC.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new Error("Invalid UTC date.");
  const parsed = new Date(`${raw}:00Z`);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Invalid date.");
  return parsed.toISOString();
}

async function savePromo(form: FormData) {
  "use server";
  await requireOwner();
  const id = text(form, "id");
  const code = text(form, "code").toUpperCase();
  const type = text(form, "type");
  const value = Number(text(form, "value"));
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) throw new Error("Use a code of 2–32 letters, digits, - or _.");
  if (!["PERCENTAGE", "FIXED"].includes(type)) throw new Error("Invalid promo type.");
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid discount value.");
  if (type === "PERCENTAGE" && value > 90) throw new Error("Percentage discount is at most 90%.");
  const values = {
    code,
    type,
    value,
    max_discount_paise: optionalInt(form, "max_discount_paise"),
    min_spend_paise: Number(text(form, "min_spend_paise") || "0"),
    usage_limit: optionalInt(form, "usage_limit"),
    expires_at: dateValue(form, "expires_at"),
    is_active: form.get("is_active") === "on",
  };
  if (!Number.isSafeInteger(values.min_spend_paise) || values.min_spend_paise < 0) {
    throw new Error("Invalid minimum spend.");
  }
  const db = adminDb();
  const { error } = id
    ? await db.from("promo_codes").update(values).eq("id", id)
    : await db.from("promo_codes").insert(values);
  if (error) throw new Error("Unable to save promo code. Check the code is unique.");
  revalidatePath("/promo");
}

async function deletePromo(form: FormData) {
  "use server";
  await requireOwner();
  const id = text(form, "id");
  if (!id || form.get("confirm") !== "on") throw new Error("Confirm deletion.");
  const { error } = await adminDb().from("promo_codes").delete().eq("id", id);
  if (error) throw new Error("Unable to delete promo code. It may already be used by orders.");
  revalidatePath("/promo");
}

function PromoForm({ promo }: { promo?: Promo }) {
  return (
    <form action={savePromo} style={{ display: "grid", gap: 10 }}>
      {promo && <input type="hidden" name="id" value={promo.id} />}
      <label>Code <input name="code" defaultValue={promo?.code} maxLength={32} required /></label>
      <label>
        Type
        <select name="type" defaultValue={promo?.type ?? "PERCENTAGE"}>
          <option value="PERCENTAGE">Percentage (value = whole %, max 90)</option>
          <option value="FIXED">Fixed (value = paise)</option>
        </select>
      </label>
      <label>Value <input name="value" type="number" min={1} step={1} defaultValue={promo?.value ?? 10} required /></label>
      <label>Max discount (paise, optional) <input name="max_discount_paise" type="number" min={0} step={1} defaultValue={promo?.max_discount_paise ?? ""} /></label>
      <label>Minimum spend (paise) <input name="min_spend_paise" type="number" min={0} step={1} defaultValue={promo?.min_spend_paise ?? 0} required /></label>
      <label>Usage limit (optional) <input name="usage_limit" type="number" min={0} step={1} defaultValue={promo?.usage_limit ?? ""} /></label>
      <label>Expires at (UTC, optional) <input name="expires_at" type="datetime-local" defaultValue={promo?.expires_at ? new Date(promo.expires_at).toISOString().slice(0, 16) : ""} /></label>
      <label><input name="is_active" type="checkbox" defaultChecked={promo?.is_active ?? true} /> Active</label>
      <button type="submit">{promo ? "Save promo code" : "Create promo code"}</button>
    </form>
  );
}

export default async function PromoPage() {
  await requireOwner();
  const promos: Promo[] = [];
  for (let offset = 0; ; ) {
    const { data, error } = await adminDb()
      .from("promo_codes")
      .select("id,code,type,value,max_discount_paise,min_spend_paise,usage_limit,used_count,expires_at,is_active")
      .order("code")
      .range(offset, offset + 499);
    if (error) throw new Error("Unable to load promo codes.");
    if (!data?.length) break;
    promos.push(...(data as Promo[]));
    offset += data.length;
  }

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: 24 }}>
      <Link href="/">Dashboard</Link>
      <h1>Promo codes</h1>
      <p>Discounts are calculated server-side at checkout. Used count is shown read-only and is never edited here.</p>
      <details>
        <summary>Add promo code</summary>
        <PromoForm />
      </details>
      {promos.length === 0 && <p>No promo codes.</p>}
      {promos.map((promo) => (
        <section key={promo.id} style={{ border: "1px solid #aaa", marginTop: 20, padding: 16 }}>
          <h2>{promo.code}</h2>
          <p>
            {promo.type === "PERCENTAGE" ? `${promo.value}% off` : `₹${(promo.value / 100).toFixed(2)} off`}
            {promo.max_discount_paise ? ` · max discount ₹${(promo.max_discount_paise / 100).toFixed(2)}` : ""}
            {` · min spend ₹${(promo.min_spend_paise / 100).toFixed(2)}`}
            {` · used ${promo.used_count}${promo.usage_limit ? ` / ${promo.usage_limit}` : ""}`}
            {` · ${promo.is_active ? "Active" : "Inactive"}`}
            {promo.expires_at ? ` · expires ${new Date(promo.expires_at).toISOString()}` : " · no expiry"}
          </p>
          <details>
            <summary>Edit</summary>
            <PromoForm promo={promo} />
          </details>
          <form action={deletePromo} style={{ marginTop: 16 }}>
            <input type="hidden" name="id" value={promo.id} />
            <label><input type="checkbox" name="confirm" required /> Confirm permanent deletion </label>
            <button type="submit">Delete promo code</button>
          </form>
        </section>
      ))}
    </main>
  );
}
