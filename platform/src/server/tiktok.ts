import "server-only";

import crypto from "node:crypto";

import { env } from "@/lib/env";
import { providerName } from "@/lib/providers";
import type { PrivacyLevel } from "@/lib/tiktok";

/**
 * TikTok, behind one interface with a live client and a simulator.
 *
 *   posting    Login Kit + Content Posting API (open.tiktokapis.com, v2): a
 *              creator signs in, and videos are uploaded (FILE_UPLOAD) or photos
 *              pulled from our signed media links (PULL_FROM_URL, which needs the
 *              domain verified in the TikTok app). Publishing is asynchronous:
 *              init returns a publish_id whose status is polled until done.
 *   comments   TikTok API for Business (business-api.tiktok.com, v1.3), for
 *              TikTok Business accounts: list a video's comments and reply.
 *              It is a separate TikTok app with its own approval.
 *
 * Unaudited TikTok apps can only post privately ("Only me"); TikTok answers
 * `unaudited_client_can_only_post_to_private_accounts` otherwise.
 */

export class TikTokError extends Error {
  constructor(
    message: string,
    /** TikTok's own error code, e.g. access_token_invalid, rate_limit_exceeded */
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TikTokError";
  }
  get retryable(): boolean {
    return this.code === "rate_limit_exceeded" || this.code === "internal_error" || (this.status ?? 0) >= 500 || this.code === "network";
  }
  get unauthorised(): boolean {
    return this.code === "access_token_invalid" || this.code === "scope_not_authorized" || this.status === 401;
  }
}

export interface TikTokTokens {
  openId: string;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  scopes: string[];
}

export interface CreatorInfo {
  username: string;
  nickname: string;
  avatarUrl: string | null;
  privacyOptions: PrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoSeconds: number;
}

export interface PostInfo {
  title: string;
  privacyLevel: PrivacyLevel;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  brandContent: boolean;
  brandOrganic: boolean;
}

export type PublishStatus = "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED";

export interface TikTokComment {
  commentId: string;
  text: string;
  username: string | null;
  createTime: number;
  /** Written by the account itself (our own replies): never answered */
  owner: boolean;
  parentId: string | null;
}

export interface TikTokProvider {
  readonly name: "live" | "simulator";
  authUrl(p: { state: string; redirectUri: string }): string;
  exchangeCode(p: { code: string; redirectUri: string }): Promise<TikTokTokens>;
  refresh(refreshToken: string): Promise<TikTokTokens>;
  userInfo(token: string): Promise<{ openId: string; displayName: string; avatarUrl: string | null }>;
  creatorInfo(token: string): Promise<CreatorInfo>;
  initVideo(p: { token: string; post: PostInfo; size: number; chunkSize: number; chunkCount: number }): Promise<{ publishId: string; uploadUrl: string }>;
  uploadChunk(p: { uploadUrl: string; bytes: Buffer; start: number; end: number; total: number; mimeType: string }): Promise<void>;
  initPhoto(p: { token: string; post: PostInfo; photoUrls: string[] }): Promise<{ publishId: string }>;
  status(p: { token: string; publishId: string }): Promise<{ status: PublishStatus; failReason: string | null; postIds: string[] }>;
  revoke(token: string): Promise<void>;
  // Business API (comments)
  bizAuthUrl(p: { state: string; redirectUri: string }): string;
  bizExchange(p: { code: string; redirectUri: string }): Promise<TikTokTokens>;
  bizRefresh(refreshToken: string): Promise<TikTokTokens>;
  bizProfile(p: { token: string; businessId: string }): Promise<{ username: string | null; displayName: string | null }>;
  listVideos(p: { token: string; businessId: string }): Promise<Array<{ videoId: string; caption: string | null; createTime: number }>>;
  listComments(p: { token: string; businessId: string; videoId: string }): Promise<TikTokComment[]>;
  replyComment(p: { token: string; businessId: string; videoId: string; commentId: string; text: string }): Promise<{ commentId: string }>;
}

export const LOGIN_SCOPES = ["user.info.basic", "video.publish"];
export const BUSINESS_SCOPES = ["user.info.basic", "user.info.username", "video.list", "comment.list", "comment.list.manage"];

const OPEN = "https://open.tiktokapis.com";
const BIZ = "https://business-api.tiktok.com/open_api/v1.3";

// ── live ─────────────────────────────────────────────────────────────────

function live(): TikTokProvider {
  const e = env();
  const need = (v: string | undefined, what: string) => {
    if (!v) throw new TikTokError(`TikTok is not configured: set the ${what} in Settings → TikTok.`, "not_configured");
    return v;
  };

  async function request<T>(url: string, init: RequestInit & { timeoutMs?: number }): Promise<{ res: Response; body: T | null }> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 30_000) });
    } catch (error) {
      throw new TikTokError(`Could not reach TikTok (${(error as Error).message}).`, "network");
    }
    return { res, body: (await res.json().catch(() => null)) as T | null };
  }

  /** open.tiktokapis.com answers { data, error: { code: "ok" | …, message } }. */
  async function open<T>(path: string, token: string, body?: unknown): Promise<T> {
    const { res, body: b } = await request<{ data?: T; error?: { code?: string; message?: string } }>(`${OPEN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const code = b?.error?.code;
    if (!res.ok || (code && code !== "ok")) throw new TikTokError(b?.error?.message || `TikTok returned ${res.status}.`, code ?? `http_${res.status}`, res.status);
    return (b?.data ?? {}) as T;
  }

  async function oauth(form: Record<string, string>): Promise<TikTokTokens> {
    const { res, body: b } = await request<{
      access_token?: string;
      expires_in?: number;
      open_id?: string;
      refresh_token?: string;
      refresh_expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    }>(`${OPEN}/v2/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: need(e.TIKTOK_CLIENT_KEY, "client key"), client_secret: need(e.TIKTOK_CLIENT_SECRET, "client secret"), ...form }),
    });
    if (!res.ok || !b?.access_token || !b.open_id) throw new TikTokError(b?.error_description || b?.error || `TikTok refused the sign-in (${res.status}).`, b?.error ?? "oauth_failed", res.status);
    return tokens(b.open_id, b.access_token, b.expires_in, b.refresh_token, b.refresh_expires_in, b.scope);
  }

  /** business-api.tiktok.com answers { code: 0, message, data }. */
  async function biz<T>(path: string, init: { token?: string; method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown }): Promise<T> {
    const url = new URL(`${BIZ}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
    const { res, body: b } = await request<{ code?: number; message?: string; data?: T }>(url.toString(), {
      method: init.method ?? "GET",
      headers: { "Content-Type": "application/json", ...(init.token ? { "Access-Token": init.token } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok || b?.code !== 0) throw new TikTokError(b?.message || `TikTok Business API returned ${res.status}.`, String(b?.code ?? `http_${res.status}`), res.status);
    return (b.data ?? {}) as T;
  }

  async function bizToken(path: string, body: Record<string, string>): Promise<TikTokTokens> {
    const d = await biz<{ access_token?: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; open_id?: string; scope?: string }>(path, {
      method: "POST",
      body: { client_id: need(e.TIKTOK_BUSINESS_APP_ID, "Business API app ID"), client_secret: need(e.TIKTOK_BUSINESS_SECRET, "Business API secret"), ...body },
    });
    if (!d.access_token || !d.open_id) throw new TikTokError("TikTok did not return a Business API token.", "oauth_failed");
    return tokens(d.open_id, d.access_token, d.expires_in, d.refresh_token, d.refresh_token_expires_in, d.scope);
  }

  const postInfo = (p: PostInfo, photo = false) => ({
    title: photo ? p.title.slice(0, 90) : p.title.slice(0, 2200),
    ...(photo ? { description: p.title.slice(0, 4000), auto_add_music: true } : { disable_duet: p.disableDuet, disable_stitch: p.disableStitch }),
    privacy_level: p.privacyLevel,
    disable_comment: p.disableComment,
    brand_content_toggle: p.brandContent,
    brand_organic_toggle: p.brandOrganic,
    // Everything this platform makes is AI-generated, and TikTok asks for it to be labelled.
    is_aigc: true,
  });

  return {
    name: "live",
    authUrl({ state, redirectUri }) {
      const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
      u.searchParams.set("client_key", need(e.TIKTOK_CLIENT_KEY, "client key"));
      u.searchParams.set("scope", LOGIN_SCOPES.join(","));
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      return u.toString();
    },
    exchangeCode: ({ code, redirectUri }) => oauth({ code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    refresh: (refreshToken) => oauth({ grant_type: "refresh_token", refresh_token: refreshToken }),
    async userInfo(token) {
      const d = await open<{ user?: { open_id?: string; display_name?: string; avatar_url?: string } }>("/v2/user/info/?fields=open_id,display_name,avatar_url", token);
      return { openId: d.user?.open_id ?? "", displayName: d.user?.display_name || "TikTok account", avatarUrl: d.user?.avatar_url ?? null };
    },
    async creatorInfo(token) {
      const d = await open<{
        creator_username?: string;
        creator_nickname?: string;
        creator_avatar_url?: string;
        privacy_level_options?: string[];
        comment_disabled?: boolean;
        duet_disabled?: boolean;
        stitch_disabled?: boolean;
        max_video_post_duration_sec?: number;
      }>("/v2/post/publish/creator_info/query/", token, {});
      return {
        username: d.creator_username ?? "",
        nickname: d.creator_nickname ?? d.creator_username ?? "TikTok account",
        avatarUrl: d.creator_avatar_url ?? null,
        privacyOptions: (d.privacy_level_options ?? []).filter((o): o is PrivacyLevel => ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"].includes(o)),
        commentDisabled: Boolean(d.comment_disabled),
        duetDisabled: Boolean(d.duet_disabled),
        stitchDisabled: Boolean(d.stitch_disabled),
        maxVideoSeconds: d.max_video_post_duration_sec ?? 60,
      };
    },
    async initVideo({ token, post, size, chunkSize, chunkCount }) {
      const d = await open<{ publish_id?: string; upload_url?: string }>("/v2/post/publish/video/init/", token, {
        post_info: postInfo(post),
        source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: chunkCount },
      });
      if (!d.publish_id || !d.upload_url) throw new TikTokError("TikTok did not return an upload link.", "no_upload_url");
      return { publishId: d.publish_id, uploadUrl: d.upload_url };
    },
    async uploadChunk({ uploadUrl, bytes, start, end, total, mimeType }) {
      const u = new URL(uploadUrl);
      if (u.protocol !== "https:" || !/(^|\.)tiktokapis\.com$|(^|\.)tiktok\.com$|(^|\.)tiktokv\.com$|(^|\.)byteoversea\.com$/.test(u.hostname)) {
        throw new TikTokError("TikTok returned an unexpected upload address.", "bad_upload_url");
      }
      let res: Response;
      try {
        res = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": mimeType, "Content-Length": String(bytes.length), "Content-Range": `bytes ${start}-${end}/${total}` },
          body: new Uint8Array(bytes),
          signal: AbortSignal.timeout(10 * 60_000),
        });
      } catch (error) {
        throw new TikTokError(`The upload to TikTok was interrupted (${(error as Error).message}).`, "network");
      }
      if (res.status !== 201 && res.status !== 206 && !res.ok) throw new TikTokError(`TikTok refused the upload (${res.status}).`, `upload_${res.status}`, res.status);
    },
    async initPhoto({ token, post, photoUrls }) {
      const d = await open<{ publish_id?: string }>("/v2/post/publish/content/init/", token, {
        post_info: postInfo(post, true),
        source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: photoUrls },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
      });
      if (!d.publish_id) throw new TikTokError("TikTok did not return a publish id.", "no_publish_id");
      return { publishId: d.publish_id };
    },
    async status({ token, publishId }) {
      const d = await open<{ status?: PublishStatus; fail_reason?: string; publicaly_available_post_id?: Array<string | number> }>("/v2/post/publish/status/fetch/", token, { publish_id: publishId });
      return { status: d.status ?? "PROCESSING_UPLOAD", failReason: d.fail_reason ?? null, postIds: (d.publicaly_available_post_id ?? []).map(String) };
    },
    async revoke(token) {
      await request(`${OPEN}/v2/oauth/revoke/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_key: need(e.TIKTOK_CLIENT_KEY, "client key"), client_secret: need(e.TIKTOK_CLIENT_SECRET, "client secret"), token }),
      }).catch(() => undefined);
    },

    bizAuthUrl({ state, redirectUri }) {
      const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
      u.searchParams.set("client_key", need(e.TIKTOK_BUSINESS_APP_ID, "Business API app ID"));
      u.searchParams.set("scope", BUSINESS_SCOPES.join(","));
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("state", state);
      return u.toString();
    },
    bizExchange: ({ code, redirectUri }) => bizToken("/tt_user/oauth2/token/", { grant_type: "authorization_code", auth_code: code, redirect_uri: redirectUri }),
    bizRefresh: (refreshToken) => bizToken("/tt_user/oauth2/refresh_token/", { grant_type: "refresh_token", refresh_token: refreshToken }),
    async bizProfile({ token, businessId }) {
      const d = await biz<{ username?: string; display_name?: string }>("/business/get/", {
        token,
        query: { business_id: businessId, fields: JSON.stringify(["username", "display_name"]) },
      }).catch(() => ({}) as { username?: string; display_name?: string });
      return { username: d.username ?? null, displayName: d.display_name ?? null };
    },
    async listVideos({ token, businessId }) {
      const d = await biz<{ videos?: Array<{ item_id?: string; caption?: string; create_time?: number }> }>("/business/video/list/", {
        token,
        query: { business_id: businessId, fields: JSON.stringify(["item_id", "caption", "create_time"]), max_count: "20" },
      });
      return (d.videos ?? []).filter((v) => v.item_id).map((v) => ({ videoId: String(v.item_id), caption: v.caption ?? null, createTime: Number(v.create_time ?? 0) }));
    },
    async listComments({ token, businessId, videoId }) {
      const d = await biz<{
        comments?: Array<{ comment_id?: string; text?: string; username?: string; display_name?: string; create_time?: number; owner?: boolean; parent_comment_id?: string }>;
      }>("/business/comment/list/", {
        token,
        query: { business_id: businessId, video_id: videoId, max_count: "30", sort_field: "create_time", sort_order: "desc" },
      });
      return (d.comments ?? [])
        .filter((c) => c.comment_id && c.text)
        .map((c) => ({
          commentId: String(c.comment_id),
          text: String(c.text),
          username: c.username ?? c.display_name ?? null,
          createTime: Number(c.create_time ?? 0),
          owner: Boolean(c.owner),
          parentId: c.parent_comment_id && c.parent_comment_id !== c.comment_id ? String(c.parent_comment_id) : null,
        }));
    },
    async replyComment({ token, businessId, videoId, commentId, text }) {
      const d = await biz<{ comment_id?: string }>("/business/comment/reply/create/", {
        token,
        method: "POST",
        body: { business_id: businessId, video_id: videoId, comment_id: commentId, text: text.slice(0, 150) },
      });
      return { commentId: d.comment_id ?? "" };
    },
  };
}

function tokens(openId: string, access: string, expiresIn?: number, refresh?: string, refreshIn?: number, scope?: string): TikTokTokens {
  const now = Date.now();
  return {
    openId,
    accessToken: access,
    accessExpiresAt: new Date(now + (expiresIn ?? 86_400) * 1000),
    refreshToken: refresh ?? "",
    refreshExpiresAt: new Date(now + (refreshIn ?? 31_536_000) * 1000),
    scopes: (scope ?? "").split(/[ ,]+/).filter(Boolean),
  };
}

// ── simulator ────────────────────────────────────────────────────────────

interface SimStore {
  comments: Map<string, TikTokComment[]>;
  replies: Array<{ videoId: string; commentId: string; text: string }>;
  published: Array<{ videoId: string; caption: string }>;
}
const g = globalThis as unknown as { __tiktokSim?: SimStore };
const sim: SimStore = (g.__tiktokSim ??= { comments: new Map(), replies: [], published: [] });

/** Test and demo hook: a viewer comments on a (simulated) TikTok video. */
export function simulateTikTokComment(videoId: string, text: string, username = "viewer"): TikTokComment {
  const c: TikTokComment = { commentId: `simc_${crypto.randomBytes(5).toString("hex")}`, text, username, createTime: Math.floor(Date.now() / 1000), owner: false, parentId: null };
  sim.comments.set(videoId, [c, ...(sim.comments.get(videoId) ?? [])]);
  if (!sim.published.some((p) => p.videoId === videoId)) sim.published.unshift({ videoId, caption: "Simulated video" });
  return c;
}
export const simulatedTikTokReplies = () => sim.replies;

const SIM_DELAY_MS = () => Number(process.env.SIMULATOR_TIKTOK_MS ?? 3000);

const simulator: TikTokProvider = {
  name: "simulator",
  authUrl: ({ state, redirectUri }) => `${redirectUri}?code=sim-tiktok-code&state=${encodeURIComponent(state)}`,
  async exchangeCode() {
    return tokens("sim-tiktok-creator", "sim-tiktok-access", 86_400, "sim-tiktok-refresh", 31_536_000, LOGIN_SCOPES.join(","));
  },
  async refresh() {
    return tokens("sim-tiktok-creator", `sim-tiktok-access-${Date.now()}`, 86_400, "sim-tiktok-refresh", 31_536_000, LOGIN_SCOPES.join(","));
  },
  async userInfo() {
    return { openId: "sim-tiktok-creator", displayName: "Your TikTok (simulated)", avatarUrl: null };
  },
  async creatorInfo() {
    return {
      username: "your.tiktok",
      nickname: "Your TikTok (simulated)",
      avatarUrl: null,
      privacyOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
      commentDisabled: false,
      duetDisabled: false,
      stitchDisabled: false,
      maxVideoSeconds: 600,
    };
  },
  async initVideo({ post }) {
    const outcome = post.title.includes("[fail]") ? "F" : "S";
    return { publishId: `simtt_${outcome}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`, uploadUrl: "https://open-upload.tiktokapis.com/sim" };
  },
  async uploadChunk() {
    // Nothing leaves the machine.
  },
  async initPhoto({ post }) {
    const outcome = post.title.includes("[fail]") ? "F" : "S";
    return { publishId: `simtt_${outcome}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}` };
  },
  async status({ publishId }) {
    const [, outcome, at] = publishId.split("_");
    if (Date.now() - Number(at) < SIM_DELAY_MS()) return { status: "PROCESSING_UPLOAD", failReason: null, postIds: [] };
    if (outcome === "F") return { status: "FAILED", failReason: "spam_risk_too_many_posts", postIds: [] };
    const videoId = `73${String(at).slice(-10)}`;
    if (!sim.published.some((p) => p.videoId === videoId)) sim.published.unshift({ videoId, caption: "Simulated post" });
    return { status: "PUBLISH_COMPLETE", failReason: null, postIds: [videoId] };
  },
  async revoke() {},
  bizAuthUrl: ({ state, redirectUri }) => `${redirectUri}?code=sim-tiktok-biz-code&state=${encodeURIComponent(state)}`,
  async bizExchange() {
    return tokens("sim-tiktok-business", "sim-tiktok-biz-access", 86_400, "sim-tiktok-biz-refresh", 31_536_000, BUSINESS_SCOPES.join(","));
  },
  async bizRefresh() {
    return tokens("sim-tiktok-business", `sim-tiktok-biz-access-${Date.now()}`, 86_400, "sim-tiktok-biz-refresh", 31_536_000, BUSINESS_SCOPES.join(","));
  },
  async bizProfile() {
    return { username: "your.tiktok", displayName: "Your TikTok (simulated)" };
  },
  async listVideos() {
    return sim.published.slice(0, 20).map((p) => ({ videoId: p.videoId, caption: p.caption, createTime: Math.floor(Date.now() / 1000) }));
  },
  async listComments({ videoId }) {
    return sim.comments.get(videoId) ?? [];
  },
  async replyComment({ videoId, commentId, text }) {
    sim.replies.push({ videoId, commentId, text });
    const reply: TikTokComment = { commentId: `simr_${crypto.randomBytes(4).toString("hex")}`, text, username: "your.tiktok", createTime: Math.floor(Date.now() / 1000), owner: true, parentId: commentId };
    sim.comments.set(videoId, [reply, ...(sim.comments.get(videoId) ?? [])]);
    return { commentId: reply.commentId };
  },
};

/** The client in force. Refuses the simulator in production. */
export function tiktok(): TikTokProvider {
  const name = providerName("TIKTOK");
  if (name === "off") throw new TikTokError("TikTok is switched off in Settings → TikTok.", "off");
  return name === "live" ? live() : simulator;
}

/** Whether comment features can work: a live Business API app, or the simulator. */
export function tikTokCommentsAvailable(): boolean {
  const e = env();
  if (e.TIKTOK_PROVIDER === "simulator") return true;
  return e.TIKTOK_PROVIDER === "live" && Boolean(e.TIKTOK_BUSINESS_APP_ID && e.TIKTOK_BUSINESS_SECRET);
}
