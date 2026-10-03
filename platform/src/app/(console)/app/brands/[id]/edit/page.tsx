import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { EditBrandForm } from "./edit-brand-form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await db.brand.findUnique({ where: { id }, select: { name: true } });
  return { title: brand ? `Edit ${brand.name}` : "Edit Brand" };
}

export default async function EditBrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { principal, organizationId } = await requirePermission("brand:write");
  const { id } = await params;

  const brand = await db.brand.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      name: true,
      slug: true,
      brandNumber: true,
      guidelines: true,
      avatarUrl: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      website: true,
      status: true,
      timezone: true,
      defaultCurrency: true,
    },
  });

  if (!brand || brand.organizationId !== organizationId) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${brand.name}`}
        subtitle={`${brand.brandNumber} · ${brand.slug}`}
        actions={
          <a
            href={`/app/brands/${brand.id}`}
            className="inline-flex min-h-[44px] items-center rounded-button border border-line bg-bg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            Back to Brand
          </a>
        }
      />
      <EditBrandForm brandId={brand.id} />
    </>
  );
}
