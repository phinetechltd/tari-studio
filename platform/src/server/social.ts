import "server-only";

import type { Prisma } from "@prisma/client";

import { ApiError, conflict, notFound } from "@/lib/api";
import { audit, auditAs } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Principal } from "@/lib/rbac";
import { decryptFor, encryptFor } from "@/lib/secrets";
import { orgIdOf, scope } from "@/lib/tenant";

import { fireAutomations } from "./automations";
import { enqueue } from "./jobs";
import { publicMediaUrl } from "./media-links";
import { issuingAppId, meta, metaAppFor, metaAppForChannel, MetaApiError, type PageAccount } from "./meta";

/**
 * Social channels (Facebook Pages, Instagram accounts, WhatsApp numbers) and
 * the posts published to them.
 *
 * Tokens are sealed with the organisation id as additional data (src/lib/secrets.ts)
 * and never leave the server: every read path here selects around them.
 */

export const CHANNEL_PLATFORMS = ["FACEBOOK", "INSTAGRAM", "WHATSAPP"] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

/** Channel columns safe to send to a browser. */
export const CHANNEL_PUBLIC_FIELDS = {
  id: true,
  brandId: true,
  platform: true,
  externalId: true,
  name: true,
  handle: true,
  status: true,
  metadata: true,
  connectedAt: true,
  lastUsedAt: true,
} satisfies Prisma.SocialChannelSelect;

export function channelToken(channel: {
  organizationId: string;
  tokenCipher: string | null;
  tokenIv: string | null;
  tokenTag: string | null;
}): string | null {
  if (!channel.tokenCipher || !channel.tokenIv || !channel.tokenTag) return null;
  return decryptFor(channel.organizationId, {
    cipherText: channel.tokenCipher,
    iv: channel.tokenIv,
    authTag: channel.tokenTag,
  });
}

async function ownedBrand(principal: Principal, brandId: string) {
  const brand = await db.brand.findFirst({ where: { id: brandId, ...scope(principal), status: "ACTIVE" }, select: { id: true, name: true } });
  if (!brand) throw notFound("Brand not found.");
  return brand;
}

/**
 * One external account can belong to one organisation only: the WhatsApp
 * webhook routes by phone-number id, so two tenants sharing one would each read
 * the other's customers.
 */
async function assertUnclaimed(platform: string, externalId: string, organizationId: string) {
  const other = await db.socialChannel.findFirst({
    where: { platform, externalId, status: { not: "DISCONNECTED" }, organizationId: { not: organizationId } },
    select: { id: true },
  });
  if (other) throw conflict("That account is already connected to another organisation.");
}

async function upsertChannel(
  principal: Principal,
  input: {
    brandId: string;
    platform: ChannelPlatform;
    externalId: string;
    name: string;
    handle?: string | null;
    token: string;
    metadata?: Record<string, unknown>;
  },
) {
  const organizationId = orgIdOf(principal);
  await assertUnclaimed(input.platform, input.externalId, organizationId);
  const sealed = encryptFor(organizationId, input.token);
  const existing = await db.socialChannel.findFirst({
    where: { organizationId, platform: input.platform, externalId: input.externalId },
    select: { id: true },
  });
  const data = {
    brandId: input.brandId,
    name: input.name,
    handle: input.handle ?? null,
    tokenCipher: sealed.cipherText,
    tokenIv: sealed.iv,
    tokenTag: sealed.authTag,
    status: "ACTIVE",
    archivedAt: null,
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    connectedById: principal.userId,
    connectedAt: new Date(),
  };
  const channel = existing
    ? await db.socialChannel.update({ where: { id: existing.id }, data, select: CHANNEL_PUBLIC_FIELDS })
    : await db.socialChannel.create({
        data: { ...data, organizationId, platform: input.platform, externalId: input.externalId },
        select: CHANNEL_PUBLIC_FIELDS,
      });
  await auditAs(principal, "CONNECT_CHANNEL", "SocialChannel", channel.id, { platform: input.platform, name: input.name });
  return channel;
}

/** Stores the Pages (and their linked Instagram accounts) a Facebook Login returned. */
export async function connectMetaPages(principal: Principal, brandId: string, pages: PageAccount[]) {
  await ownedBrand(principal, brandId);
  // The same app the OAuth callback just exchanged the code with.
  const appId = await issuingAppId(orgIdOf(principal));
  const connected = [];
  for (const page of pages) {
    connected.push(
      await upsertChannel(principal, {
        brandId,
        platform: "FACEBOOK",
        externalId: page.pageId,
        name: page.pageName,
        token: page.pageToken,
        metadata: { source: meta().name, appId },
      }),
    );
    if (page.instagram) {
      connected.push(
        await upsertChannel(principal, {
          brandId,
          platform: "INSTAGRAM",
          externalId: page.instagram.id,
          name: page.instagram.username ? `@${page.instagram.username}` : `${page.pageName} (Instagram)`,
          handle: page.instagram.username,
          // Instagram publishing uses the linked Page's token.
          token: page.pageToken,
          metadata: { source: meta().name, pageId: page.pageId, appId },
        }),
      );
    }
  }
  return connected;
}

/**
 * A WhatsApp Cloud API number, entered from Meta's WhatsApp Manager: the
 * phone-number id and a permanent System User token. The token is proven
 * against the number before anything is stored.
 */
export async function connectWhatsAppNumber(
  principal: Principal,
  input: { brandId: string; phoneNumberId: string; businessAccountId?: string; accessToken: string; name?: string },
) {
  await ownedBrand(principal, input.brandId);
  const app = await metaAppFor(orgIdOf(principal));
  let info: Record<string, unknown>;
  try {
    info = await meta().checkObject({
      objectId: input.phoneNumberId,
      token: input.accessToken,
      fields: "display_phone_number,verified_name,quality_rating",
      app,
    });
  } catch (error) {
    throw new ApiError(422, "CHANNEL_CHECK_FAILED", `Meta did not accept that number and token: ${error instanceof Error ? error.message : String(error)}`);
  }
  const display = typeof info.display_phone_number === "string" ? info.display_phone_number : null;
  const verified = typeof info.verified_name === "string" ? info.verified_name : null;
  return upsertChannel(principal, {
    brandId: input.brandId,
    platform: "WHATSAPP",
    externalId: input.phoneNumberId,
    name: input.name?.trim() || verified || display || "WhatsApp number",
    handle: display,
    token: input.accessToken,
    metadata: {
      source: meta().name,
      appId: await issuingAppId(orgIdOf(principal)),
      businessAccountId: input.businessAccountId ?? null,
      displayPhoneNumber: display,
      verifiedName: verified,
    },
  });
}

export async function listChannels(principal: Principal, brandId?: string) {
  return db.socialChannel.findMany({
    where: { ...scope(principal), ...(brandId ? { brandId } : {}), status: { not: "DISCONNECTED" } },
    orderBy: [{ platform: "asc" }, { name: "asc" }],
    select: { ...CHANNEL_PUBLIC_FIELDS, brand: { select: { name: true } }, _count: { select: { posts: true, conversations: true } } },
  });
}

async function ownedChannel(principal: Principal, id: string) {
  const channel = await db.socialChannel.findFirst({ where: { id, ...scope(principal) } });
  if (!channel) throw notFound("Channel not found.");
  return channel;
}

/** Asks Meta whether the stored token still works, and records the answer. */
export async function testChannel(principal: Principal, id: string) {
  const channel = await ownedChannel(principal, id);
  const token = channelToken(channel);
  const checkedAt = new Date().toISOString();
  let status = "ACTIVE";
  let detail: string;
  if (!token) {
    status = "ERROR";
    detail = "The stored token cannot be read (the credentials key changed). Reconnect this channel.";
  } else {
    try {
      const fields = channel.platform === "WHATSAPP" ? "display_phone_number,verified_name" : channel.platform === "INSTAGRAM" ? "username" : "name";
      const info = await meta().checkObject({ objectId: channel.externalId ?? "", token, fields, app: await metaAppForChannel(channel) });
      detail = `Connected as ${String(info.name ?? info.username ?? info.verified_name ?? info.display_phone_number ?? channel.name)}.`;
    } catch (error) {
      status = error instanceof MetaApiError && error.definite ? "ERROR" : channel.status;
      detail = error instanceof Error ? error.message : String(error);
    }
  }
  const metadata = { ...((channel.metadata as Record<string, unknown>) ?? {}), lastCheck: { at: checkedAt, ok: status === "ACTIVE", detail } };
  await db.socialChannel.update({ where: { id }, data: { status, metadata: metadata as Prisma.InputJsonValue } });
  return { ok: status === "ACTIVE", status, detail };
}

export async function disconnectChannel(principal: Principal, id: string) {
  await ownedChannel(principal, id);
  await db.socialChannel.update({
    where: { id },
    data: { status: "DISCONNECTED", archivedAt: new Date(), tokenCipher: null, tokenIv: null, tokenTag: null },
  });
  // Posts still waiting for this channel can no longer go out.
  await db.socialPost.updateMany({
    where: { channelId: id, status: "SCHEDULED" },
    data: { status: "FAILED", error: "The channel was disconnected before this post went out." },
  });
  await auditAs(principal, "DISCONNECT_CHANNEL", "SocialChannel", id);
}

// ── posts ────────────────────────────────────────────────────────────────

export interface PostContent {
  text: string;
  assetId?: string | null;
  link?: string | null;
}

export async function schedulePosts(
  principal: Principal,
  input: { channelIds: string[]; text: string; assetId?: string | null; link?: string | null; campaignId?: string | null; scheduledAt?: Date | null },
  request?: Request,
) {
  const organizationId = orgIdOf(principal);
  const text = input.text.trim();
  if (!text && !input.assetId) throw new ApiError(422, "VALIDATION_FAILED", "Write a caption or attach media.");
  const when = input.scheduledAt && input.scheduledAt.getTime() > Date.now() ? input.scheduledAt : new Date();

  const channels = await db.socialChannel.findMany({
    where: { id: { in: input.channelIds }, organizationId, status: "ACTIVE" },
    select: { id: true, brandId: true, platform: true, name: true },
  });
  if (channels.length !== new Set(input.channelIds).size) throw notFound("One of the channels is missing or disconnected.");

  let asset: { id: string; mediaType: string } | null = null;
  if (input.assetId) {
    asset = await db.generatedAsset.findFirst({
      where: { id: input.assetId, organizationId, status: "READY", archivedAt: null },
      select: { id: true, mediaType: true },
    });
    if (!asset) throw notFound("That image or video is not in your library.");
  }

  for (const c of channels) {
    if (c.platform === "WHATSAPP") {
      throw new ApiError(422, "VALIDATION_FAILED", "WhatsApp numbers receive replies, not feed posts. Pick a Facebook Page or Instagram account.");
    }
    if (c.platform === "INSTAGRAM" && !asset) {
      throw new ApiError(422, "VALIDATION_FAILED", `${c.name} is on Instagram, which needs an image or a video.`);
    }
  }

  if (input.campaignId) {
    const campaign = await db.campaign.findFirst({ where: { id: input.campaignId, organizationId }, select: { id: true } });
    if (!campaign) throw notFound("Campaign not found.");
  }

  const content: PostContent = { text, assetId: asset?.id ?? null, link: input.link?.trim() || null };
  const created = [];
  for (const c of channels) {
    const post = await db.socialPost.create({
      data: {
        organizationId,
        brandId: c.brandId,
        channelId: c.id,
        campaignId: input.campaignId ?? null,
        content: content as unknown as Prisma.InputJsonValue,
        status: "SCHEDULED",
        scheduledAt: when,
        createdById: principal.userId,
        approvedById: principal.userId,
        approvedAt: new Date(),
      },
      select: { id: true, status: true, scheduledAt: true, channelId: true },
    });
    await enqueue("publish.post", { postId: post.id }, { runAt: when, organizationId, dedupeKey: `publish:${post.id}:0`, maxAttempts: 4 });
    await auditAs(principal, "SCHEDULE", "SocialPost", post.id, { channel: c.name, scheduledAt: when }, request);
    created.push(post);
  }
  return created;
}

export async function listPosts(principal: Principal, filters: { status?: string; channelId?: string; campaignId?: string } = {}) {
  return db.socialPost.findMany({
    where: {
      ...scope(principal),
      ...(filters.status ? { status: filters.status } : { status: { not: "ARCHIVED" } }),
      ...(filters.channelId ? { channelId: filters.channelId } : {}),
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
    },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      channel: { select: { name: true, platform: true } },
      brand: { select: { name: true } },
      campaign: { select: { id: true, name: true } },
    },
  });
}

async function ownedPost(principal: Principal, id: string) {
  const post = await db.socialPost.findFirst({ where: { id, ...scope(principal) }, select: { id: true, status: true, organizationId: true } });
  if (!post) throw notFound("Post not found.");
  return post;
}

export async function cancelPost(principal: Principal, id: string) {
  const post = await ownedPost(principal, id);
  if (post.status !== "SCHEDULED" && post.status !== "FAILED") {
    throw conflict(post.status === "PUBLISHING" ? "This post is going out right now." : "Only scheduled or failed posts can be cancelled.");
  }
  const { count } = await db.socialPost.updateMany({ where: { id, status: post.status }, data: { status: "ARCHIVED" } });
  if (count === 0) throw conflict("The post changed while you were looking at it. Refresh and try again.");
  await auditAs(principal, "ARCHIVE", "SocialPost", id);
}

export async function retryPost(principal: Principal, id: string) {
  const post = await ownedPost(principal, id);
  if (post.status !== "FAILED") throw conflict("Only failed posts can be retried.");
  const { count } = await db.socialPost.updateMany({
    where: { id, status: "FAILED" },
    data: { status: "SCHEDULED", scheduledAt: new Date(), error: null },
  });
  if (count === 0) throw conflict("The post changed while you were looking at it. Refresh and try again.");
  await enqueue("publish.post", { postId: id }, { organizationId: post.organizationId, dedupeKey: `publish:${id}:${Date.now()}`, maxAttempts: 4 });
  await auditAs(principal, "SCHEDULE", "SocialPost", id, { retry: true });
}

/** Meta's throttling codes: worth waiting and trying again. */
const THROTTLED = new Set([4, 17, 32, 613]);

/**
 * The `publish.post` job. Idempotent: a post that is already out, or whose
 * previous attempt was interrupted mid-call, is never posted a second time.
 */
export async function publishPost(postId: string): Promise<void> {
  const post = await db.socialPost.findUnique({ where: { id: postId }, include: { channel: true, brand: { select: { name: true } } } });
  if (!post || post.status === "PUBLISHED" || post.status === "ARCHIVED" || post.status === "FAILED") return;

  if (post.externalId) {
    await db.socialPost.update({ where: { id: postId }, data: { status: "PUBLISHED", publishedAt: post.publishedAt ?? new Date() } });
    return;
  }

  if (post.status === "PUBLISHING") {
    // A worker died between claiming this and recording the answer. The post may
    // be live; posting again could duplicate it, so a person decides.
    await finishFailed(post.id, post.organizationId, post.brandId, "An earlier attempt was interrupted before Meta answered. Check the page, then retry if it is not there.");
    return;
  }

  const claimed = await db.socialPost.updateMany({ where: { id: postId, status: "SCHEDULED" }, data: { status: "PUBLISHING" } });
  if (claimed.count === 0) return;

  const channel = post.channel;
  const token = channelToken(channel);
  if (channel.status !== "ACTIVE" || !token || !channel.externalId) {
    await finishFailed(post.id, post.organizationId, post.brandId, "The channel is disconnected or its token cannot be read. Reconnect it and retry.");
    return;
  }

  const content = post.content as unknown as PostContent;
  let imageUrl: string | undefined;
  let videoUrl: string | undefined;
  if (content.assetId) {
    const asset = await db.generatedAsset.findFirst({
      where: { id: content.assetId, organizationId: post.organizationId, status: "READY" },
      select: { id: true, mediaType: true },
    });
    if (!asset) {
      await finishFailed(post.id, post.organizationId, post.brandId, "The attached media is no longer in the library.");
      return;
    }
    const url = publicMediaUrl(asset.id);
    if (asset.mediaType === "VIDEO") videoUrl = url;
    else imageUrl = url;
  }

  try {
    const app = await metaAppForChannel(channel);
    const result =
      channel.platform === "INSTAGRAM"
        ? await meta().publishToInstagram({ igUserId: channel.externalId, token, caption: content.text, imageUrl, videoUrl, app })
        : await meta().publishToPage({ pageId: channel.externalId, token, message: content.text, link: content.link ?? undefined, imageUrl, videoUrl, app });

    await db.socialPost.update({
      where: { id: postId },
      data: { status: "PUBLISHED", publishedAt: new Date(), externalId: result.id, externalUrl: result.url, error: null },
    });
    await db.socialChannel.update({ where: { id: channel.id }, data: { lastUsedAt: new Date() } });
    await audit({ organizationId: post.organizationId, userId: post.createdById, action: "PUBLISH", entity: "SocialPost", entityId: postId, changes: { externalId: result.id } });
    await fireAutomations({
      organizationId: post.organizationId,
      brandId: post.brandId,
      trigger: "POST_PUBLISHED",
      eventKey: `post:${postId}:published`,
      context: { postId, channelName: channel.name, brandName: post.brand.name, url: result.url },
    });
  } catch (error) {
    if (error instanceof MetaApiError && error.definite && error.code !== undefined && THROTTLED.has(error.code)) {
      // Rate-limited: hand it back to the queue, which waits with backoff.
      await db.socialPost.update({ where: { id: postId }, data: { status: "SCHEDULED", error: error.message } });
      throw error;
    }
    const message =
      error instanceof MetaApiError && !error.definite
        ? "Meta did not answer, so the post may have gone out. Check the page, then retry if it is not there."
        : `Meta rejected the post: ${error instanceof Error ? error.message : String(error)}`;
    await finishFailed(post.id, post.organizationId, post.brandId, message);
  }
}

async function finishFailed(postId: string, organizationId: string, brandId: string, message: string) {
  await db.socialPost.update({ where: { id: postId }, data: { status: "FAILED", error: message.slice(0, 1000) } });
  await fireAutomations({
    organizationId,
    brandId,
    trigger: "POST_FAILED",
    eventKey: `post:${postId}:failed:${Date.now()}`,
    context: { postId, error: message },
  });
}
