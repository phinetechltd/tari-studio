import "server-only";

import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { ApiError, badRequest, notFound } from "@/lib/api";
import { audit, auditAs } from "@/lib/audit";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { slugify } from "@/lib/identity";
import { nextNumber as nextDocumentNumber } from "@/lib/numbering";
import { toWhatsAppId } from "@/lib/phone";
import type { Principal } from "@/lib/rbac";
import { orgIdOf, scope } from "@/lib/tenant";
import { deviceType, isBotUserAgent, newShortCode, whatsAppLink, withUtm } from "@/lib/tracked-links";

/**
 * Campaigns and their tracked links.
 *
 * A tracked link is `APP_BASE_URL/l/<code>`: it counts the click and forwards to
 * the destination. Web destinations gain the campaign's UTM parameters on the
 * way; WhatsApp destinations carry the code inside the pre-filled message, which
 * is how a conversation in the inbox is credited back to the campaign.
 */

export const CAMPAIGN_SOURCES = ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "GOOGLE", "DIRECT"] as const;
export const CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;

export function trackedUrl(shortCode: string): string {
  return `${env().APP_BASE_URL.replace(/\/$/, "")}/l/${shortCode}`;
}

export async function createCampaign(
  principal: Principal,
  input: {
    brandId: string;
    name: string;
    description?: string;
    source: string;
    budgetCents?: number;
    startDate?: Date;
    endDate?: Date;
    landingUrl?: string;
  },
  request?: Request,
) {
  const organizationId = orgIdOf(principal);
  const name = input.name.trim();
  if (name.length < 2) throw new ApiError(422, "VALIDATION_FAILED", "Enter the campaign name.");
  if (input.startDate && input.endDate && input.endDate < input.startDate) throw badRequest("The campaign ends before it starts.");

  const brand = await db.brand.findFirst({ where: { id: input.brandId, organizationId, status: "ACTIVE" }, select: { id: true } });
  if (!brand) throw notFound("Brand not found.");

  const campaign = await db.campaign.create({
    data: {
      organizationId,
      brandId: input.brandId,
      campaignNumber: await nextDocumentNumber(organizationId, "CAMPAIGN"),
      name,
      description: input.description?.trim() || null,
      source: input.source,
      budgetCents: input.budgetCents ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      landingUrl: input.landingUrl?.trim() || null,
      utmParams: {
        utm_source: input.source.toLowerCase(),
        utm_medium: input.source === "GOOGLE" ? "cpc" : "social",
        utm_campaign: slugify(name) || "campaign",
      },
      createdById: principal.userId,
    },
  });
  await auditAs(principal, "CREATE", "Campaign", campaign.id, { name }, request);
  return campaign;
}

export async function listCampaigns(principal: Principal, filters: { brandId?: string; status?: string } = {}) {
  const campaigns = await db.campaign.findMany({
    where: {
      ...scope(principal),
      ...(filters.brandId ? { brandId: filters.brandId } : {}),
      ...(filters.status ? { status: filters.status } : { status: { not: "ARCHIVED" } }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      brand: { select: { name: true } },
      links: { select: { clickCount: true } },
      _count: { select: { links: true, posts: true, contacts: true } },
    },
  });
  return campaigns.map(({ links, ...c }) => ({ ...c, clicks: links.reduce((sum, l) => sum + l.clickCount, 0) }));
}

async function ownedCampaign(principal: Principal, id: string) {
  const campaign = await db.campaign.findFirst({ where: { id, ...scope(principal) } });
  if (!campaign) throw notFound("Campaign not found.");
  return campaign;
}

export async function getCampaignDetail(principal: Principal, id: string) {
  const campaign = await db.campaign.findFirst({
    where: { id, ...scope(principal) },
    include: {
      brand: { select: { id: true, name: true } },
      links: { orderBy: { createdAt: "desc" } },
      posts: { orderBy: { createdAt: "desc" }, take: 20, include: { channel: { select: { name: true, platform: true } } } },
      contacts: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, name: true, phone: true, stage: true, createdAt: true } },
      _count: { select: { contacts: true, posts: true } },
    },
  });
  if (!campaign) throw notFound("Campaign not found.");

  const since = new Date(Date.now() - 13 * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const linkIds = campaign.links.map((l) => l.id);
  const daily = linkIds.length
    ? await db.$queryRaw<Array<{ day: Date; clicks: bigint }>>`
        SELECT date_trunc('day', "clickedAt") AS day, COUNT(*)::bigint AS clicks
          FROM "ClickEvent"
         WHERE "linkId" IN (${Prisma.join(linkIds)}) AND "clickedAt" >= ${since}
         GROUP BY 1 ORDER BY 1`
    : [];
  const byDay = new Map(daily.map((d) => [d.day.toISOString().slice(0, 10), Number(d.clicks)]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { day: d, clicks: byDay.get(d) ?? 0 };
  });

  const [won, qualified] = await Promise.all([
    db.contact.count({ where: { campaignId: id, stage: "WON" } }),
    db.contact.count({ where: { campaignId: id, stage: { in: ["QUALIFIED", "WON"] } } }),
  ]);

  return {
    campaign,
    clicks: campaign.links.reduce((sum, l) => sum + l.clickCount, 0),
    days,
    funnel: { leads: campaign._count.contacts, qualified, won },
  };
}

export async function updateCampaign(
  principal: Principal,
  id: string,
  input: Partial<{ name: string; description: string | null; status: string; budgetCents: number | null; startDate: Date | null; endDate: Date | null; landingUrl: string | null }>,
  request?: Request,
) {
  const before = await ownedCampaign(principal, id);
  const campaign = await db.campaign.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.budgetCents !== undefined ? { budgetCents: input.budgetCents } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.landingUrl !== undefined ? { landingUrl: input.landingUrl?.trim() || null } : {}),
    },
  });
  await auditAs(principal, "UPDATE", "Campaign", id, { status: input.status !== undefined ? { from: before.status, to: input.status } : undefined }, request);
  return campaign;
}

export async function createTrackedLink(
  principal: Principal,
  campaignId: string,
  input:
    | { kind: "whatsapp"; label: string; phone: string; message: string }
    | { kind: "web"; label: string; destinationUrl: string },
  request?: Request,
) {
  const campaign = await ownedCampaign(principal, campaignId);

  for (let attempt = 0; attempt < 5; attempt++) {
    const shortCode = newShortCode();
    let destinationUrl: string;
    if (input.kind === "whatsapp") {
      const waId = toWhatsAppId(input.phone);
      if (!waId) throw badRequest("Enter the WhatsApp number customers should message, e.g. 0712 345 678.");
      destinationUrl = whatsAppLink(waId, input.message, shortCode);
    } else {
      let url: URL;
      try {
        url = new URL(input.destinationUrl);
      } catch {
        throw badRequest("Enter a full web address, starting with https://");
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") throw badRequest("Only web links can be tracked.");
      destinationUrl = url.toString();
    }
    try {
      const link = await db.trackedLink.create({
        data: {
          campaignId,
          organizationId: campaign.organizationId,
          shortCode,
          destinationUrl,
          label: input.label.trim(),
          linkType: input.kind === "whatsapp" ? "whatsapp" : "landing",
          createdById: principal.userId,
        },
      });
      await auditAs(principal, "CREATE", "TrackedLink", link.id, { campaignId, kind: input.kind }, request);
      return { ...link, url: trackedUrl(shortCode) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a unique link code.");
}

export async function deleteTrackedLink(principal: Principal, campaignId: string, linkId: string) {
  await ownedCampaign(principal, campaignId);
  const link = await db.trackedLink.findFirst({ where: { id: linkId, campaignId }, select: { id: true } });
  if (!link) throw notFound("Link not found.");
  await db.trackedLink.delete({ where: { id: linkId } });
  await auditAs(principal, "DELETE", "TrackedLink", linkId, { campaignId });
}

/** Where a code forwards to, with the campaign's UTM tags on web links. Null when unknown. */
export async function resolveTrackedLink(shortCode: string) {
  const link = await db.trackedLink.findUnique({
    where: { shortCode },
    select: {
      id: true,
      organizationId: true,
      destinationUrl: true,
      label: true,
      linkType: true,
      campaign: { select: { utmParams: true } },
    },
  });
  if (!link) return null;
  const utm = (link.campaign.utmParams ?? {}) as Record<string, string | undefined>;
  const destination =
    link.linkType === "whatsapp" ? link.destinationUrl : withUtm(link.destinationUrl, { ...utm, utm_content: slugify(link.label) || undefined });
  return { ...link, destination };
}

/** Salted and truncated: enough to spot repeat clicks, not enough to identify anyone. */
function visitorHash(ip: string | null, ua: string | null): string {
  const salt = crypto.hkdfSync("sha256", env().AUTH_SECRET, Buffer.alloc(0), "click-visitor:v1", 16);
  return crypto.createHmac("sha256", Buffer.from(salt)).update(`${ip ?? ""}|${ua ?? ""}`).digest("hex").slice(0, 24);
}

/**
 * Counts a click, unless it is a link-preview fetcher or the same visitor again
 * within ten minutes (a double tap or a reload is not a second customer).
 */
export async function recordClick(linkId: string, request: Request): Promise<boolean> {
  const ua = request.headers.get("user-agent");
  if (isBotUserAgent(ua)) return false;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]!.trim() ?? request.headers.get("x-real-ip");
  const visitor = visitorHash(ip ?? null, ua);
  const recent = await db.clickEvent.findFirst({
    where: { linkId, ipAddress: visitor, clickedAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    select: { id: true },
  });
  if (recent) return false;
  await db.$transaction([
    db.trackedLink.update({ where: { id: linkId }, data: { clickCount: { increment: 1 }, lastClickedAt: new Date() } }),
    db.clickEvent.create({
      data: {
        linkId,
        ipAddress: visitor,
        userAgent: ua?.slice(0, 300) ?? null,
        referer: request.headers.get("referer")?.slice(0, 500) ?? null,
        deviceType: deviceType(ua),
      },
    }),
  ]);
  return true;
}

export async function archiveCampaign(principal: Principal, id: string) {
  await ownedCampaign(principal, id);
  await db.campaign.update({ where: { id }, data: { status: "ARCHIVED" } });
  await audit({ organizationId: principal.organizationId, userId: principal.userId, action: "ARCHIVE", entity: "Campaign", entityId: id });
}
