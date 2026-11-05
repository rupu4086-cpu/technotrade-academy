// src/app/ads/page.tsx
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { adminDb, requireOwner } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const placements = ["home_top", "home_middle", "courses", "course_detail", "sidebar"] as const;

type Ad = {
  id: string;
  title: string;
  image_url: string | null;
  html_code: string | null;
  link_url: string | null;
  placement: string;
  start_at: string | null;
  end_at: string | null;
  is_active: boolean;
  display_order: number;
};

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function url(value: string) {
  if (!value) return null;
  const parsed = new URL(value);
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are permitted.");
  }
  return parsed.href;
}

function date(value: string) {
  if (!value) return null;
  // datetime-local fields on this page explicitly represent UTC.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("Invalid UTC date.");
  }
  const parsed = new Date(`${value}:00Z`);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Invalid date.");
  return parsed.toISOString();
}

async function saveAd(form: FormData) {
  "use server";
  await requireOwner();
  const id = text(form, "id");
  const title = text(form, "title");
  const image_url = url(text(form, "image_url"));
  const html_code = text(form, "html_code") || null;
  const placement = text(form, "placement");
  const start_at = date(text(form, "start_at"));
  const end_at = date(text(form, "end_at"));
  const display_order = Number(text(form, "display_order") || "0");

  if (!title || title.length > 200) throw new Error("A title of up to 200 characters is required.");
  if (Boolean(image_url) === Boolean(html_code)) {
    throw new Error("Provide either an image URL or HTML code, not both.");
  }
  if (html_code && html_code.length > 100000) throw new Error("HTML is too long.");
  if (!placements.some((value) => value === placement)) throw new Error("Invalid placement.");
  if (!Number.isSafeInteger(display_order) || display_order < 0) throw new Error("Invalid display order.");
  if (start_at && end_at && start_at >= end_at) throw new Error("End must be after start.");

  const values = {
    title,
    image_url,
    html_code,
    link_url: url(text(form, "link_url")),
    placement,
    start_at,
    end_at,
    // Creation is always inactive, regardless of submitted checkbox values.
    is_active: id ? form.get("is_active") === "on" : false,
    display_order,
  };
  const db = adminDb();
  const { error } = id
    ? await db.from("ads").update(values).eq("id", id)
    : await db.from("ads").insert(values);
  if (error) throw new Error("Unable to save ad.");
  revalidatePath("/ads");
}

async function deleteAd(form: FormData) {
  "use server";
  await requireOwner();
  const id = text(form, "id");
  if (!id || form.get("confirm") !== "on") throw new Error("Confirm deletion.");
  const { error } = await adminDb().from("ads").delete().eq("id", id);
  if (error) throw new Error("Unable to delete ad.");
  revalidatePath("/ads");
}

function AdForm({ ad }: { ad?: Ad }) {
  return (
    <form action={saveAd} style={{ display: "grid", gap: 12 }}>
      {ad && <input type="hidden" name="id" value={ad.id} />}
      <label>Title <input name="title" defaultValue={ad?.title} maxLength={200} required /></label>
      <label>Image URL <input name="image_url" type="url" defaultValue={ad?.image_url ?? ""} /></label>
      <label>
        HTML code (alternative to image; never rendered here)
        <textarea name="html_code" defaultValue={ad?.html_code ?? ""} maxLength={100000} rows={5} />
      </label>
      <label>Link URL <input name="link_url" type="url" defaultValue={ad?.link_url ?? ""} /></label>
      <label>
        Placement
        <select name="placement" defaultValue={ad?.placement ?? "home_top"}>
          {placements.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>
        Start at (UTC)
        <input name="start_at" type="datetime-local" defaultValue={ad?.start_at ? new Date(ad.start_at).toISOString().slice(0, 16) : ""} />
      </label>
      <label>
        End at (UTC)
        <input name="end_at" type="datetime-local" defaultValue={ad?.end_at ? new Date(ad.end_at).toISOString().slice(0, 16) : ""} />
      </label>
      <label>Display order <input name="display_order" type="number" min={0} step={1} defaultValue={ad?.display_order ?? 0} required /></label>
      {ad ? (
        <label><input name="is_active" type="checkbox" defaultChecked={ad.is_active} /> Active</label>
      ) : <p>New ads are saved inactive. Edit after creation to enable.</p>}
      <button type="submit">{ad ? "Save ad" : "Create inactive ad"}</button>
    </form>
  );
}

export default async function AdsPage() {
  await requireOwner();
  const ads: Ad[] = [];
  for (let offset = 0; ; ) {
    const { data, error } = await adminDb()
      .from("ads")
      .select("id,title,image_url,html_code,link_url,placement,start_at,end_at,is_active,display_order")
      .order("display_order")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Unable to load ads.");
    if (!data?.length) break;
    ads.push(...(data as Ad[]));
    offset += data.length;
  }

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: 24 }}>
      <Link href="/">Dashboard</Link>
      <h1>Ads</h1>
      <p>Ads are off by default. All schedule times are UTC. No ad content is rendered in this app.</p>
      <details>
        <summary>Add ad</summary>
        <AdForm />
      </details>
      {ads.length === 0 && <p>No ads.</p>}
      {ads.map((ad) => (
        <section key={ad.id} style={{ border: "1px solid #aaa", marginTop: 20, padding: 16 }}>
          <h2>{ad.title}</h2>
          <p>{ad.placement} · {ad.is_active ? "Enabled; schedule applies" : "Inactive"} · Order {ad.display_order}</p>
          <details>
            <summary>Edit</summary>
            <AdForm ad={ad} />
          </details>
          <form action={deleteAd} style={{ marginTop: 16 }}>
            <input type="hidden" name="id" value={ad.id} />
            <label><input type="checkbox" name="confirm" required /> Confirm permanent deletion </label>
            <button type="submit">Delete ad</button>
          </form>
        </section>
      ))}
    </main>
  );
}
