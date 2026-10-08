// Static guard: nothing is reachable without saying who may reach it.
//
//  - Every API route handler must be wrapped in `handler({...})` and its options
//    must declare `permission`, `public: true` or `authOnly: true`. A route
//    exporting a bare `async function GET` is refused outright.
//  - `public: true` routes must be on the reviewed allow-list below, so a new
//    unauthenticated endpoint is a deliberate, visible decision.
//  - Every console page must call a session guard (requireSession / requireTenant
//    / requirePlatform / requirePermission) itself. A guard in a layout is not
//    enough: Next renders layouts and pages independently.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "src", "app");
const consoleDir = path.join(root, "src", "app", "(console)");

/** Routes (relative to src/app) intentionally reachable without a session. Add with care. */
const PUBLIC_ALLOWLIST = new Set([
  "api/auth/login",
  "api/auth/logout",
  "api/auth/accept-invite",
  // Self-service sign-up and recovery. Each is rate-limited per identity, answers the same whether or not the
  // address has an account, and works only with a single-use code or link (src/server/accounts.ts).
  "api/auth/register",
  "api/auth/verify",
  "api/auth/resend",
  "api/auth/forgot",
  "api/auth/reset",
  "api/auth/code",
  // Google sign-in: state, nonce and PKCE are checked on return (src/server/oauth-google.ts).
  "api/auth/google/start",
  "api/auth/google/callback",
  // TikTok sign-in (Login Kit): signed state + PKCE; a new identity only ever earns a
  // pending ticket — the account is created after a verified email (src/server/oauth-tiktok.ts).
  "api/auth/tiktok/start",
  "api/auth/tiktok/callback",
  "api/auth/tiktok/complete",
  "api/auth/invite",
  "api/health",
  // Public ordering from the landing page. Guarded by rate limits per phone,
  // a server-computed price, and an unguessable order token (src/server/orders.ts).
  "api/orders",
  "api/orders/quote",
  "api/orders/[token]",
  "api/orders/[token]/pay",
  "api/orders/[token]/assets/[assetId]",
  // Safaricom's STK callback: unsigned, so it only triggers a query (src/server/payments.ts).
  "api/payments/mpesa/callback",
  // Meta's WhatsApp webhook: every POST must carry a valid X-Hub-Signature-256.
  "api/webhooks/whatsapp",
  // Paystack's webhook: every POST must carry a valid x-paystack-signature, and
  // then only triggers a verify by reference (src/server/payments.ts).
  "api/webhooks/paystack",
  "api/webhooks/tiktok",
  "og",
  // The Paystack simulator's checkout: refused unless PAYSTACK_PROVIDER=simulator
  // outside production; it records a pretend outcome and triggers a verify.
  "api/payments/paystack/simulator",
  // Tracked campaign links: count a click and redirect; reveal nothing.
  "l/[code]",
  // Signed, expiring media links for Meta to fetch when publishing (src/server/media-links.ts).
  "media/[token]",
  // Generations a platform admin pinned to the landing page; nothing else is served.
  "showcase/[id]",
]);

function walk(dir, name, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, name, out);
    else if (entry.name === name) out.push(full);
  }
  return out;
}

const rel = (f) => path.relative(root, f).replaceAll("\\", "/");
const problems = [];
let routeCount = 0;
let pageCount = 0;

for (const file of walk(appDir, "route.ts")) {
  const text = fs.readFileSync(file, "utf8");
  const routePath = path.relative(appDir, path.dirname(file)).replaceAll("\\", "/");

  if (/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/.test(text)) {
    problems.push(`${rel(file)}: exports a bare HTTP function; wrap it in handler({...})`);
    continue;
  }

  const exported = [...text.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*handler/g)];
  if (exported.length === 0) problems.push(`${rel(file)}: exports no handler()-wrapped method`);

  // Options object: the first {...} after each `handler(` (options never nest braces).
  const calls = [...text.matchAll(/handler(?:<[^>]*>)?\(\s*\{([^}]*)\}/g)];
  if (calls.length < exported.length) {
    problems.push(`${rel(file)}: a handler() call has no inline options object`);
  }
  for (const call of calls) {
    routeCount++;
    const body = call[1];
    const isPublic = /public:\s*true/.test(body);
    const declared = isPublic || /permission:\s*"/.test(body) || /authOnly:\s*true/.test(body) || /account:\s*true/.test(body);
    if (!declared) problems.push(`${rel(file)}: handler options must declare permission, authOnly or public`);
    if (isPublic && !PUBLIC_ALLOWLIST.has(routePath)) {
      problems.push(`${rel(file)}: public route "${routePath}" is not on the reviewed allow-list in check-permissions.mjs`);
    }
    if (!isPublic && PUBLIC_ALLOWLIST.has(routePath) && !/authOnly|permission/.test(body)) {
      problems.push(`${rel(file)}: allow-listed public route lost its declaration`);
    }
  }
}

for (const file of walk(consoleDir, "page.tsx")) {
  pageCount++;
  const text = fs.readFileSync(file, "utf8");
  if (!/\brequire(Session|Tenant|Platform|Permission|Account)\s*\(/.test(text)) {
    problems.push(`${rel(file)}: console page does not call a session guard itself`);
  }
}

if (problems.length > 0) {
  console.error(`✖ permission check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`✔ permission check: ${routeCount} route handlers declare who may call them; ${pageCount} console pages guard themselves`);
