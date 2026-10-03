import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

import { NewCatalogueForm } from "./new-catalogue-form";

export const metadata: Metadata = { title: "New product" };

export default async function NewCataloguePage({ searchParams }: { searchParams: Promise<{ brandId?: string }> }) {
  const { organizationId } = await requirePermission("catalogue:write");
  const { brandId } = await searchParams;
  const brands = await db.brand.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader
        title="New product"
        subtitle="Products and prices here are the only facts AI captions and WhatsApp replies are allowed to quote."
        back={{ href: "/app/catalogue", label: "Catalogue" }}
      />
      {brands.length === 0 ? <EmptyState title="Add a brand first">Products belong to a client brand.</EmptyState> : <NewCatalogueForm brands={brands} defaultBrandId={brandId} />}
    </>
  );
}
