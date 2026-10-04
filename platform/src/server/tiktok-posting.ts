import "server-only";

import { readFile, stat } from "node:fs/promises";

import type { Prisma, SocialChannel } from "@prisma/client";

import { ApiError, conflict, notFound } from "@/lib/api";
import { audit, auditAs } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Principal } from "@/lib/rbac";
import { decryptFor, encryptFor } from "@/lib/secrets";
import { orgIdOf } from "@/lib/tenant";
import { chunkPlan, describeTikTokFailure, tikTokOptionsSchema, type TikTokOptions } from "@/lib/tiktok";

import { fireAutomations } from "./automations";
import { accessTokenOf, activeAccount, refreshTokenOf, saveExternalAccount, updateTokens } from "./external-accounts";
import { enqueue } from "./jobs";
import { publicMediaUrl } from "./media-links";
import { finishFailed, finishPublished } from "./post-outcomes";
import { resolveKey } from "./storage";
import { tiktok, TikTokError, type CreatorInfo, type TikTokTokens } from "./tiktok";

/**
 * TikTok channels: connecting a creator account, keeping its day-long access
 * token fresh, publishing (start, then poll the publish status until TikTok
 * says it is done), and the comment sweep that feeds COMMENT_RECEIVED
 * automations through TikTok's Business API.
 */

const REFRESH_EARLY_MS = 10 * 60_000;
/** Status checks before giving up on a publish TikTok has not finished (about two hours). */
const MAX_STATUS_CHECKS = 60;

type ChannelRow = SocialChannel;

function seal(organizationId: string, t: TikTokTokens) {
  const access = encryptFor(organizationId, t.accessToken);
  const refresh = t.refreshToken ? encryptFor(organizationId, t.refreshToken) : null;
  return {
    tokenCipher: access.cipherText,
    tokenIv: access.iv,
    tokenTag: access.authTag,
    tokenExpiresAt: t.accessExpiresAt,
    refreshCipher: refresh?.cipherText ?? null,
    refreshIv: refresh?.iv ?? null,
    refreshTag: refresh?.authTag ?? null,
    refreshExpiresAt: refresh ? t.refreshExpiresAt : null,
  };
}

/** Stores the TikTok account a Login Kit sign-in returned, as a channel of the brand. */
export async function connectTikTok(principal: Principal, brandId: string, code: string, redirectUri: string) {
  const organizationId = orgIdOf(principal);
  const brand = await db.brand.findFirst({ where: { id: brandId, organizationId, status: "ACTIVE" }, select: { id: true } });
  if (!brand) throw notFound("Brand not found.");
  const t = await tiktok().exchangeCode({ code, redirectUri });
  if (!t.scopes.includes("video.publish") && tiktok().name === "live") {
    throw new ApiError(422, "SCOPE_MISSING", "TikTok did not grant permission to post. Connect again and allow posting.");
  }
  const user = await tiktok().userInfo(t.accessToken);
  const creator = await tiktok().creatorInfo(t.accessToken).catch(() => null);
  const openId = user.openId || t.openId;

  const other = await db.socialChannel.findFirst({
    where: { platform: "TIKTOK", externalId: openId, status: { not: "DISCONNECTED" }, organizationId: { not: organizationId } },
    select: { id: true },
  });
  if (other) throw conflict("That TikTok account is already connected to another organisation.");

  const data = {
    brandId,
    name: creator?.nickname || user.displayName,
    handle: creator?.username || null,
    status: "ACTIVE",
    archivedAt: null,
    metadata: { avatarUrl: user.avatarUrl, scopes: t.scopes } as Prisma.InputJsonValue,
    connectedById: principal.userId,
    connectedAt: new Date(),
    ...seal(organizationId, t),
  };
  const existing = await db.socialChannel.findFirst({ where: { organizationId, platform: "TIKTOK", externalId: openId }, select: { id: true } });
  const channel = existing
    ? await db.socialChannel.update({ where: { id: existing.id }, data, select: { id: true, name: true } })
    : await db.socialChannel.create({ data: { ...data, organizationId, platform: "TIKTOK", externalId: openId }, select: { id: true, name: true } });
  await auditAs(principal, "CONNECT_CHANNEL", "SocialChannel", channel.id, { platform: "TIKTOK", name: channel.name });
  return channel;
}

/** A usable access token for a TikTok channel, refreshed when it is about to expire. */
export async function tiktokTokenFor(channel: ChannelRow): Promise<string> {
  const access = channel.tokenCipher && channel.tokenIv && channel.tokenTag ? decryptFor(channel.organizationId, { cipherText: channel.tokenCipher, iv: channel.tokenIv, authTag: channel.tokenTag }) : null;
  if (access && channel.tokenExpiresAt && channel.tokenExpiresAt.getTime() - Date.now() > REFRESH_EARLY_MS) return access;
  const refresh = channel.refreshCipher && channel.refreshIv && channel.refreshTag ? decryptFor(channel.organizationId, { cipherText: channel.refreshCipher, iv: channel.refreshIv, authTag: channel.refreshTag }) : null;
  if (!refresh || (channel.refreshExpiresAt && channel.refreshExpiresAt.getTime() < Date.now())) {
    await db.socialChannel.update({ where: { id: channel.id }, data: { status: "EXPIRED" } });
    throw new TikTokError("The TikTok sign-in has expired. Reconnect the account.", "access_token_invalid");
  }
  let t: TikTokTokens;
  try {
    t = await tiktok().refresh(refresh);
  } catch (error) {
    if (error instanceof TikTokError && !error.retryable) await db.socialChannel.update({ where: { id: channel.id }, data: { status: "EXPIRED" } });
    throw error;
  }
  await db.socialChannel.update({ where: { id: channel.id }, data: seal(channel.organizationId, t) });
  return t.accessToken;
}

async function ownedTikTokChannel(principal: Principal, channelId: string): Promise<ChannelRow> {
  const channel = await db.socialChannel.findFirst({ where: { id: channelId, organizationId: orgIdOf(principal), platform: "TIKTOK" } });
  if (!channel) throw notFound("TikTok account not found.");
  if (channel.status !== "ACTIVE") throw conflict("This TikTok account is disconnected. Reconnect it first.");
  return channel;
}

/** What the composer must show before a TikTok post (TikTok's rules): the account, and the privacy choices it allows. */
export async function creatorInfoFor(principal: Principal, channelId: string): Promise<CreatorInfo> {
  const channel = await ownedTikTokChannel(principal, channelId);
  return tiktok().creatorInfo(await tiktokTokenFor(channel));
}

export interface TikTokPostContent {
  text: string;
  assetId: string | null;
  tiktok?: TikTokOptions;
  tiktokPublishId?: string;
}

/**
 * Starts publishing a claimed (PUBLISHING) post. Uploads a video in chunks, or
 * hands TikTok our signed links for a photo, then schedules status checks.
 * Returns nothing; failures end the post as FAILED, and a TikTok outage hands
 * it back to the queue.
 */
export async function startTikTokPublish(post: { id: string; organizationId: string; brandId: string; content: Prisma.JsonValue }, channel: ChannelRow): Promise<void> {
  const content = post.content as unknown as TikTokPostContent;
  const fail = (message: string) => finishFailed(post.id, post.organizationId, post.brandId, message);
  const options = tikTokOptionsSchema.safeParse(content.tiktok);
  if (!options.success) return fail("TikTok posts need a privacy choice. Schedule it again from Social and choose who can see it.");
  if (!content.assetId) return fail("TikTok needs a video or a picture.");
  const asset = await db.generatedAsset.findFirst({
    where: { id: content.assetId, organizationId: post.organizationId, status: "READY" },
    select: { id: true, mediaType: true, storageKey: true, mimeType: true, durationSeconds: true },
  });
  if (!asset?.storageKey) return fail("The attached media is no longer in the library.");

  try {
    const token = await tiktokTokenFor(channel);
    const creator = await tiktok().creatorInfo(token);
    const o = options.data;
    if (!creator.privacyOptions.includes(o.privacyLevel)) {
      return fail(`This TikTok account cannot post with that privacy choice. It allows: ${creator.privacyOptions.join(", ") || "none"}.`);
    }
    if (asset.mediaType === "VIDEO" && asset.durationSeconds && asset.durationSeconds > creator.maxVideoSeconds) {
      return fail(`This TikTok account can post videos up to ${creator.maxVideoSeconds} seconds; this one is ${asset.durationSeconds}.`);
    }
    const postInfo = {
      title: content.text,
      privacyLevel: o.privacyLevel,
      disableComment: creator.commentDisabled || !o.allowComments,
      disableDuet: creator.duetDisabled || !o.allowDuet,
      disableStitch: creator.stitchDisabled || !o.allowStitch,
      brandContent: o.brandedContent,
      brandOrganic: o.yourBrand,
    };

    let publishId: string;
    if (asset.mediaType === "VIDEO") {
      const file = resolveKey(asset.storageKey);
      const size = (await stat(file)).size;
      const plan = chunkPlan(size);
      const init = await tiktok().initVideo({ token, post: postInfo, size, chunkSize: plan.chunkSize, chunkCount: plan.count });
      const bytes = await readFile(file);
      for (const r of plan.ranges) {
        await tiktok().uploadChunk({ uploadUrl: init.uploadUrl, bytes: bytes.subarray(r.start, r.end + 1), start: r.start, end: r.end, total: size, mimeType: asset.mimeType ?? "video/mp4" });
      }
      publishId = init.publishId;
    } else {
      publishId = (await tiktok().initPhoto({ token, post: postInfo, photoUrls: [publicMediaUrl(asset.id)] })).publishId;
    }

    await db.socialPost.update({
      where: { id: post.id },
      data: { content: { ...(content as object), tiktokPublishId: publishId } as Prisma.InputJsonValue, error: null },
    });
    await enqueue("tiktok.status", { postId: post.id, n: 0 }, { runAt: new Date(Date.now() + 5_000), organizationId: post.organizationId, dedupeKey: `tiktok.status:${post.id}:0`, maxAttempts: 3 });
  } catch (error) {
    if (error instanceof TikTokError && error.retryable) {
      await db.socialPost.update({ where: { id: post.id }, data: { status: "SCHEDULED", error: error.message } });
      throw error; // the queue tries again with backoff
    }
    const message = error instanceof TikTokError ? (error.code?.includes("unaudited") || error.code?.includes("privacy") ? describeTikTokFailure(error.code) : `TikTok refused the post: ${error.message}`) : `TikTok refused the post: ${(error as Error).message}`;
    await fail(message);
  }
}

const statusDelay = (n: number) => [5_000, 10_000, 15_000, 30_000, 60_000][n] ?? 120_000;

/** The `tiktok.status` job: asks TikTok how a publish is going, and finishes or re-checks the post. */
export async function checkTikTokStatus(postId: string, n: number): Promise<void> {
  const post = await db.socialPost.findUnique({ where: { id: postId }, include: { channel: true, brand: { select: { name: true } } } });
  if (!post || post.status !== "PUBLISHING" || post.channel.platform !== "TIKTOK") return;
  const content = post.content as unknown as TikTokPostContent;
  if (!content.tiktokPublishId) return;

  let state;
  try {
    state = await tiktok().status({ token: await tiktokTokenFor(post.channel), publishId: content.tiktokPublishId });
  } catch (error) {
    if (error instanceof TikTokError && error.unauthorised) {
      await finishFailed(post.id, post.organizationId, post.brandId, "The TikTok sign-in stopped working while the post was processing. Reconnect TikTok and check the account.");
      return;
    }
    await scheduleStatus(post, n + 1);
    return;
  }

  if (state.status === "PUBLISH_COMPLETE") {
    const videoId = state.postIds[0] ?? null;
    const handle = post.channel.handle;
    await finishPublished({
      postId: post.id,
      organizationId: post.organizationId,
      brandId: post.brandId,
      createdById: post.createdById,
      channel: { id: post.channel.id, name: post.channel.name },
      brandName: post.brand.name,
      externalId: videoId ?? `publish:${content.tiktokPublishId}`,
      url: videoId && handle ? `https://www.tiktok.com/@${encodeURIComponent(handle)}/video/${videoId}` : null,
    });
    return;
  }
  if (state.status === "FAILED") {
    await finishFailed(post.id, post.organizationId, post.brandId, describeTikTokFailure(state.failReason));
    return;
  }
  await scheduleStatus(post, n + 1);
}

async function scheduleStatus(post: { id: string; organizationId: string; brandId: string }, n: number) {
  // A one-off check from a webhook (n >= 99) never starts a chain of its own.
  if (n >= 99) return;
  if (n > MAX_STATUS_CHECKS) {
    await finishFailed(post.id, post.organizationId, post.brandId, "TikTok has not confirmed this post after two hours. Check the TikTok app before trying again.");
    return;
  }
  await enqueue("tiktok.status", { postId: post.id, n }, { runAt: new Date(Date.now() + statusDelay(n)), organizationId: post.organizationId, dedupeKey: `tiktok.status:${post.id}:${n}`, maxAttempts: 3 });
}

// ── comments (TikTok API for Business) ──────────────────────────────────

/** Links a TikTok channel to a Business API sign-in, so its comments can be read and answered. */
export async function connectTikTokComments(principal: Principal, channelId: string, code: string, redirectUri: string) {
  const channel = await ownedTikTokChannel(principal, channelId);
  const t = await tiktok().bizExchange({ code, redirectUri });
  if (tiktok().name === "live" && !t.scopes.includes("comment.list.manage")) {
    throw new ApiError(422, "SCOPE_MISSING", "TikTok did not grant permission to manage comments. Connect again and allow comments.");
  }
  const profile = await tiktok().bizProfile({ token: t.accessToken, businessId: t.openId });
  const account = await saveExternalAccount({
    organizationId: channel.organizationId,
    provider: "TIKTOK_BUSINESS",
    externalId: t.openId,
    name: profile.displayName || channel.name,
    handle: profile.username,
    channelId: channel.id,
    tokens: { accessToken: t.accessToken, accessExpiresAt: t.accessExpiresAt, refreshToken: t.refreshToken || null, refreshExpiresAt: t.refreshExpiresAt, scopes: t.scopes },
    connectedById: principal.userId,
    metadata: { seen: {} },
  });
  await auditAs(principal, "CONNECT", "ExternalAccount", account.id, { provider: "TIKTOK_BUSINESS", channel: channel.name });
  return account;
}

async function businessToken(account: NonNullable<Awaited<ReturnType<typeof activeAccount>>>): Promise<string> {
  const access = accessTokenOf(account);
  if (access && account.accessExpiresAt && account.accessExpiresAt.getTime() - Date.now() > REFRESH_EARLY_MS) return access;
  const refresh = refreshTokenOf(account);
  if (!refresh) throw new TikTokError("The TikTok comments sign-in has expired. Connect comment replies again.", "access_token_invalid");
  const t = await tiktok().bizRefresh(refresh);
  await updateTokens(account, { accessToken: t.accessToken, accessExpiresAt: t.accessExpiresAt, refreshToken: t.refreshToken || refresh, refreshExpiresAt: t.refreshExpiresAt, scopes: t.scopes.length ? t.scopes : account.scopes });
  return t.accessToken;
}

/**
 * The comment sweep (every few minutes): new comments on each linked
 * account's recent videos become COMMENT_RECEIVED events. The first look at a
 * video only records where it is up to, so old comments are never answered.
 * The account's own replies are skipped, so automations never answer themselves.
 */
export async function sweepTikTokComments(): Promise<{ accounts: number; events: number }> {
  const accounts = await db.externalAccount.findMany({ where: { provider: "TIKTOK_BUSINESS", status: "ACTIVE" }, take: 200 });
  let events = 0;
  for (const account of accounts) {
    if (!account.channelId) continue;
    const channel = await db.socialChannel.findFirst({ where: { id: account.channelId, status: "ACTIVE" }, include: { brand: { select: { name: true } } } });
    if (!channel) continue;
    const meta = (account.metadata ?? {}) as { seen?: Record<string, CommentMark | number> };
    const seen: Record<string, CommentMark> = Object.fromEntries(Object.entries(meta.seen ?? {}).map(([k, v]) => [k, typeof v === "number" ? { t: v, ids: [] } : v]));
    try {
      const token = await businessToken(account);
      const videos = (await tiktok().listVideos({ token, businessId: account.externalId })).slice(0, 10);
      for (const v of videos) {
        const comments = await tiktok().listComments({ token, businessId: account.externalId, videoId: v.videoId });
        const prev = seen[v.videoId];
        if (!prev) {
          seen[v.videoId] = markOf(comments, { t: 0, ids: [] });
          continue;
        }
        // Newer than the mark, or in the mark's second but not yet seen. Replies to our own replies are
        // skipped too, so an automation never ends up in a conversation with itself.
        const fresh = comments.filter(
          (c) =>
            !c.owner &&
            (c.createTime > prev.t || (c.createTime === prev.t && !prev.ids.includes(c.commentId))) &&
            !(c.parentId && comments.some((p) => p.commentId === c.parentId && p.owner)),
        );
        for (const c of fresh.reverse()) {
          const queued = await fireAutomations({
            organizationId: account.organizationId,
            brandId: channel.brandId,
            trigger: "COMMENT_RECEIVED",
            eventKey: `tiktok-comment:${c.commentId}`,
            context: { channelId: channel.id, commentId: c.commentId, videoId: v.videoId, body: c.text, authorName: c.username, channelName: channel.name, brandName: channel.brand.name, videoCaption: v.caption },
          });
          events += queued;
        }
        seen[v.videoId] = markOf(comments, prev);
      }
      await db.externalAccount.update({ where: { id: account.id }, data: { metadata: { ...meta, seen, lastSweepAt: new Date().toISOString(), lastError: null } as unknown as Prisma.InputJsonValue } });
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);
      await db.externalAccount.update({
        where: { id: account.id },
        data: { metadata: { ...meta, seen, lastSweepAt: new Date().toISOString(), lastError: message } as unknown as Prisma.InputJsonValue, ...(error instanceof TikTokError && error.unauthorised ? { status: "DISCONNECTED" } : {}) },
      });
    }
  }
  return { accounts: accounts.length, events };
}

/** How far a video's comments have been read: the newest second seen, and the comments in that second (times are whole seconds). */
interface CommentMark {
  t: number;
  ids: string[];
}

function markOf(comments: Array<{ commentId: string; createTime: number }>, prev: CommentMark): CommentMark {
  const t = comments.reduce((m, c) => Math.max(m, c.createTime), prev.t);
  const ids = new Set(t === prev.t ? prev.ids : []);
  for (const c of comments) if (c.createTime === t) ids.add(c.commentId);
  return { t, ids: [...ids].slice(-200) };
}

/** Posts a reply under a TikTok comment (an automation's reply step). */
export async function replyToTikTokComment(input: { organizationId: string; channelId: string; videoId: string; commentId: string; text: string }): Promise<string> {
  const account = await activeAccount(input.organizationId, "TIKTOK_BUSINESS", input.channelId);
  if (!account) throw new Error("Comment replies are not connected for this TikTok account.");
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, 150);
  if (!text) throw new Error("The reply is empty.");
  const r = await tiktok().replyComment({ token: await businessToken(account), businessId: account.externalId, videoId: input.videoId, commentId: input.commentId, text });
  await audit({ organizationId: input.organizationId, action: "CREATE", entity: "TikTokCommentReply", entityId: r.commentId || input.commentId, changes: { channelId: input.channelId, commentId: input.commentId } });
  return r.commentId;
}

// ── webhooks ────────────────────────────────────────────────────────────

/**
 * A verified TikTok webhook delivery. Deauthorisation disconnects the account;
 * a publish event triggers an immediate status check (the status check, not
 * the webhook, decides the outcome).
 */
export async function handleTikTokWebhook(event: { event?: string; user_openid?: string; content?: string }): Promise<string> {
  const name = event.event ?? "";
  const openId = event.user_openid ?? "";
  if (name === "authorization.removed" && openId) {
    const r = await db.socialChannel.updateMany({ where: { platform: "TIKTOK", externalId: openId, status: "ACTIVE" }, data: { status: "DISCONNECTED" } });
    return `disconnected ${r.count}`;
  }
  if (name.startsWith("post.publish.")) {
    let publishId: string | undefined;
    try {
      publishId = (JSON.parse(event.content ?? "{}") as { publish_id?: string }).publish_id;
    } catch {
      return "ignored";
    }
    if (!publishId) return "ignored";
    const post = await db.socialPost.findFirst({
      where: { status: "PUBLISHING", channel: { platform: "TIKTOK", externalId: openId }, content: { path: ["tiktokPublishId"], equals: publishId } },
      select: { id: true, organizationId: true },
    });
    if (!post) return "unknown publish";
    await enqueue("tiktok.status", { postId: post.id, n: 99 }, { organizationId: post.organizationId, dedupeKey: `tiktok.status:${post.id}:hook:${publishId}:${name}`, maxAttempts: 3 });
    return "status check queued";
  }
  return "ignored";
}

/** Disconnects comment replies for a channel. */
export async function disconnectTikTokComments(principal: Principal, channelId: string) {
  const r = await db.externalAccount.updateMany({ where: { organizationId: orgIdOf(principal), provider: "TIKTOK_BUSINESS", channelId }, data: { status: "DISCONNECTED" } });
  await auditAs(principal, "DISCONNECT", "ExternalAccount", channelId, { provider: "TIKTOK_BUSINESS" });
  return r.count;
}
