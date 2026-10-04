import { notFound } from "next/navigation";

import { BrandMedia } from "@/components/brands/brand-media";
import { Notice, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { listAttachments, MAX_BRAND_ATTACHMENTS } from "@/server/brand-profile";

import { EditBrandForm } from "./edit-brand-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await db.brand.findUnique({ where: { id }, select: { name: true } });
  return { title: brand ? `Edit ${brand.name}` : "Edit Brand" };
}

export default async function EditBrandPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { organizationId } = await requirePermission("brand:write");
  const { id } = await params;
  const { new: isNew } = await searchParams;

  const brand = await db.brand.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      name: true,
      slug: true,
      brandNumber: true,
      slogan: true,
      avatarUrl: true,
      coverImageKey: true,
      logoKey: true,
      updatedAt: true,
    },
  });

  if (!brand || brand.organizationId !== organizationId) notFound();
  const attachments = await listAttachments(organizationId, brand.id);

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
      {isNew ? (
        <Notice tone="info" title="Brand created. Finish its profile">
          A slogan, a cover picture and a logo help every caption, image and video look like {brand.name}, and Autopilot needs them.
        </Notice>
      ) : null}
      <EditBrandForm brandId={brand.id} />
      <BrandMedia
        brandId={brand.id}
        hasCover={Boolean(brand.coverImageKey)}
        hasLogo={Boolean(brand.logoKey)}
        version={brand.updatedAt.getTime()}
        attachments={attachments}
        maxAttachments={MAX_BRAND_ATTACHMENTS}
      />
    </>
  );
}
