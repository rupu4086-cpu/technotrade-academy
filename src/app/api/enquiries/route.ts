// POST /api/enquiries — save a contact/home enquiry to the enquiries table.
import { NextResponse } from "next/server";
import { sb, ConfigError } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (name.length < 2) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (message.length < 10) return NextResponse.json({ error: "Enter a message of at least 10 characters." }, { status: 400 });
    await sb("enquiries", {
      method: "POST",
      body: { name, email, message },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ConfigError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "Your enquiry could not be saved. Please try again." }, { status: 500 });
  }
}
