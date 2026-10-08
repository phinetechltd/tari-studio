import { ArrowLeft, Clapperboard, ExternalLink, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge, Notice, PageHeader } from "@/components/ui";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getTemplateFor } from "@/server/templates";

export const metadata: Metadata = { title: "Template" };
export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { principal, organizationId } = await requirePermission("template:read");
  const { id } = await params;
  const t = await getTemplateFor(organizationId, id);
  const mine = t.organizationId === organizationId;
  const usable = t.status === "PUBLISHED";
  return (
    <>
      <Link href="/app/templates" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All templates
      </Link>
      <PageHeader
        title={t.title}
        subtitle={[t.category, t.organizationId === null ? "By the platform team" : mine ? (t.visibility === "PUBLIC" ? "Ours · public" : "Ours · private") : `By ${t.organizationName ?? "another organisation"}`].filter(Boolean).join(" · ")}
        actions={
          <>
            {mine && can(principal, "template:write") ? (
              <Link href={`/app/templates/${t.id}/edit`} className="btn-quiet">
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            ) : null}
            {usable && can(principal, "ai:generate") ? (
              <Link href={`/content?template=${t.id}`} className="btn-primary">
                <Clapperboard className="h-4 w-4" /> Use in the Studio
              </Link>
            ) : null}
          </>
        }
      />
      {mine && t.hidden ? (
        <Notice tone="warning" title="Hidden from other organisations">
          A platform admin took this template out of the shared list{t.hiddenReason ? `: ${t.hiddenReason}` : "."} Your team can still use it.
        </Notice>
      ) : null}
      {mine && !usable ? (
        <Notice tone="info" title="Draft">
          Publish it from the editor to use it in the Studio.
        </Notice>
      ) : null}
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
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
                {img.caption || img.source ? (
                  <div className="space-y-1 p-2 text-xs">
                    {img.caption ? <p className="text-muted">{img.caption}</p> : null}
                    {img.source ? (
                      <a href={img.source.url ?? undefined} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-muted hover:text-ink">
                        <Badge>Pinterest</Badge> {img.source.owned ? "Own pin" : `Pin by ${img.source.author ?? "a Pinterest user"}`} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
