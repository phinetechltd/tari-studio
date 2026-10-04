import type { Metadata } from "next";
import Link from "next/link";

import { TemplateEditor } from "@/components/platform/template-editor";
import { Badge, PageHeader } from "@/components/ui";
import { requirePlatform } from "@/lib/session";
import { getTemplate } from "@/server/templates";

import { ModerateButton } from "../moderate-button";

export const metadata: Metadata = { title: "Template" };
export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatform();
  const { id } = await params;
  const t = await getTemplate(id, { includeDraft: true });
  if (t.organizationId !== null) {
    // An organisation's template: platform admins review it and may hide it, but do not edit it.
    return (
      <>
        <Link href="/platform/templates" className="mb-3 inline-flex text-sm text-muted hover:text-ink">
          All templates
        </Link>
        <PageHeader
          title={t.title}
          subtitle={`By ${t.organizationName ?? "an organisation"} · ${t.visibility === "PUBLIC" ? "public" : "private"} · ${t.status === "PUBLISHED" ? "published" : "draft"}`}
          actions={t.visibility === "PUBLIC" ? <ModerateButton id={t.id} hidden={t.hidden} /> : null}
        />
        {t.hidden ? <p className="mb-4 text-sm text-amber-200">Hidden from other organisations{t.hiddenReason ? `: ${t.hiddenReason}` : "."}</p> : null}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section className="card h-fit p-5 text-sm">
            <p className="whitespace-pre-wrap text-ink">{t.description}</p>
            {t.promptHint ? <p className="mt-3 text-xs text-muted">Added to prompts: {t.promptHint}</p> : null}
          </section>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {t.images.map((img) => (
              <li key={img.id} className="overflow-hidden rounded-xl border border-line text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.caption ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
                <p className="p-2 text-muted">
                  {img.source ? (
                    <a href={img.source.url ?? undefined} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
                      Pinterest: {img.source.owned ? "their own pin" : `pin by ${img.source.author ?? "someone else"}`}
                    </a>
                  ) : (
                    "Uploaded"
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  }
  return (
    <>
      <Link href="/platform/templates" className="mb-3 inline-flex text-sm text-muted hover:text-ink">
        All templates
      </Link>
      <PageHeader
        title={t.title}
        subtitle="Agencies see published templates only."
        actions={<Badge tone={t.status === "PUBLISHED" ? "success" : "neutral"}>{t.status === "PUBLISHED" ? "Published" : "Draft"}</Badge>}
      />
      <div className="max-w-4xl">
        <TemplateEditor
          initial={{
            id: t.id,
            title: t.title,
            description: t.description,
            category: t.category ?? "",
            promptHint: t.promptHint ?? "",
            status: t.status as "DRAFT" | "PUBLISHED",
            images: t.images,
          }}
        />
      </div>
    </>
  );
}
