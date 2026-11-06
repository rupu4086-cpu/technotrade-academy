// My Learning — progress, lesson player (YouTube embed), free previews open
// to all, paid lessons locked until the student is enrolled (which only
// happens after a verified captured payment, or a free / Rs 0 checkout).
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  sb, listPublishedCourses, listLessons, youtubeId, money, type DbLesson,
} from "@/lib/supabase";
import { SiteNav, SiteFooter, pageWrap, cardStyle } from "@/lib/nav";
import { MarkCompleteButton } from "./mark-complete";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function MyLearning({
  searchParams,
}: { searchParams: Promise<{ course?: string; lesson?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login?next=%2Flearn");
  const query = await searchParams;

  let courses: { id: string; slug: string; title: string; description: string }[] = [];
  let enrollments: { course_id: string }[] = [];
  let loadError = "";
  try {
    courses = await listPublishedCourses();
    enrollments = await sb<{ course_id: string }[]>(
      `enrollments?select=course_id&user_id=eq.${session.sub}`,
    );
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Your courses could not be loaded.";
  }
  const enrolledIds = new Set(enrollments.map((e) => e.course_id));
  const selectedCourse = courses.find((c) => c.id === query.course || c.slug === query.course) || courses.find((c) => enrolledIds.has(c.id));

  let lessons: DbLesson[] = [];
  let completed: string[] = [];
  if (selectedCourse) {
    try {
      lessons = await listLessons(selectedCourse.id);
      const progress = await sb<{ lesson_id: string }[]>(
        `lesson_progress?select=lesson_id&user_id=eq.${session.sub}&completed=eq.true`,
      );
      completed = progress.map((p) => p.lesson_id);
    } catch { /* lessons stay empty; error shown below */ }
  }
  const isEnrolled = selectedCourse ? enrolledIds.has(selectedCourse.id) : false;
  const selectedLesson =
    lessons.find((l) => l.id === query.lesson) ||
    lessons.find((l) => !completed.includes(l.id)) ||
    lessons[0];
  const canWatch = selectedLesson ? selectedLesson.is_free_preview || isEnrolled : false;
  const percent = lessons.length
    ? Math.round((lessons.filter((l) => completed.includes(l.id)).length / lessons.length) * 100)
    : 0;

  return (
    <>
      <SiteNav />
      <main style={pageWrap}>
        <h1 style={{ fontSize: 34 }}>My Learning</h1>
        <p style={{ color: "#526174" }}>Welcome back, {session.name}. Your progress is saved to your account.</p>
        {loadError && <p role="status">{loadError}</p>}
        {!courses.length && !loadError && (
          <p style={cardStyle}>No courses are published yet. <Link href="/courses">Check the catalog</Link> — it will show “Courses coming soon” until the owner adds courses.</p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Your courses</h2>
            {courses.filter((c) => enrolledIds.has(c.id)).map((c) => (
              <p key={c.id}>
                <Link href={`/learn?course=${c.slug}`}>{c.title}</Link>
              </p>
            ))}
            {!courses.some((c) => enrolledIds.has(c.id)) && <p>No enrolled courses yet. <Link href="/courses">Browse courses</Link></p>}
            <h3>All courses</h3>
            {courses.map((c) => (
              <p key={c.id}>
                <Link href={`/courses/${c.slug}`}>{c.title}</Link>
                {enrolledIds.has(c.id) ? " · Enrolled" : " · Not enrolled"}
              </p>
            ))}
          </section>

          {selectedCourse && (
            <section style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>{selectedCourse.title}</h2>
              <p>{percent}% complete</p>
              <progress max={100} value={percent} style={{ width: "100%" }} aria-label={`${selectedCourse.title} progress`} />
              {selectedLesson && (
                <>
                  <h3>{selectedLesson.title}</h3>
                  {canWatch ? (
                    youtubeId(selectedLesson.video_url) ? (
                      <iframe
                        title={selectedLesson.title}
                        src={`https://www.youtube-nocookie.com/embed/${youtubeId(selectedLesson.video_url)}`}
                        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                        style={{ width: "100%", aspectRatio: "16 / 9", border: 0 }}
                      />
                    ) : (
                      <p>This lesson has no video link yet.</p>
                    )
                  ) : (
                    <p style={{ background: "#fef3c7", padding: 16, borderRadius: 8 }}>
                      This lesson is locked. {selectedLesson.is_free_preview ? "" : "Free preview lessons are open to everyone — this one is not a preview. "}
                      <Link href={`/checkout?course=${selectedCourse.slug}`}>Buy this course</Link> to unlock it. Access is granted only after a verified payment.
                    </p>
                  )}
                  {isEnrolled && selectedLesson && (
                    <div style={{ marginTop: 12 }}>
                      <MarkCompleteButton courseId={selectedCourse.id} lessonId={selectedLesson.id} done={completed.includes(selectedLesson.id)} />
                    </div>
                  )}
                  <h3>Curriculum</h3>
                  <ol style={{ lineHeight: 2 }}>
                    {lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <Link href={`/learn?course=${selectedCourse.slug}&lesson=${lesson.id}`}>{lesson.title}</Link>
                        {lesson.is_free_preview ? " · Free preview" : ""}
                        {completed.includes(lesson.id) ? " · Completed" : ""}
                        {!lesson.is_free_preview && !isEnrolled ? " · Locked" : ""}
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {!selectedLesson && <p>No lessons in this course yet.</p>}
            </section>
          )}
        </div>
        <p style={{ marginTop: 20, color: "#526174", fontSize: 13 }}>
          Prices are shown in INR. Paid lessons unlock only after a verified captured Razorpay payment.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
