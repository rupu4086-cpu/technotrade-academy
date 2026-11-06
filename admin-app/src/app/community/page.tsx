// Community moderation — list posts plus delete.
// Uses the owner's Supabase `community_posts` table:
//   user_id, category, content, created_at.
// Deleting a post is permanent moderation; there is no edit or approve
// flow here. Posts are listed newest first.

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { adminDb, requireOwner } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Post = {
  id: string;
  user_id: string;
  category: string;
  content: string;
  created_at: string;
};

async function deletePost(form: FormData) {
  "use server";
  await requireOwner();
  const id = form.get("id");
  if (typeof id !== "string" || !id || form.get("confirm") !== "on") {
    throw new Error("Confirm deletion.");
  }
  const { error } = await adminDb().from("community_posts").delete().eq("id", id);
  if (error) throw new Error("Unable to delete post.");
  revalidatePath("/community");
}

export default async function CommunityPage() {
  await requireOwner();
  const db = adminDb();
  const [postsRes, usersRes] = await Promise.all([
    db.from("community_posts").select("id,user_id,category,content,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("users").select("id,email").limit(1000),
  ]);
  if (postsRes.error || usersRes.error) throw new Error("Unable to load community posts.");
  const users = new Map<string, string>(
    (usersRes.data as { id: string; email: string }[]).map((u) => [u.id, u.email]),
  );
  const posts = postsRes.data as Post[];

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: 24 }}>
      <Link href="/">Dashboard</Link>
      <h1>Community</h1>
      <p>Newest first (latest 500). Delete a post to moderate it — deletion is permanent.</p>
      {posts.length === 0 && <p>No community posts.</p>}
      {posts.map((post) => (
        <section key={post.id} style={{ border: "1px solid #aaa", marginTop: 16, padding: 16 }}>
          <h2>{post.category}</h2>
          <p>
            {users.get(post.user_id) || post.user_id}
            {` · ${new Date(post.created_at).toISOString()}`}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{post.content}</p>
          <form action={deletePost}>
            <input type="hidden" name="id" value={post.id} />
            <label><input type="checkbox" name="confirm" required /> Confirm permanent deletion </label>
            <button type="submit">Delete post</button>
          </form>
        </section>
      ))}
    </main>
  );
}
