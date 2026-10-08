/**
 * Pure Pinterest helpers: reading pin links people paste, which image hosts we
 * download from, and the shape a pin takes in our app. The API client is
 * src/server/pinterest.ts.
 */

export type PinSource = "own" | "board" | "partner" | "link";

/** A pin as the picker shows it. `owned` is true only for the organisation's own connected account. */
export interface PinResult {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string;
  /** The pin's page on Pinterest (the credit link) */
  link: string;
  author: string | null;
  authorUrl: string | null;
  owned: boolean;
  source: PinSource;
}

const PIN_HOSTS = /^(?:[a-z]{2,3}\.)?pinterest\.(?:com|co\.uk|ca|com\.au|de|fr|es|it|pt|ie|nz|ch|at|se|dk|no|fi|jp|kr|ph|cl|com\.mx|co\.kr|ru)$/i;

/**
 * A pasted Pinterest link: a full pin URL, or a pin.it short link that has to
 * be followed. Anything else (a board, a profile, another site) is refused.
 */
export function parsePinUrl(input: string): { kind: "pin"; id: string; url: string } | { kind: "short"; url: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\./i, "");
  if (host.toLowerCase() === "pin.it" && /^\/[A-Za-z0-9]{4,16}\/?$/.test(url.pathname)) return { kind: "short", url: `https://pin.it${url.pathname.replace(/\/$/, "")}` };
  if (!PIN_HOSTS.test(host)) return null;
  const m = /^\/pin\/(?:[^/]*--)?(\d{5,25})\/?/.exec(url.pathname);
  return m ? { kind: "pin", id: m[1]!, url: `https://www.pinterest.com/pin/${m[1]}/` } : null;
}

/** We only ever download pin images from Pinterest's image CDN. */
export function isPinterestImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "i.pinimg.com";
  } catch {
    return false;
  }
}

/** Pinterest's oEmbed gives a small thumbnail (236x); the same image exists at 736x. */
export function largerPinImage(raw: string): string {
  return isPinterestImageUrl(raw) ? raw.replace(/\/(?:\d{2,4}x(?:\d{2,4})?|originals)\//, "/736x/") : raw;
}

/** The text a pin adds to a template: its title and description, trimmed. */
export function pinPromptHint(pins: Array<Pick<PinResult, "title" | "description">>): string | null {
  const bits = pins
    .flatMap((p) => [p.title, p.description])
    .map((s) => (s ?? "").replace(/\s+/g, " ").trim())
    .filter((s, i, all) => s.length > 2 && all.indexOf(s) === i);
  if (bits.length === 0) return null;
  return `In the style of these references: ${bits.join("; ")}`.slice(0, 600);
}
