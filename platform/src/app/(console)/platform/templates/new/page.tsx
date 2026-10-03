import type { Metadata } from "next";
import Link from "next/link";

import { TemplateEditor } from "@/components/platform/template-editor";
import { PageHeader } from "@/components/ui";
import { requirePlatform } from "@/lib/session";

export const metadata: Metadata = { title: "New template" };
export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  await requirePlatform();
  return (
    <>
      <Link href="/platform/templates" className="mb-3 inline-flex text-sm text-muted hover:text-ink">
        All templates
      </Link>
      <PageHeader title="New template" subtitle="Write the description first; you add the image pack on the next screen." />
      <div className="max-w-3xl">
        <TemplateEditor initial={{ title: "", description: "", category: "", promptHint: "", status: "DRAFT", images: [] }} />
      </div>
    </>
  );
}
