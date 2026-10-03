import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/session";
import { listPublished } from "@/server/templates";

export const metadata: Metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

/** Look-and-feel packs published by the platform team, ready to use in the Studio. */
export default async function TemplatesPage() {
  await requirePermission("template:read");
  const templates = await listPublished();
  return (
    <>
      <PageHeader title="Templates" subtitle="Start from a ready-made look: a description and a pack of reference images." />
      {templates.length === 0 ? (
        <EmptyState title="No templates yet">New templates appear here when the platform team publishes them.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((t) => (
            <li key={t.id}>
              <Link href={`/app/templates/${t.id}`} className="card group block h-full overflow-hidden transition-colors hover:border-primary/50">
                <div className="aspect-[4/3] overflow-hidden bg-surface">
                  {t.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.cover} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  ) : null}
                </div>
                <div className="p-4">
                  <h2 className="font-semibold text-ink">{t.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{t.description}</p>
                  <p className="mt-2 text-xs text-muted">
                    {t.imageCount} image{t.imageCount === 1 ? "" : "s"}
                    {t.category ? ` · ${t.category}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
