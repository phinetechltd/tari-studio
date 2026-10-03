import { ArrowLeft, Clapperboard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getTemplate } from "@/server/templates";

export const metadata: Metadata = { title: "Template" };
export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { principal } = await requirePermission("template:read");
  const { id } = await params;
  const t = await getTemplate(id, { includeDraft: false });
  return (
    <>
      <Link href="/app/templates" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All templates
      </Link>
      <PageHeader
        title={t.title}
        subtitle={t.category ?? undefined}
        actions={
          can(principal, "ai:generate") ? (
            <Link href={`/content?template=${t.id}`} className="btn-primary">
              <Clapperboard className="h-4 w-4" /> Use in the Studio
            </Link>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="card h-fit p-5">
          <h2 className="font-semibold text-ink">About this template</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{t.description}</p>
          {t.promptHint ? (
            <p className="mt-4 rounded-lg bg-wash/[0.06] p-3 text-xs text-muted">
              <span className="font-medium text-ink">Added to your prompt: </span>
              {t.promptHint}
            </p>
          ) : null}
        </section>
        <section>
          <h2 className="mb-3 font-semibold text-ink">Image pack ({t.images.length})</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {t.images.map((img, i) => (
              <li key={img.id} className="overflow-hidden rounded-xl border border-line">
                <a href={img.url} target="_blank" rel="noreferrer noopener" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.caption ?? `${t.title}, image ${i + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
                </a>
                {img.caption ? <p className="p-2 text-xs text-muted">{img.caption}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
