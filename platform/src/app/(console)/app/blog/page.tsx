import { FolderCog, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PostRowActions } from "@/components/blog/post-row-actions";
import { Badge, EmptyState, PageHeader, formatDate } from "@/components/ui";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listCategories, listPosts } from "@/server/blog";

export const metadata: Metadata = { title: "Blog" };
export const dynamic = "force-dynamic";

const chip = (on: boolean) =>
  `min-h-[36px] rounded-full border px-3 py-1.5 text-sm ${on ? "border-primary bg-primary/10 text-primary" : "border-line bg-raised text-muted hover:text-ink"}`;

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = { PUBLISHED: "success", DRAFT: "warning", ARCHIVED: "neutral" };

/** The agency's blog: write or AI-draft posts, then publish them to the public site. */
export default async function BlogPage({ searchParams }: { searchParams: Promise<{ status?: string; category?: string; q?: string }> }) {
  const { principal } = await requirePermission("blog:read");
  const { status, category, q } = await searchParams;
  const canWrite = can(principal, "blog:write");
  const [posts, categories] = await Promise.all([
    listPosts(principal, { status, categoryId: category, q: q?.slice(0, 80) }),
    listCategories(principal),
  ]);
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { status, category, q, ...over };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/blog${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Blog"
        subtitle="Write posts yourself or draft them with AI, set their search details, and publish them to the public blog."
        actions={
          canWrite ? (
            <div className="flex items-center gap-2">
              <Link href="/app/blog/categories" className="btn-quiet">
                <FolderCog className="h-4 w-4" /> Categories
              </Link>
              <Link href="/app/blog/new" className="btn-primary">
                <Plus className="h-4 w-4" /> New post
              </Link>
            </div>
          ) : null
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <label className="sr-only" htmlFor="bq">Search posts</label>
        <input id="bq" name="q" defaultValue={q ?? ""} className="input max-w-xs" placeholder="Search by title or excerpt" />
        {status && <input type="hidden" name="status" value={status} />}
        {category && <input type="hidden" name="category" value={category} />}
        <button className="btn-quiet" type="submit">Search</button>
      </form>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter posts">
        <Link href={href({ status: undefined })} className={chip(!status)}>Open</Link>
        <Link href={href({ status: "DRAFT" })} className={chip(status === "DRAFT")}>Drafts</Link>
        <Link href={href({ status: "PUBLISHED" })} className={chip(status === "PUBLISHED")}>Published</Link>
        <Link href={href({ status: "ARCHIVED" })} className={chip(status === "ARCHIVED")}>Archived</Link>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
        <Link href={href({ category: undefined })} className={chip(!category)}>All categories</Link>
        {categories.map((c) => (
          <Link key={c.id} href={href({ category: c.id })} className={chip(category === c.id)}>
            {c.name} ({c._count.posts})
          </Link>
        ))}
      </nav>

      {posts.length === 0 ? (
        <EmptyState
          title={status || category || q ? "No posts match" : "No posts yet"}
          action={!status && !category && !q && canWrite ? <Link href="/app/blog/new" className="btn-primary">Write your first post</Link> : undefined}
        >
          {status || category || q ? "Try another filter." : "Draft one with AI in a minute, or write it yourself."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li key={post.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link href={`/app/blog/${post.id}`} className="block truncate font-semibold text-ink hover:text-primary">
                  {post.title}
                </Link>
                <p className="mt-0.5 truncate text-sm text-muted">
                  {post.category ? `${post.category.name} · ` : ""}
                  {post.status === "PUBLISHED" && post.publishedAt ? `Published ${formatDate(post.publishedAt)}` : `Updated ${formatDate(post.updatedAt)}`}
                  {post.author ? ` · ${post.author.name}` : ""}
                  {post.noindex ? " · noindex" : ""}
                </p>
              </div>
              <Badge tone={STATUS_TONE[post.status] ?? "neutral"}>{post.status === "PUBLISHED" ? "Published" : post.status === "DRAFT" ? "Draft" : "Archived"}</Badge>
              {post.status === "PUBLISHED" && (
                <Link href={`/blog/${post.slug}`} target="_blank" className="btn-quiet text-sm">
                  View
                </Link>
              )}
              {canWrite && <PostRowActions id={post.id} status={post.status} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
