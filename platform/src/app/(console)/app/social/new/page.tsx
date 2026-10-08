import type { Metadata } from "next";

import { ConnectForms } from "@/components/social/connect-forms";
import { EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { configuredProviderName } from "@/lib/providers";
import { requirePermission } from "@/lib/session";
import { isSimulated } from "@/server/meta";

export const metadata: Metadata = { title: "Connect accounts" };
export const dynamic = "force-dynamic";

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ brandId?: string }> }) {
  const { organizationId } = await requirePermission("channel:connect");
  const { brandId } = await searchParams;
  const brands = await db.brand.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader
        title="Connect accounts"
        subtitle="Connect a brand's Facebook Page, Instagram and TikTok accounts to publish, and its WhatsApp Business number to answer customers."
        back={{ href: "/app/social", label: "Social" }}
      />
      {brands.length === 0 ? (
        <EmptyState title="Add a brand first">Accounts are connected per client brand.</EmptyState>
      ) : (
        <ConnectForms
          brands={brands}
          defaultBrandId={brandId}
          simulated={isSimulated()}
          webhookUrl={`${env().APP_BASE_URL.replace(/\/$/, "")}/api/webhooks/whatsapp`}
          webhookReady={Boolean(env().META_APP_SECRET && env().META_WEBHOOK_VERIFY_TOKEN)}
          tiktokMode={configuredProviderName("TIKTOK")}
        />
      )}
    </>
  );
}
