// src/app/courses/page.tsx
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { adminDb, requireOwner } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Course = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price_paise: number;
  category: string;
  level: string;
  status: string;
};
type Module = { id: string; course_id: string; title: string; position: number };
type Lesson = {
  id: string;
  module_id: string;
  title: string;
  video_url: string;
  video_type: string;
  is_free_preview: boolean;
  position: number;
};
type Kind = "course" | "module" | "lesson";

const tables = {
  course: "courses",
  module: "course_modules",
  lesson: "course_lessons",
} as const;

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function integer(form: FormData, name: string) {
  const value = Number(text(form, name));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}.`);
  return value;
}

function youtube(value: string) {
  const parsed = new URL(value);
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com"].includes(host)
  ) throw new Error("Use an HTTPS YouTube video URL.");

  const parts = parsed.pathname.split("/").filter(Boolean);
  const videoId = host === "youtu.be"
    ? parts[0]
    : parsed.pathname === "/watch"
      ? parsed.searchParams.get("v")
      : ["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : null;
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID.");
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function save(kind: Kind, form: FormData) {
  "use server";
  await requireOwner();
  if (!Object.hasOwn(tables, kind)) throw new Error("Invalid record type.");
  const id = text(form, "id");
  const title = text(form, "title");
  if (!title || title.length > 200) throw new Error("A title of up to 200 characters is required.");

  let values: Record<string, string | number | boolean>;
  if (kind === "course") {
    const slug = text(form, "slug");
    const status = text(form, "status");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 200) {
      throw new Error("Use a lowercase, hyphen-separated slug.");
    }
    if (!["draft", "published"].includes(status)) throw new Error("Invalid status.");
    const category = text(form, "category");
    const level = text(form, "level");
    if (!["Stock", "Crypto", "Forex", "Psychology", "Advanced"].includes(category)) {
      throw new Error("Invalid category.");
    }
    if (!["Beginner", "Intermediate", "Advanced", "All levels"].includes(level)) {
      throw new Error("Invalid level.");
    }
    values = {
      title,
      slug,
      description: text(form, "description"),
      price_paise: integer(form, "price_paise"),
      category,
      level,
      status,
    };
  } else if (kind === "module") {
    const course_id = text(form, "course_id");
    if (!course_id) throw new Error("Course is required.");
    values = { title, course_id, position: integer(form, "position") };
  } else {
    const module_id = text(form, "module_id");
    if (!module_id) throw new Error("Module is required.");
    values = {
      title,
      module_id,
      video_url: youtube(text(form, "video_url")),
      video_type: "youtube",
      is_free_preview: form.get("is_free_preview") === "on",
      position: integer(form, "position"),
    };
  }

  const db = adminDb();
  const { error } = id
    ? await db.from(tables[kind]).update(values).eq("id", id)
    : await db.from(tables[kind]).insert(values);
  if (error) throw new Error("Unable to save. Check unique slugs, parent records, and database constraints.");
  revalidatePath("/courses");
  revalidatePath("/");
}

async function remove(kind: Kind, form: FormData) {
  "use server";
  await requireOwner();
  if (!Object.hasOwn(tables, kind)) throw new Error("Invalid record type.");
  const id = text(form, "id");
  if (!id || form.get("confirm") !== "on") throw new Error("Confirm deletion.");
  const { error } = await adminDb().from(tables[kind]).delete().eq("id", id);
  if (error) throw new Error("Deletion blocked. Check related records; use draft status for referenced courses.");
  revalidatePath("/courses");
  revalidatePath("/");
}

function DeleteForm({ kind, id }: { kind: Kind; id: string }) {
  return (
    <form action={remove.bind(null, kind)} style={{ marginTop: 12 }}>
      <input type="hidden" name="id" value={id} />
      <label>
        <input name="confirm" type="checkbox" required /> Confirm permanent deletion
        {kind !== "lesson" && " including child modules/lessons"}
      </label>{" "}
      <button type="submit">Delete {kind}</button>
    </form>
  );
}

function CourseForm({ course }: { course?: Course }) {
  return (
    <form action={save.bind(null, "course")} style={{ display: "grid", gap: 10 }}>
      {course && <input type="hidden" name="id" value={course.id} />}
      <label>Title <input name="title" defaultValue={course?.title} maxLength={200} required /></label>
      <label>Slug <input name="slug" defaultValue={course?.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={200} required /></label>
      <label>Description <textarea name="description" defaultValue={course?.description ?? ""} rows={4} /></label>
      <label>Price (INR paise) <input name="price_paise" type="number" min={0} step={1} defaultValue={course?.price_paise ?? 0} required /></label>
      <label>
        Category
        <select name="category" defaultValue={course?.category ?? "Stock"}>
          {["Stock", "Crypto", "Forex", "Psychology", "Advanced"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>
        Level
        <select name="level" defaultValue={course?.level ?? "Beginner"}>
          {["Beginner", "Intermediate", "Advanced", "All levels"].map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <label>
        Status
        <select name="status" defaultValue={course?.status ?? "draft"}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </label>
      <button type="submit">{course ? "Save course" : "Create course"}</button>
    </form>
  );
}

function ModuleForm({ courseId, module }: { courseId: string; module?: Module }) {
  return (
    <form action={save.bind(null, "module")} style={{ display: "grid", gap: 10 }}>
      {module && <input type="hidden" name="id" value={module.id} />}
      <input type="hidden" name="course_id" value={courseId} />
      <label>Module title <input name="title" defaultValue={module?.title} maxLength={200} required /></label>
      <label>Display order <input name="position" type="number" min={0} step={1} defaultValue={module?.position ?? 0} required /></label>
      <button type="submit">{module ? "Save module" : "Add module"}</button>
    </form>
  );
}

function LessonForm({ moduleId, lesson }: { moduleId: string; lesson?: Lesson }) {
  return (
    <form action={save.bind(null, "lesson")} style={{ display: "grid", gap: 10 }}>
      {lesson && <input type="hidden" name="id" value={lesson.id} />}
      <input type="hidden" name="module_id" value={moduleId} />
      <label>Lesson title <input name="title" defaultValue={lesson?.title} maxLength={200} required /></label>
      <label>YouTube video URL <input name="video_url" type="url" defaultValue={lesson?.video_url} required /></label>
      <p>Video type: youtube</p>
      <label><input name="is_free_preview" type="checkbox" defaultChecked={lesson?.is_free_preview ?? false} /> Free preview</label>
      <label>Display order <input name="position" type="number" min={0} step={1} defaultValue={lesson?.position ?? 0} required /></label>
      <button type="submit">{lesson ? "Save lesson" : "Add lesson"}</button>
    </form>
  );
}

async function loadAll<T>(table: string, columns: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; ) {
    const { data, error } = await adminDb()
      .from(table)
      .select(columns)
      .order(order)
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error(`Unable to load ${table}.`);
    if (!data?.length) break;
    rows.push(...(data as unknown as T[]));
    offset += data.length;
  }
  return rows;
}

export default async function CoursesPage() {
  await requireOwner();
  const [courses, modules, lessons] = await Promise.all([
    loadAll<Course>("courses", "id,title,slug,description,price_paise,category,level,status", "title"),
    loadAll<Module>("course_modules", "id,course_id,title,position", "position"),
    loadAll<Lesson>("course_lessons", "id,module_id,title,video_url,video_type,is_free_preview,position", "position"),
  ]);

  return (
    <main style={{ maxWidth: 1000, margin: "32px auto", padding: 24 }}>
      <Link href="/">Dashboard</Link>
      <h1>Courses</h1>
      <details>
        <summary>Create course</summary>
        <CourseForm />
      </details>
      <h2 id="lessons">Courses, modules, and lessons</h2>
      <p>Expand a course to manage its modules and lessons. New courses default to draft.</p>
      {!courses.length && <p>No courses.</p>}
      {courses.map((course) => (
        <details key={course.id} style={{ border: "1px solid #aaa", padding: 16, margin: "16px 0" }}>
          <summary>{course.title} — {course.status}</summary>
          <h3>Course details</h3>
          <CourseForm course={course} />
          <DeleteForm kind="course" id={course.id} />
          <h3>Modules</h3>
          {modules.filter((module) => module.course_id === course.id).map((module) => (
            <details key={module.id} style={{ border: "1px solid #ccc", padding: 16, margin: "16px 0" }}>
              <summary>{module.position}. {module.title}</summary>
              <ModuleForm courseId={course.id} module={module} />
              <DeleteForm kind="module" id={module.id} />
              <h4>Lessons</h4>
              {lessons.filter((lesson) => lesson.module_id === module.id).map((lesson) => (
                <details key={lesson.id} style={{ padding: 12, margin: "12px 0", border: "1px solid #ddd" }}>
                  <summary>{lesson.position}. {lesson.title}{lesson.is_free_preview ? " — Free preview" : ""}</summary>
                  <LessonForm moduleId={module.id} lesson={lesson} />
                  <DeleteForm kind="lesson" id={lesson.id} />
                </details>
              ))}
              <details>
                <summary>Add lesson</summary>
                <LessonForm moduleId={module.id} />
              </details>
            </details>
          ))}
          <details>
            <summary>Add module</summary>
            <ModuleForm courseId={course.id} />
          </details>
        </details>
      ))}
    </main>
  );
}
