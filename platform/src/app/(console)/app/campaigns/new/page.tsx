import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

import { NewCampaignForm } from "./new-campaign-form";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ brandId?: string }> }) {
  const { organizationId } = await requirePermission("campaign:write");
  const { brandId } = await searchParams;
  const brands = await db.brand.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader title="New campaign" subtitle="Name the goal; add tracked links and posts once it exists." back={{ href: "/app/campaigns", label: "Campaigns" }} />
      {brands.length === 0 ? (
        <EmptyState title="Add a brand first">A campaign belongs to one of your client brands.</EmptyState>
      ) : (
        <NewCampaignForm brands={brands} defaultBrandId={brandId} />
      )}
    </>
  );
}
