import type { Metadata } from "next";

import { BlogEditor } from "@/components/blog/blog-editor";
import { PageHeader } from "@/components/ui";
import { emptyBlogForm } from "@/lib/blog";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "New post" };
export const dynamic = "force-dynamic";

export default async function NewBlogPostPage() {
  const { principal, organizationId } = await requirePermission("blog:write");
  const [categories, brands] = await Promise.all([
    db.blogCategory.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.brand.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="New post" subtitle="Draft it with AI or write it yourself, then set the search details and publish." back={{ href: "/app/blog", label: "All posts" }} />
      <BlogEditor initial={emptyBlogForm} categories={categories} brands={brands} canAi={can(principal, "ai:generate")} />
    </>
  );
}
