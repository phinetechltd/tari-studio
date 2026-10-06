/**
 * The public origin of the incoming request, for absolute redirects made in
 * middleware. Next 15.5 no longer trusts the Host header when it computes
 * `request.url`, so behind a reverse proxy a redirect built from that URL
 * points users at the server's internal address (localhost:3400) — they can
 * never reach it. We rebuild the origin from the proxy's forwarded headers and
 * validate it so a forged Host cannot bounce users to another site.
 */

const JSON_LIST_SPLIT = ",";
/** Letters, digits, dots, dashes and an optional port — nothing else. */
const SAFE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

export function requestOrigin(headers: Headers, fallback: string): string {
  const first = (v: string | null) => v?.split(JSON_LIST_SPLIT)[0].trim() ?? "";
  const host = first(headers.get("x-forwarded-host")) || first(headers.get("host"));
  if (!SAFE_HOST.test(host)) return fallback;
  const proto = first(headers.get("x-forwarded-proto")).toLowerCase() === "https" ? "https" : "http";
  return `${proto}://${host}`;
}
