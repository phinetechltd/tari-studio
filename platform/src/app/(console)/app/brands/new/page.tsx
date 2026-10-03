import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/session";

import { NewBrandForm } from "./new-brand-form";

export const metadata: Metadata = { title: "New brand" };

export default async function NewBrandPage() {
  await requirePermission("brand:write");
  return (
    <>
      <PageHeader title="New brand" subtitle="Add a client brand to your agency." back={{ href: "/app/brands", label: "Brands" }} />
      <NewBrandForm />
    </>
  );
}
