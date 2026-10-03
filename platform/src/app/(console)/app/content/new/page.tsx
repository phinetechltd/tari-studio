import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/session";

import { NewContentForm } from "./new-content-form";

export const metadata: Metadata = { title: "New task" };

export default async function NewContentPage() {
  await requirePermission("task:write");
  return (
    <>
      <PageHeader title="New task" subtitle="Brief a designer or writer on what to make." back={{ href: "/app/content", label: "Tasks" }} />
      <NewContentForm />
    </>
  );
}
