import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrgTemplateEditor } from "@/components/templates/org-template-editor";
import { Notice, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/session";
import { getTemplateFor } from "@/server/templates";

export const metadata: Metadata = { title: "Edit template" };
export const dynamic = "force-dynamic";

/** Edits one of the organisation's own templates. */
export default async function EditTemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pinterest?: string; reason?: string }> }) {
  const { organizationId } = await requirePermission("template:write");
  const { id } = await params;
  const { pinterest, reason } = await searchParams;
  const t = await getTemplateFor(organizationId, id).catch(() => null);
  if (!t || t.organizationId !== organizationId) notFound();
  return (
    <>
      <Link href={`/app/templates/${t.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to the template
      </Link>
      <PageHeader title={`Edit: ${t.title}`} subtitle="Words, who can use it, and its pictures." />
      {pinterest === "connected" ? (
        <Notice tone="success" title="Pinterest connected">
          Search your pins and boards below.
        </Notice>
      ) : pinterest === "failed" || pinterest === "expired" || pinterest === "cancelled" ? (
        <Notice tone="warning" title="Pinterest was not connected">
          {pinterest === "failed" ? (reason ?? "Pinterest refused the sign-in.") : pinterest === "expired" ? "The sign-in took too long. Try again." : "The sign-in was cancelled."}
        </Notice>
      ) : null}
      <div className="mt-4">
        <OrgTemplateEditor
          initial={{
            id: t.id,
            title: t.title,
            description: t.description,
            category: t.category ?? "",
            promptHint: t.promptHint ?? "",
            status: t.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
            visibility: t.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
            hidden: t.hidden,
            hiddenReason: t.hiddenReason,
            images: t.images.map((i) => ({ id: i.id, url: i.url, caption: i.caption, source: i.source ? { url: i.source.url, author: i.source.author, authorUrl: i.source.authorUrl, owned: i.source.owned } : null })),
          }}
        />
      </div>
    </>
  );
}
