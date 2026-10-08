import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/session";

import { NewTemplateForm } from "./new-template-form";

export const metadata: Metadata = { title: "New template" };
export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  await requirePermission("template:write");
  return (
    <>
      <Link href="/app/templates" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All templates
      </Link>
      <PageHeader title="New template" subtitle="Name it and say what it is for. Pictures (uploaded or from Pinterest) come next." />
      <NewTemplateForm />
    </>
  );
}
