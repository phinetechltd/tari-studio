import type { Metadata } from "next";
import Link from "next/link";

import { TemplateEditor } from "@/components/platform/template-editor";
import { Badge, PageHeader } from "@/components/ui";
import { requirePlatform } from "@/lib/session";
import { getTemplate } from "@/server/templates";

export const metadata: Metadata = { title: "Template" };
export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatform();
  const { id } = await params;
  const t = await getTemplate(id, { includeDraft: true });
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
