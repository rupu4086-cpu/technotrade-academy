// Course Detail — curriculum, free preview, Buy Now. Reads the published
// course, its modules and lessons from Supabase.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getCourseBySlug, listModules, listLessons, sb, money, youtubeId,
} from "@/lib/supabase";
import { SiteNav, SiteFooter, pageWrap, cardStyle } from "@/lib/nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CourseDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let course: Awaited<ReturnType<typeof getCourseBySlug>> = null;
  let loadError = "";
  try {
    course = await getCourseBySlug(slug);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Course could not be loaded.";
  }
  if (!course) {
    if (loadError) {
      return (
        <>
          <SiteNav />
          <main style={pageWrap}><p role="status">{loadError}</p><p><Link href="/courses">Back to courses</Link></p></main>
          <SiteFooter />
        </>
      );
    }
    notFound();
  }
  const session = await getSession();
  const [modules, lessons] = await Promise.all([
    listModules(course.id).catch(() => []),
    listLessons(course.id).catch(() => []),
  ]).catch(() => [[], []] as const);
  const enrolled = session
    ? (await sb<{ id: string }[]>(`enrollments?select=id&user_id=eq.${session.sub}&course_id=eq.${course.id}`).catch(() => [])).length > 0
    : false;
  const preview = lessons.find((l) => l.is_free_preview);

  return (
    <>
      <SiteNav />
      <main style={pageWrap}>
        <p>
          <Link href="/courses">← All courses</Link> · {course.category} · {course.level}
        </p>
        <h1 style={{ fontSize: 38, margin: "8px 0" }}>{course.title}</h1>
        <p style={{ lineHeight: 1.7, color: "#526174", maxWidth: 720 }}>{course.description}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          <div>
            {preview && youtubeId(preview.video_url) && (
              <section style={{ ...cardStyle, marginBottom: 20 }}>
                <h2 style={{ marginTop: 0 }}>Free preview — {preview.title}</h2>
                <iframe
                  title={preview.title}
                  src={`https://www.youtube-nocookie.com/embed/${youtubeId(preview.video_url)}`}
                  allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  style={{ width: "100%", aspectRatio: "16 / 9", border: 0 }}
                />
              </section>
            )}
            <section style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Curriculum</h2>
              {!lessons.length && <p>No lessons published for this course yet.</p>}
              {modules.map((module) => (
                <div key={module.id}>
                  <h3>{module.title}</h3>
                  <ul style={{ lineHeight: 2 }}>
                    {lessons.filter((l) => l.module_id === module.id).map((lesson) => (
                      <li key={lesson.id}>
                        {lesson.title}
                        {lesson.is_free_preview ? " · Free preview" : ""}
                        {lesson.duration_seconds ? ` · ${Math.round(lesson.duration_seconds / 60)} min` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {lessons.filter((l) => !l.module_id).map((lesson) => (
                <p key={lesson.id}>{lesson.title}{lesson.is_free_preview ? " · Free preview" : ""}</p>
              ))}
            </section>
          </div>
          <aside style={cardStyle}>
            <p style={{ fontSize: 30, fontWeight: 700, margin: "0 0 4px" }}>{money(course.price_paise)}</p>
            <p style={{ color: "#526174", marginTop: 0 }}>One-time payment · 18% GST included at checkout</p>
            {course.duration && <p><strong>Duration:</strong> {course.duration}</p>}
            {course.instructor && <p><strong>Instructor:</strong> {course.instructor}</p>}
            <p><strong>Lessons:</strong> {lessons.length || course.lessons_count}</p>
            {enrolled ? (
              <p><Link href={`/learn?course=${course.slug}`} style={{ display: "inline-block", background: "#0f766e", color: "#fff", padding: "12px 18px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>Continue learning →</Link></p>
            ) : (
              <p>
                <Link href={`/checkout?course=${course.slug}`} style={{ display: "inline-block", background: "#0f766e", color: "#fff", padding: "12px 18px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
                  Buy Now →
                </Link>
              </p>
            )}
            <p style={{ fontSize: 13, color: "#526174", lineHeight: 1.7 }}>
              Access is granted only after a verified captured Razorpay payment. Free courses unlock instantly.
              Refund terms: contact support within 7 days of purchase with your order reference.
            </p>
            {!session && <p><Link href="/signup">Create an account</Link> to enrol.</p>}
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
