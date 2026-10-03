import "server-only";

import crypto from "node:crypto";

import { env } from "@/lib/env";
import { isStandIn, providerName } from "@/lib/providers";
import { resolveGateway } from "@/server/gateways";

/**
 * Meta: Facebook Pages, Instagram and the WhatsApp Cloud API, behind one
 * interface with two implementations.
 *
 *  - `graph` calls graph.facebook.com with the channel's own token.
 *  - `simulator` answers like Graph does, for development and CI. It is refused
 *    in production by providerName("META"), so it can never pretend to post.
 *
 * Every Graph failure becomes a MetaApiError. `definite` records whether Meta
 * actually answered: a definite rejection is safe to retry after fixing the
 * cause, while a timeout may have posted anyway — the publisher will not retry
 * those blind (see src/server/publishing.ts).
 */

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly definite: boolean,
    readonly status?: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export interface PageAccount {
  pageId: string;
  pageName: string;
  pageToken: string;
  instagram?: { id: string; username: string | null };
}

/**
 * Every call that carries a token takes the Meta app that issued it: Graph
 * checks appsecret_proof against that app's secret, so a token from an
 * agency's own app fails when signed with the deployment's (and vice versa).
 */
export interface MetaProvider {
  readonly name: "graph" | "simulator";
  sendWhatsAppText(p: { phoneNumberId: string; token: string; to: string; body: string; app?: MetaApp }): Promise<{ messageId: string }>;
  markWhatsAppRead(p: { phoneNumberId: string; token: string; messageId: string; app?: MetaApp }): Promise<void>;
  publishToPage(p: { pageId: string; token: string; message: string; link?: string; imageUrl?: string; videoUrl?: string; app?: MetaApp }): Promise<{ id: string; url: string | null }>;
  /** An image post, or a Reel when `videoUrl` is given. */
  publishToInstagram(p: { igUserId: string; token: string; caption: string; imageUrl?: string; videoUrl?: string; app?: MetaApp }): Promise<{ id: string; url: string | null }>;
  /** Proves a token still works for an object (page, IG account, phone number). */
  checkObject(p: { objectId: string; token: string; fields: string; app?: MetaApp }): Promise<Record<string, unknown>>;
  oauthDialogUrl(p: { state: string; redirectUri: string; app?: MetaApp }): string;
  pagesFromCode(p: { code: string; redirectUri: string; app?: MetaApp }): Promise<PageAccount[]>;
}

export const OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];

// ── graph ────────────────────────────────────────────────────────────────

/** App credentials for one call: an org's own Meta app when it has one, else the deployment's. */
export interface MetaApp {
  appId: string;
  appSecret: string;
}

function graphConfig(app?: MetaApp) {
  const e = env();
  const appId = app?.appId || e.META_APP_ID;
  const appSecret = app?.appSecret || e.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new MetaApiError("META_APP_ID and META_APP_SECRET must be set, or saved in Settings, to use the Graph API.", true);
  }
  return { appId, appSecret, version: e.META_GRAPH_VERSION };
}

/** appsecret_proof: proves the call comes from the app's server, not a stolen token alone. */
function proof(token: string, appSecret: string): string {
  return crypto.createHmac("sha256", appSecret).update(token).digest("hex");
}

async function graph<T>(
  method: "GET" | "POST",
  path: string,
  token: string | null,
  params: Record<string, string | undefined> = {},
  body?: unknown,
  app?: MetaApp,
): Promise<T> {
  const { version, appSecret } = graphConfig(app);
  const url = new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  if (token) url.searchParams.set("appsecret_proof", proof(token, appSecret));

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    // No answer: the request may or may not have taken effect.
    throw new MetaApiError(`Meta did not answer: ${error instanceof Error ? error.message : String(error)}`, false);
  }

  const json = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } } & T;
  if (!response.ok || json.error) {
    const e = json.error ?? {};
    // A 5xx is Meta failing mid-flight; treat like a timeout.
    throw new MetaApiError(e.message ?? `Graph API error ${response.status}`, response.status < 500, response.status, e.code);
  }
  return json;
}

const graphProvider: MetaProvider = {
  name: "graph",

  async sendWhatsAppText({ phoneNumberId, token, to, body, app }) {
    const res = await graph<{ messages?: Array<{ id: string }> }>(
      "POST",
      `${phoneNumberId}/messages`,
      token,
      {},
      { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: true, body } },
      app,
    );
    const id = res.messages?.[0]?.id;
    if (!id) throw new MetaApiError("WhatsApp accepted the request but returned no message id.", false);
    return { messageId: id };
  },

  async markWhatsAppRead({ phoneNumberId, token, messageId, app }) {
    await graph("POST", `${phoneNumberId}/messages`, token, {}, { messaging_product: "whatsapp", status: "read", message_id: messageId }, app);
  },

  async publishToPage({ pageId, token, message, link, imageUrl, videoUrl, app }) {
    if (videoUrl) {
      const res = await graph<{ id: string }>("POST", `${pageId}/videos`, token, {}, { file_url: videoUrl, description: message }, app);
      return { id: res.id, url: `https://www.facebook.com/${res.id}` };
    }
    if (imageUrl) {
      const res = await graph<{ id: string; post_id?: string }>("POST", `${pageId}/photos`, token, {}, { url: imageUrl, caption: message }, app);
      const id = res.post_id ?? res.id;
      return { id, url: `https://www.facebook.com/${id}` };
    }
    const res = await graph<{ id: string }>("POST", `${pageId}/feed`, token, {}, { message, ...(link ? { link } : {}) }, app);
    return { id: res.id, url: `https://www.facebook.com/${res.id}` };
  },

  async publishToInstagram({ igUserId, token, caption, imageUrl, videoUrl, app }) {
    if (!imageUrl && !videoUrl) throw new MetaApiError("Instagram posts need an image or a video.", true);
    const container = await graph<{ id: string }>(
      "POST",
      `${igUserId}/media`,
      token,
      {},
      videoUrl ? { media_type: "REELS", video_url: videoUrl, caption } : { image_url: imageUrl, caption },
      app,
    );
    // Instagram fetches and processes the media before it can be published;
    // a Reel takes much longer than an image.
    const attempts = videoUrl ? 60 : 10;
    let finished = false;
    for (let i = 0; i < attempts; i++) {
      const status = await graph<{ status_code?: string }>("GET", container.id, token, { fields: "status_code" }, undefined, app);
      if (status.status_code === "FINISHED") {
        finished = true;
        break;
      }
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        throw new MetaApiError(`Instagram could not process the media (${status.status_code}).`, true);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!finished) throw new MetaApiError("Instagram is still processing the media; try again in a few minutes.", true);
    const published = await graph<{ id: string }>("POST", `${igUserId}/media_publish`, token, {}, { creation_id: container.id }, app);
    const permalink = await graph<{ permalink?: string }>("GET", published.id, token, { fields: "permalink" }, undefined, app).catch(() => ({
      permalink: undefined,
    }));
    return { id: published.id, url: permalink.permalink ?? null };
  },

  async checkObject({ objectId, token, fields, app }) {
    return graph<Record<string, unknown>>("GET", objectId, token, { fields }, undefined, app);
  },

  oauthDialogUrl({ state, redirectUri, app }) {
    const { appId, version } = graphConfig(app);
    const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", OAUTH_SCOPES.join(","));
    return url.toString();
  },

  async pagesFromCode({ code, redirectUri, app }) {
    const { appId, appSecret } = graphConfig(app);
    const short = await graph<{ access_token: string }>(
      "GET",
      "oauth/access_token",
      null,
      { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
      undefined,
      app,
    );
    // Page tokens derived from a long-lived user token do not expire.
    const long = await graph<{ access_token: string }>(
      "GET",
      "oauth/access_token",
      null,
      { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token },
      undefined,
      app,
    );
    const pages = await graph<{
      data: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }>;
    }>("GET", "me/accounts", long.access_token, { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100" }, undefined, app);
    return pages.data.map((p) => ({
      pageId: p.id,
      pageName: p.name,
      pageToken: p.access_token,
      instagram: p.instagram_business_account
        ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? null }
        : undefined,
    }));
  },
};

// ── simulator ────────────────────────────────────────────────────────────

const fakeId = (prefix: string) => `${prefix}${crypto.randomBytes(8).toString("hex")}`;

/** Put "[fail]" in a message or caption to exercise the failure path. */
function maybeFail(text: string): void {
  if (text.includes("[fail]")) throw new MetaApiError("(simulator) Meta rejected this request because it contains [fail].", true, 400, 100);
}

const simulatorProvider: MetaProvider = {
  name: "simulator",
  async sendWhatsAppText({ body }) {
    maybeFail(body);
    return { messageId: `wamid.SIM${crypto.randomBytes(12).toString("hex").toUpperCase()}` };
  },
  async markWhatsAppRead() {},
  async publishToPage({ pageId, message }) {
    maybeFail(message);
    const id = `${pageId}_${fakeId("")}`;
    return { id, url: null };
  },
  async publishToInstagram({ caption }) {
    maybeFail(caption);
    return { id: fakeId("1789"), url: null };
  },
  async checkObject({ objectId }) {
    return { id: objectId, name: "Simulated account", simulated: true };
  },
  oauthDialogUrl({ state, redirectUri }) {
    // Straight back to our own callback, as if the person approved everything.
    const url = new URL(redirectUri);
    url.searchParams.set("code", "simulated");
    url.searchParams.set("state", state);
    return url.toString();
  },
  async pagesFromCode() {
    const n = crypto.randomInt(100, 999);
    return [
      {
        pageId: fakeId("sim_page_"),
        pageName: `Simulated Page ${n}`,
        pageToken: fakeId("sim_token_"),
        instagram: { id: fakeId("sim_ig_"), username: `simulated_${n}` },
      },
    ];
  },
};

export function meta(): MetaProvider {
  return providerName("META") === "graph" ? graphProvider : simulatorProvider;
}

/**
 * The org's own Meta app, when it has saved one in Settings. OAuth and every
 * token exchange then run against the agency's app rather than the
 * deployment's, since a token issued by one app fails the other's
 * appsecret_proof.
 */
export async function metaAppFor(organizationId: string | null | undefined): Promise<MetaApp | undefined> {
  if (!organizationId) return undefined;
  const cfg = await resolveGateway(organizationId, "social").catch(() => null);
  if (!cfg?.appId || !cfg?.appSecret) return undefined;
  return { appId: cfg.appId, appSecret: cfg.appSecret };
}

/** The app id a token was issued under, recorded on the channel when it is connected. */
export async function issuingAppId(organizationId: string): Promise<string | null> {
  return (await metaAppFor(organizationId))?.appId ?? env().META_APP_ID ?? null;
}

/**
 * The app that issued a channel's token: the organisation's own app when the
 * channel was connected through it (or predates the record), otherwise the
 * deployment's. Saving a new app in Settings therefore does not break channels
 * connected under the old one; they keep working until reconnected.
 */
export async function metaAppForChannel(channel: { organizationId: string; metadata: unknown }): Promise<MetaApp | undefined> {
  const issuedBy = (channel.metadata as { appId?: string | null } | null)?.appId ?? null;
  const org = await metaAppFor(channel.organizationId);
  if (org && (!issuedBy || issuedBy === org.appId)) return org;
  return undefined;
}

/**
 * Whether Meta is backed by the local stand-in. Purely a label for the UI, so
 * it reads the configured name rather than providerName(): a page that asks this
 * must still render in production. Every action that would reach Graph goes
 * through meta(), and that is where a production stand-in is refused.
 */
export function isSimulated(): boolean {
  return isStandIn("META");
}
