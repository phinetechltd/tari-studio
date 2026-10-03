import { MessageCircle, MousePointerClick, Trophy, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { CopyButton, DeleteLinkButton, NewLinkForm, StatusControls } from "@/components/campaigns/campaign-controls";
import { CampaignCharacters } from "@/components/characters/campaign-characters";
import { Badge, EmptyState, PageHeader, SectionTitle, StatCard, formatDate, formatDateTime, timeAgo } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { CAMPAIGN_SOURCE_LABEL, CAMPAIGN_STATUS_TONE, titleCase } from "@/lib/campaign-labels";
import { db } from "@/lib/db";
import { formatKES } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getCampaignDetail, trackedUrl } from "@/server/campaigns";
import { listCharacters } from "@/server/characters";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await db.campaign.findUnique({ where: { id }, select: { name: true } });
  return { title: c?.name ?? "Campaign" };
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { principal } = await requirePermission("campaign:read");
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getCampaignDetail>>;
  try {
    detail = await getCampaignDetail(principal, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { campaign, clicks, days, funnel } = detail;
  const canWrite = can(principal, "campaign:write");
  const canLink = can(principal, "link:write");
  const canInbox = can(principal, "inbox:read");

  const links = await Promise.all(
    campaign.links.map(async (l) => ({
      ...l,
      url: trackedUrl(l.shortCode),
      qr: await QRCode.toDataURL(trackedUrl(l.shortCode), { margin: 1, width: 240, color: { dark: "#000000", light: "#ffffff" } }),
    })),
  );
  const brandPhone = await db.brand.findUnique({ where: { id: campaign.brandId }, select: { contactPhone: true } });
  const peak = Math.max(1, ...days.map((d) => d.clicks));
  const showCharacters = can(principal, "character:read");
  const [allCharacters, inCampaign, creatives] = await Promise.all([
    showCharacters ? listCharacters(campaign.organizationId) : Promise.resolve([]),
    showCharacters ? db.campaignCharacter.findMany({ where: { campaignId: campaign.id }, select: { characterId: true } }) : Promise.resolve([]),
    db.generatedAsset.findMany({
      where: { campaignId: campaign.id, status: "READY", archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, mediaType: true, prompt: true },
    }),
  ]);
  const attachedIds = new Set(inCampaign.map((x) => x.characterId));
  const toPick = (c: (typeof allCharacters)[number]) => ({ id: c.id, name: c.name, cover: c.cover });

  return (
    <>
      <PageHeader
        title={campaign.name}
        subtitle={[
          campaign.brand.name,
          campaign.campaignNumber,
          CAMPAIGN_SOURCE_LABEL[campaign.source] ?? campaign.source,
          campaign.budgetCents ? `budget ${formatKES(campaign.budgetCents)}` : null,
          campaign.startDate ? `${formatDate(campaign.startDate)} – ${campaign.endDate ? formatDate(campaign.endDate) : "open"}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        back={{ href: "/app/campaigns", label: "Campaigns" }}
        actions={
          <>
            <Badge tone={CAMPAIGN_STATUS_TONE[campaign.status] ?? "neutral"}>{titleCase(campaign.status)}</Badge>
            {canWrite ? <StatusControls campaignId={campaign.id} status={campaign.status} /> : null}
          </>
        }
      />

      {campaign.description ? <p className="-mt-2 mb-6 max-w-3xl text-sm text-ink/80">{campaign.description}</p> : null}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Results">
        <StatCard label="Clicks" value={clicks.toLocaleString("en-KE")} hint="people, not preview bots" icon={<MousePointerClick className="h-4 w-4" />} />
        <StatCard label="WhatsApp leads" value={funnel.leads.toLocaleString("en-KE")} hint="started a chat with a ref code" icon={<MessageCircle className="h-4 w-4" />} />
        <StatCard label="Qualified" value={funnel.qualified.toLocaleString("en-KE")} icon={<UsersRound className="h-4 w-4" />} />
        <StatCard label="Won" value={funnel.won.toLocaleString("en-KE")} hint={clicks > 0 ? `${((funnel.won / clicks) * 100).toFixed(1)}% of clicks` : undefined} icon={<Trophy className="h-4 w-4" />} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <section className="card p-5" aria-labelledby="daily">
            <SectionTitle id="daily">Clicks, last 14 days</SectionTitle>
            <div className="flex h-40 items-end gap-1.5" role="img" aria-label={`Daily clicks: ${days.map((d) => `${d.day} ${d.clicks}`).join(", ")}`}>
              {days.map((d) => (
                <div key={d.day} className="group flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.clicks}`}>
                  <div
                    className="w-full rounded-t-md bg-primary/80 transition-colors group-hover:bg-primary"
                    style={{ height: `${Math.max(d.clicks ? 4 : 1, (d.clicks / peak) * 100)}%`, opacity: d.clicks ? 1 : 0.25 }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted">
              <span>{formatDate(days[0]!.day)}</span>
              <span>{formatDate(days[days.length - 1]!.day)}</span>
            </div>
          </section>

          <section aria-labelledby="links">
            <SectionTitle id="links">Tracked links</SectionTitle>
            {links.length === 0 ? (
              <EmptyState title="No links yet">Create a WhatsApp or web link on the right, then put it in your posts, ads and posters.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {links.map((l) => (
                  <li key={l.id} className="card flex flex-col gap-4 p-4 sm:flex-row">
                    <a href={l.qr} download={`${campaign.campaignNumber}-${l.shortCode}.png`} className="shrink-0 self-start rounded-lg bg-white p-1.5" title="Download QR code">
                      <img src={l.qr} alt={`QR code for ${l.label}`} className="h-24 w-24" />
                    </a>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{l.label}</p>
                        <Badge tone={l.linkType === "whatsapp" ? "success" : "info"}>{l.linkType === "whatsapp" ? "WhatsApp" : "Web"}</Badge>
                      </div>
                      <p className="mt-1 break-all font-mono text-sm text-primary">{l.url}</p>
                      <p className="mt-1 truncate text-xs text-muted" title={l.destinationUrl}>
                        → {l.linkType === "whatsapp" ? decodeURIComponent(l.destinationUrl.replace(/^https:\/\/wa\.me\//, "wa.me/")) : l.destinationUrl}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <CopyButton value={l.url} />
                        <span className="text-xs text-muted">
                          {l.clickCount.toLocaleString("en-KE")} click{l.clickCount === 1 ? "" : "s"}
                          {l.lastClickedAt ? ` · last ${timeAgo(l.lastClickedAt)}` : ""}
                        </span>
                        {canLink ? <DeleteLinkButton campaignId={campaign.id} linkId={l.id} /> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="leads" className="card p-5">
            <SectionTitle
              id="leads"
              action={
                funnel.leads > campaign.contacts.length ? (
                  <Link href="/app/leads" className="text-sm text-primary hover:underline">
                    All leads
                  </Link>
                ) : null
              }
            >
              Leads from this campaign
            </SectionTitle>
            {campaign.contacts.length === 0 ? (
              <p className="text-sm text-muted">None yet. A lead appears here when someone opens a chat from one of this campaign&apos;s WhatsApp links.</p>
            ) : (
              <ul className="divide-y divide-wash/[0.06]">
                {campaign.contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>
                      <span className="font-medium">{c.name ?? formatPhone(c.phone)}</span>
                      <span className="ml-2 text-xs text-muted">{formatDateTime(c.createdAt)}</span>
                    </span>
                    <Badge tone={c.stage === "WON" ? "success" : c.stage === "LOST" ? "danger" : c.stage === "QUALIFIED" ? "info" : "neutral"}>{titleCase(c.stage)}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {canInbox && campaign.contacts.length > 0 ? (
              <Link href="/app/inbox" className="mt-3 inline-block text-sm text-primary hover:underline">
                Open the inbox
              </Link>
            ) : null}
          </section>

          {showCharacters ? (
            <section aria-labelledby="characters" className="card p-5">
              <SectionTitle id="characters">Characters</SectionTitle>
              <CampaignCharacters
                campaignId={campaign.id}
                attached={allCharacters.filter((c) => attachedIds.has(c.id)).map(toPick)}
                available={allCharacters.map(toPick)}
                canWrite={canWrite && can(principal, "character:read")}
              />
            </section>
          ) : null}

          {creatives.length > 0 ? (
            <section aria-labelledby="creatives" className="card p-5">
              <SectionTitle id="creatives">Creatives made for this campaign</SectionTitle>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {creatives.map((a) => (
                  <li key={a.id} className="overflow-hidden rounded-lg border border-line">
                    <Link href={`/content/assets/${a.id}`} className="block bg-surface">
                      {a.mediaType === "VIDEO" ? (
                        <video src={`/api/content/assets/${a.id}/file`} muted playsInline preload="metadata" className="aspect-square w-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/content/assets/${a.id}/file`} alt={a.prompt.slice(0, 100)} className="aspect-square w-full object-cover" loading="lazy" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="posts" className="card p-5">
            <SectionTitle id="posts">Posts in this campaign</SectionTitle>
            {campaign.posts.length === 0 ? (
              <p className="text-sm text-muted">
                No posts yet. When you schedule a post under{" "}
                <Link href="/app/social" className="text-primary hover:underline">
                  Social
                </Link>
                , pick this campaign.
              </p>
            ) : (
              <ul className="divide-y divide-wash/[0.06]">
                {campaign.posts.map((p) => {
                  const content = p.content as { text?: string };
                  return (
                    <li key={p.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{p.channel.name}</span>
                        <span className="block truncate text-xs text-muted">{content.text}</span>
                      </span>
                      <Badge tone={p.status === "PUBLISHED" ? "success" : p.status === "FAILED" ? "danger" : "neutral"}>{titleCase(p.status)}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {canLink ? (
          <aside className="card h-fit p-5 xl:sticky xl:top-20" aria-labelledby="new-link">
            <h2 id="new-link" className="mb-3 text-lg font-semibold">
              New tracked link
            </h2>
            <NewLinkForm campaignId={campaign.id} defaultPhone={brandPhone?.contactPhone ?? undefined} />
          </aside>
        ) : null}
      </div>
    </>
  );
}
