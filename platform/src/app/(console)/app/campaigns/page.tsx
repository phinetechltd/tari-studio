import { Megaphone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Hint } from "@/components/hints/hint";
import { Badge, EmptyState, PageHeader, formatDate } from "@/components/ui";
import { CAMPAIGN_SOURCE_LABEL as SOURCE_LABEL, CAMPAIGN_STATUS_TONE as STATUS_TONE } from "@/lib/campaign-labels";
import { formatKES } from "@/lib/money";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listCampaigns } from "@/server/campaigns";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const { principal } = await requirePermission("campaign:read");
  const campaigns = await listCampaigns(principal);
  const canWrite = can(principal, "campaign:write");

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Group your posts and links under one goal, and see which one brought the clicks and the WhatsApp leads."
        actions={
          canWrite ? (
            <Link href="/app/campaigns/new" className="btn-primary">
              <Plus className="h-4 w-4" /> New campaign
            </Link>
          ) : null
        }
      />
      <Hint id="campaigns.intro" title="See which post brought the customer">
        Give each ad or post its own tracked link. Clicks and the leads they turn into are counted per campaign.
      </Hint>

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          icon={<Megaphone className="h-5 w-5" />}
          action={
            canWrite ? (
              <Link href="/app/campaigns/new" className="btn-primary">
                Create a campaign
              </Link>
            ) : null
          }
        >
          A campaign gives you tracked links (including wa.me links that credit WhatsApp leads back to it) and one place to
          see how it performed.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/app/campaigns/${c.id}`} className="card block h-full p-5 transition-colors hover:bg-wash/[0.07]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{c.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {c.brand.name} · {c.campaignNumber}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</Badge>
                </div>
                {c.description ? <p className="mt-3 line-clamp-2 text-sm text-muted">{c.description}</p> : null}
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-wash/[0.06] pt-4 text-center">
                  <div>
                    <dt className="text-[11px] text-muted">Clicks</dt>
                    <dd className="text-lg font-semibold">{c.clicks.toLocaleString("en-KE")}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted">Leads</dt>
                    <dd className="text-lg font-semibold">{c._count.contacts.toLocaleString("en-KE")}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted">Posts</dt>
                    <dd className="text-lg font-semibold">{c._count.posts.toLocaleString("en-KE")}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-muted">
                  {SOURCE_LABEL[c.source] ?? c.source}
                  {c.budgetCents ? ` · budget ${formatKES(c.budgetCents)}` : ""}
                  {c.startDate ? ` · from ${formatDate(c.startDate)}` : ""}
                  {c.endDate ? ` to ${formatDate(c.endDate)}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
