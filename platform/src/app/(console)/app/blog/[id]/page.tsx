import type { Metadata } from "next";

import { BlogEditor } from "@/components/blog/blog-editor";
import { PageHeader } from "@/components/ui";
import type { BlogFormValues, BlogStatus } from "@/lib/blog";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getPost } from "@/server/blog";

export const metadata: Metadata = { title: "Edit post" };
export const dynamic = "force-dynamic";

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { principal, organizationId } = await requirePermission("blog:read");
  const [post, categories, brands] = await Promise.all([
    getPost(principal, id),
    db.blogCategory.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.brand.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const initial: BlogFormValues = {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? "",
    body: post.body,
    coverImageUrl: post.coverImageUrl ?? "",
    categoryId: post.categoryId ?? "",
    seoKeywords: post.seoKeywords.join(", "),
    seoTitle: post.seoTitle ?? "",
    seoDescription: post.seoDescription ?? "",
    ogImageUrl: post.ogImageUrl ?? "",
    canonicalUrl: post.canonicalUrl ?? "",
    noindex: post.noindex,
    status: post.status as BlogStatus,
  };
  return (
    <>
      <PageHeader
        title={post.title}
        subtitle={`/${post.slug} · ${post.status === "PUBLISHED" ? "published" : post.status === "DRAFT" ? "draft" : "archived"}`}
        back={{ href: "/app/blog", label: "All posts" }}
      />
      <BlogEditor initial={initial} categories={categories} brands={brands} canAi={can(principal, "ai:generate")} />
    </>
  );
}
