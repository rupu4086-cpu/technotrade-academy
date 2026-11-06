// Enquiries — read-only list plus delete.
// Uses the owner's Supabase `enquiries` table:
//   name, email, phone, message, created_at.
// Note: this table has no status column, so there is no new/contacted/
// closed workflow here — enquiries are listed newest first and can be
// deleted once handled.

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { adminDb, requireOwner } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Enquiry = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  created_at: string;
};

async function deleteEnquiry(form: FormData) {
  "use server";
  await requireOwner();
  const id = form.get("id");
  if (typeof id !== "string" || !id || form.get("confirm") !== "on") {
    throw new Error("Confirm deletion.");
  }
  const { error } = await adminDb().from("enquiries").delete().eq("id", id);
  if (error) throw new Error("Unable to delete enquiry.");
  revalidatePath("/enquiries");
}

export default async function EnquiriesPage() {
  await requireOwner();
  const enquiries: Enquiry[] = [];
  for (let offset = 0; ; ) {
    const { data, error } = await adminDb()
      .from("enquiries")
      .select("id,name,email,phone,message,created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + 499);
    if (error) throw new Error("Unable to load enquiries.");
    if (!data?.length) break;
    enquiries.push(...(data as Enquiry[]));
    offset += data.length;
  }

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: 24 }}>
      <Link href="/">Dashboard</Link>
      <h1>Enquiries</h1>
      <p>Newest first. Reply by email, then delete the enquiry once handled.</p>
      {enquiries.length === 0 && <p>No enquiries.</p>}
      {enquiries.map((enquiry) => (
        <section key={enquiry.id} style={{ border: "1px solid #aaa", marginTop: 16, padding: 16 }}>
          <h2>{enquiry.name}</h2>
          <p>
            {enquiry.email ? <a href={`mailto:${enquiry.email}`}>{enquiry.email}</a> : "No email"}
            {enquiry.phone ? ` · ${enquiry.phone}` : ""}
            {` · ${new Date(enquiry.created_at).toISOString()}`}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{enquiry.message || ""}</p>
          <form action={deleteEnquiry}>
            <input type="hidden" name="id" value={enquiry.id} />
            <label><input type="checkbox" name="confirm" required /> Confirm permanent deletion </label>
            <button type="submit">Delete enquiry</button>
          </form>
        </section>
      ))}
    </main>
  );
}
