import "server-only";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { largerPinImage, parsePinUrl, type PinResult } from "@/lib/pinterest";
import { configuredProviderName, providerName } from "@/lib/providers";

import type { TokenSet } from "./external-accounts";

/**
 * Pinterest API v5, behind one interface with a live client and a simulator.
 *
 * What an ordinary Pinterest app may do (developers.pinterest.com, Oct 2026):
 * search and browse the *signed-in account's own* pins and boards. Searching
 * all of Pinterest (`/v5/search/partner/pins`) is a partner beta; it is used
 * only when a platform admin switches PINTEREST_PARTNER_SEARCH on. Any public
 * pin can still be brought in by its link, through Pinterest's oEmbed endpoint,
 * which needs no sign-in.
 */

export class PinterestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PinterestError";
  }
}

export const PINTEREST_SCOPES = ["boards:read", "pins:read", "user_accounts:read"];

export interface PinterestBoard {
  id: string;
  name: string;
  pinCount: number;
  cover: string | null;
}

export interface PinPage {
  pins: PinResult[];
  bookmark: string | null;
}

export interface PinterestProvider {
  readonly name: "live" | "simulator";
  authUrl(p: { state: string; redirectUri: string }): string;
  exchangeCode(p: { code: string; redirectUri: string }): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  me(token: string): Promise<{ id: string; username: string; name: string }>;
  searchOwn(p: { token: string; query: string; bookmark?: string | null; username: string }): Promise<PinPage>;
  boards(token: string): Promise<PinterestBoard[]>;
  boardPins(p: { token: string; boardId: string; bookmark?: string | null; username: string }): Promise<PinPage>;
  partnerSearch(p: { token: string; query: string; bookmark?: string | null }): Promise<PinPage>;
  /** One pin by id, as the signed-in account sees it; `owned` is true only when that account pinned it. */
  getPin(p: { token: string; pinId: string; username: string }): Promise<PinResult | null>;
}

const API = "https://api.pinterest.com/v5";

const pinPage = (id: string) => `https://www.pinterest.com/pin/${id}/`;

/** The best image in a v5 pin's media: the largest size it offers, or a video pin's cover. */
function imageOf(media: unknown): string | null {
  const m = media as { images?: Record<string, { url?: string; width?: number }>; cover_image_url?: string } | null;
  if (m?.images) {
    const sizes = Object.values(m.images).filter((v) => v?.url);
    sizes.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    if (sizes[0]?.url) return sizes[0].url;
  }
  return m?.cover_image_url ?? null;
}

function toPin(raw: unknown, source: PinResult["source"], owner: { username: string } | null): PinResult | null {
  const p = raw as { id?: string; title?: string | null; description?: string | null; media?: unknown; board_owner?: { username?: string }; pinner?: { username?: string } } | null;
  if (!p?.id) return null;
  const imageUrl = imageOf(p.media);
  if (!imageUrl) return null;
  const author = owner?.username ?? p.board_owner?.username ?? p.pinner?.username ?? null;
  return {
    id: String(p.id),
    title: (p.title ?? "").trim() || "Untitled pin",
    description: p.description?.trim() || null,
    imageUrl,
    link: pinPage(String(p.id)),
    author,
    authorUrl: author ? `https://www.pinterest.com/${encodeURIComponent(author)}/` : null,
    owned: owner !== null,
    source,
  };
}

function live(): PinterestProvider {
  const e = env();
  const appId = e.PINTEREST_APP_ID;
  const secret = e.PINTEREST_APP_SECRET;
  const basic = () => {
    if (!appId || !secret) throw new PinterestError("Pinterest is not configured: set the App ID and secret in Settings → Pinterest.");
    return Buffer.from(`${appId}:${secret}`).toString("base64");
  };

  async function call<T>(path: string, token: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      throw new PinterestError(`Could not reach Pinterest (${(error as Error).message}).`);
    }
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    if (res.status === 401) throw new PinterestError("Pinterest no longer accepts this sign-in. Connect Pinterest again.", 401);
    if (res.status === 403) throw new PinterestError(body?.message ?? "This Pinterest app is not allowed to do that.", 403);
    if (!res.ok) throw new PinterestError(body?.message ?? `Pinterest returned ${res.status}.`, res.status);
    return body as T;
  }

  async function token(form: Record<string, string>): Promise<TokenSet> {
    let res: Response;
    try {
      res = await fetch(`${API}/oauth/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${basic()}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new PinterestError(`Could not reach Pinterest (${(error as Error).message}).`);
    }
    const b = (await res.json().catch(() => null)) as { access_token?: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; scope?: string; message?: string } | null;
    if (!res.ok || !b?.access_token) throw new PinterestError(b?.message ?? `Pinterest refused the sign-in (${res.status}).`, res.status);
    const now = Date.now();
    return {
      accessToken: b.access_token,
      accessExpiresAt: b.expires_in ? new Date(now + b.expires_in * 1000) : null,
      refreshToken: b.refresh_token ?? null,
      refreshExpiresAt: b.refresh_token_expires_in ? new Date(now + b.refresh_token_expires_in * 1000) : null,
      scopes: (b.scope ?? "").split(/[ ,]+/).filter(Boolean),
    };
  }

  const page = (items: unknown[] | undefined, bookmark: string | null | undefined, source: PinResult["source"], owner: { username: string } | null): PinPage => ({
    pins: (items ?? []).map((i) => toPin(i, source, owner)).filter((p): p is PinResult => p !== null),
    bookmark: bookmark ?? null,
  });

  return {
    name: "live",
    authUrl({ state, redirectUri }) {
      if (!appId) throw new PinterestError("Pinterest is not configured: set the App ID in Settings → Pinterest.");
      const u = new URL("https://www.pinterest.com/oauth/");
      u.searchParams.set("client_id", appId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", PINTEREST_SCOPES.join(","));
      u.searchParams.set("state", state);
      return u.toString();
    },
    exchangeCode: ({ code, redirectUri }) => token({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    refresh: (refreshToken) => token({ grant_type: "refresh_token", refresh_token: refreshToken }),
    async me(t) {
      const u = await call<{ id?: string; username?: string; business_name?: string | null }>("/user_account", t);
      const username = u.username ?? "pinterest";
      return { id: String(u.id ?? username), username, name: u.business_name || username };
    },
    async searchOwn({ token: t, query, bookmark, username }) {
      const q = new URLSearchParams({ query, page_size: "25" });
      if (bookmark) q.set("bookmark", bookmark);
      const r = await call<{ items?: unknown[]; bookmark?: string | null }>(`/search/pins?${q}`, t);
      return page(r.items, r.bookmark, "own", { username });
    },
    async boards(t) {
      const r = await call<{ items?: Array<{ id: string; name: string; pin_count?: number; media?: { image_cover_url?: string } }> }>("/boards?page_size=100", t);
      return (r.items ?? []).map((b) => ({ id: b.id, name: b.name, pinCount: b.pin_count ?? 0, cover: b.media?.image_cover_url ?? null }));
    },
    async boardPins({ token: t, boardId, bookmark, username }) {
      if (!/^\d{1,25}$/.test(boardId)) throw new PinterestError("That board id is not valid.");
      const q = new URLSearchParams({ page_size: "25" });
      if (bookmark) q.set("bookmark", bookmark);
      const r = await call<{ items?: unknown[]; bookmark?: string | null }>(`/boards/${boardId}/pins?${q}`, t);
      return page(r.items, r.bookmark, "board", { username });
    },
    async partnerSearch({ token: t, query, bookmark }) {
      const q = new URLSearchParams({ term: query, country_code: "KE", locale: "en-US" });
      if (bookmark) q.set("bookmark", bookmark);
      const r = await call<{ items?: unknown[]; bookmark?: string | null }>(`/search/partner/pins?${q}`, t);
      return page(r.items, r.bookmark, "partner", null);
    },
    async getPin({ token: t, pinId, username }) {
      if (!/^\d{1,25}$/.test(pinId)) return null;
      try {
        const p = await call<{ board_owner?: { username?: string } }>(`/pins/${pinId}`, t);
        const mine = (p.board_owner?.username ?? "").toLowerCase() === username.toLowerCase();
        return toPin(p, mine ? "own" : "board", mine ? { username } : null);
      } catch (error) {
        if (error instanceof PinterestError && (error.status === 404 || error.status === 403)) return null;
        throw error;
      }
    },
  };
}

// ── simulator ────────────────────────────────────────────────────────────

const SAMPLE = ["burger", "coffee", "fashion", "nairobi", "perfume", "phone", "skincare", "sneakers"] as const;

function samplePins(query: string, source: PinResult["source"], owned: boolean): PinResult[] {
  const q = query.trim().toLowerCase();
  const names = SAMPLE.filter((s) => !q || s.includes(q) || q.includes(s));
  return (names.length ? names : SAMPLE).map((s, i) => ({
    id: `${source === "partner" ? 9000 : 1000}${i + 1}${s.length}`,
    title: `${s.charAt(0).toUpperCase()}${s.slice(1)} moodboard`,
    description: `Simulated ${source === "partner" ? "Pinterest" : "own"} pin about ${s}.`,
    imageUrl: `/showcase/samples/${s}.jpg`,
    link: pinPage(`${source === "partner" ? 9000 : 1000}${i + 1}${s.length}`),
    author: owned ? "your-studio" : "pinterest-creator",
    authorUrl: owned ? "https://www.pinterest.com/your-studio/" : "https://www.pinterest.com/pinterest-creator/",
    owned,
    source,
  }));
}

const simulator: PinterestProvider = {
  name: "simulator",
  authUrl({ state, redirectUri }) {
    return `${redirectUri}?code=sim-pinterest-code&state=${encodeURIComponent(state)}`;
  },
  async exchangeCode() {
    return { accessToken: "sim-pinterest-access", accessExpiresAt: new Date(Date.now() + 30 * 86_400_000), refreshToken: "sim-pinterest-refresh", refreshExpiresAt: new Date(Date.now() + 365 * 86_400_000), scopes: PINTEREST_SCOPES };
  },
  async refresh() {
    return simulator.exchangeCode({ code: "", redirectUri: "" });
  },
  async me() {
    return { id: "sim-pinterest-user", username: "your-studio", name: "Your studio (simulated)" };
  },
  async searchOwn({ query }) {
    return { pins: samplePins(query, "own", true), bookmark: null };
  },
  async boards() {
    return [
      { id: "1001", name: "Launch ideas", pinCount: 4, cover: "/showcase/samples/sneakers.jpg" },
      { id: "1002", name: "Food & drink", pinCount: 2, cover: "/showcase/samples/coffee.jpg" },
    ];
  },
  async boardPins({ boardId }) {
    const pins = samplePins(boardId === "1002" ? "" : "", "board", true);
    return { pins: boardId === "1002" ? pins.filter((p) => /burger|coffee/i.test(p.title)) : pins.slice(0, 4), bookmark: null };
  },
  async partnerSearch({ query }) {
    return { pins: samplePins(query, "partner", false), bookmark: null };
  },
  async getPin({ pinId }) {
    const own = samplePins("", "own", true).find((p) => p.id === pinId);
    return own ?? null;
  },
};

/** The client in force. Refuses the simulator in production; "off" means sign-in features are hidden. */
export function pinterest(): PinterestProvider {
  const name = providerName("PINTEREST");
  if (name === "off") throw new ApiError(503, "PROVIDER_OFF", "Pinterest sign-in is switched off. Paste a pin link instead.");
  return name === "live" ? live() : simulator;
}

/** What the picker may offer: account features, partner search, or links only. */
export function pinterestFeatures() {
  const mode = configuredProviderName("PINTEREST");
  return { account: mode !== "off", partnerSearch: mode !== "off" && env().PINTEREST_PARTNER_SEARCH === "on", simulated: mode === "simulator" };
}

// ── pasted links (no sign-in) ────────────────────────────────────────────

/**
 * A public pin from its link, through Pinterest's oEmbed endpoint. A pin.it
 * short link is followed one hop, and only to a Pinterest pin page.
 */
export async function pinFromLink(input: string): Promise<PinResult> {
  let parsed = parsePinUrl(input);
  if (!parsed) throw new ApiError(422, "VALIDATION_FAILED", "Paste the link of a single Pinterest pin, e.g. https://www.pinterest.com/pin/123456789/.");
  if (configuredProviderName("PINTEREST") === "simulator") {
    const id = parsed.kind === "pin" ? parsed.id : "77001";
    return { ...samplePins("", "link", false)[Number(id.slice(-1)) % SAMPLE.length]!, id, link: pinPage(id), source: "link" };
  }
  if (parsed.kind === "short") {
    let res: Response;
    try {
      res = await fetch(parsed.url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new ApiError(502, "PINTEREST_UNREACHABLE", "Could not open that pin.it link.");
    }
    const next = res.headers.get("location");
    parsed = next ? parsePinUrl(next) : null;
    if (!parsed || parsed.kind !== "pin") throw new ApiError(422, "VALIDATION_FAILED", "That pin.it link does not lead to a pin.");
  }
  let res: Response;
  try {
    res = await fetch(`https://www.pinterest.com/oembed.json?url=${encodeURIComponent(parsed.url)}`, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } });
  } catch {
    throw new ApiError(502, "PINTEREST_UNREACHABLE", "Pinterest did not answer. Try again in a moment.");
  }
  const b = (await res.json().catch(() => null)) as { title?: string; author_name?: string; author_url?: string; thumbnail_url?: string } | null;
  if (!res.ok || !b?.thumbnail_url) throw new ApiError(404, "PIN_NOT_FOUND", "That pin could not be found, or it is not public.");
  return {
    id: parsed.id,
    title: b.title?.trim() || "Pinterest pin",
    description: null,
    imageUrl: largerPinImage(b.thumbnail_url),
    link: parsed.url,
    author: b.author_name ?? null,
    authorUrl: b.author_url ?? null,
    owned: false,
    source: "link",
  };
}
