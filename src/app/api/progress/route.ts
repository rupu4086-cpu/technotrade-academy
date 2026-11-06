// POST /api/progress — mark a lesson complete (enrolled students only).
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sb, ConfigError } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const body = await request.json().catch(() => null);
    const lessonId = typeof body?.lessonId === "string" ? body.lessonId : "";
    const courseId = typeof body?.courseId === "string" ? body.courseId : "";
    if (!lessonId || !courseId) return NextResponse.json({ error: "Missing lesson." }, { status: 400 });
    const enrolled = await sb<{ id: string }[]>(
      `enrollments?select=id&user_id=eq.${session.sub}&course_id=eq.${courseId}`,
    );
    if (!enrolled.length) return NextResponse.json({ error: "You do not have access to this course." }, { status: 403 });
    const lessons = await sb<{ id: string }[]>(`course_lessons?select=id&id=eq.${lessonId}&course_id=eq.${courseId}&limit=1`);
    if (!lessons.length) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    await sb("lesson_progress", {
      method: "POST", prefer: "resolution=merge-duplicates",
      body: { user_id: session.sub, lesson_id: lessonId, completed: true, position_seconds: 0 },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ConfigError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "Progress could not be saved." }, { status: 500 });
  }
}
