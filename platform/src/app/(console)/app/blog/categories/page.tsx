import type { Metadata } from "next";

import { CategoryManager } from "@/components/blog/category-manager";
import { PageHeader } from "@/components/ui";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listCategories } from "@/server/blog";

export const metadata: Metadata = { title: "Blog categories" };
export const dynamic = "force-dynamic";

export default async function BlogCategoriesPage() {
  const { principal } = await requirePermission("blog:read");
  const categories = await listCategories(principal);
  return (
    <>
      <PageHeader
        title="Blog categories"
        subtitle="The headings the public blog groups posts under, like Guides or Case studies."
        back={{ href: "/app/blog", label: "All posts" }}
      />
      <CategoryManager
        canWrite={can(principal, "blog:write")}
        categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description ?? "", posts: c._count.posts }))}
      />
    </>
  );
}
