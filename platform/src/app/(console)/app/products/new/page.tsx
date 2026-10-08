import type { Metadata } from "next";

import { emptyProduct } from "@/components/products/product-values";
import { ProductForm } from "@/components/products/product-form";
import { EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "New product" };
export const dynamic = "force-dynamic";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ brandId?: string }> }) {
  const { organizationId } = await requirePermission("product:write");
  const { brandId } = await searchParams;
  const brands = await db.brand.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const start = brands.find((b) => b.id === brandId)?.id ?? brands[0]?.id ?? "";
  return (
    <>
      <PageHeader
        title="New product"
        subtitle="Prices and details here are the only facts AI captions and WhatsApp replies are allowed to quote."
        back={{ href: "/app/products", label: "Products" }}
      />
      {brands.length === 0 ? (
        <EmptyState title="Add a brand first">Products belong to a brand.</EmptyState>
      ) : (
        <ProductForm initial={emptyProduct(start)} brands={brands} />
      )}
    </>
  );
}
