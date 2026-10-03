// Runtime link crawl: signs in as each seeded role, follows every same-site link
// the rendered pages contain, and reports anything that is not a working page
// (4xx/5xx, Next's 404 page, an error boundary) and any missing image or video.
//
//   npm run crawl                         against http://localhost:3400
//   node scripts/crawl.mjs http://localhost:3410
//
// It only issues GETs (and the sign-in POST), never follows sign-out, and stays
// on the start origin. The default accounts are the seed's demo users
// (prisma/seed.ts); set CRAWL_ACCOUNTS="email,email" and CRAWL_PASSWORD to use
// others. It refuses a non-local server unless CRAWL_ALLOW_REMOTE=1.

const base = new URL(process.argv[2] ?? process.env.CRAWL_BASE_URL ?? "http://localhost:3400");
const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || base.hostname.endsWith(".localhost");
if (!local && process.env.CRAWL_ALLOW_REMOTE !== "1") {
  console.error(`Refusing to crawl ${base.origin}: not a local server. Set CRAWL_ALLOW_REMOTE=1 if you mean it.`);
  process.exit(2);
}

const password = process.env.CRAWL_PASSWORD ?? process.env.SEED_PASSWORD ?? "Demo@2026-Agency";
const accounts = (process.env.CRAWL_ACCOUNTS ?? "owner@demo.test,marketer@demo.test,designer@demo.test,platform-admin@demo.test").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_PAGES = Number(process.env.CRAWL_MAX_PAGES ?? 400);
const SKIP = [/^\/api\//, /^\/_next\//, /logout/i, /\/download\b/, /[?&]download=1/];
const STATIC = /\.(png|jpe?g|webp|gif|svg|ico|mp4|webm|mov|pdf|woff2?|css|js)$/i;

const problems = [];
const problem = (p) => {
  problems.push(p);
  console.error(`  ✖ [${p.who}] ${p.url}  ← ${p.from}: ${p.what}`);
};
const assetsChecked = new Map();

async function get(url, cookie, method = "GET") {
  const started = Date.now();
  try {
    const res = await fetch(url, { method, redirect: "manual", headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(Number(process.env.CRAWL_TIMEOUT_MS ?? 240_000)) });
    return { res, ms: Date.now() - started };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
  }
}

function linksIn(html) {
  const out = new Set();
  const re = /\b(?:href|src|poster)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].replace(/&amp;/g, "&");
    if (!raw.startsWith("/") || raw.startsWith("//")) continue;
    out.add(raw.split("#")[0] || "/");
  }
  return out;
}

// Next answers a missing page with HTTP 404 (caught above). Its not-found and
// error templates also ride along in every page's payload, so only the markers
// of a page that actually rendered as an error count here.
function errorPage(html) {
  if (/<html[^>]*id="__next_error__"/i.test(html)) return "an error page";
  if (/<title>\s*(404|500)\b/i.test(html)) return "an error page";
  return null;
}

async function checkAsset(path, cookie, from) {
  if (assetsChecked.has(path)) return;
  assetsChecked.set(path, true);
  const { res, error } = await get(new URL(path, base), cookie, "HEAD");
  const status = res?.status ?? 0;
  if (error || (status >= 400 && status !== 405)) problem({ who: "assets", url: path, from, what: error ?? `HTTP ${status}` });
}

async function crawl(who, cookie, starts) {
  const queue = [...starts.map((s) => ({ url: s, from: "(start)" }))];
  const seen = new Set();
  const perPath = new Map();
  let pages = 0;
  let slowest = { url: "", ms: 0 };

  while (queue.length && pages < MAX_PAGES) {
    const { url, from } = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const pathOnly = url.split("?")[0];
    // At most three query-string variants of one page (filters, pagination).
    const variants = (perPath.get(pathOnly) ?? 0) + 1;
    perPath.set(pathOnly, variants);
    if (variants > 3) continue;
    if (SKIP.some((re) => re.test(url))) continue;
    if (STATIC.test(pathOnly)) {
      await checkAsset(url, cookie, from);
      continue;
    }

    const { res, error, ms } = await get(new URL(url, base), cookie);
    pages += 1;
    if (pages % 25 === 0) console.log(`  … ${who}: ${pages} pages, ${queue.length} queued`);
    if (ms > slowest.ms) slowest = { url, ms };
    if (error) {
      problem({ who, url, from, what: error });
      continue;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        const next = new URL(loc, base);
        if (next.origin === base.origin) queue.unshift({ url: next.pathname + next.search, from: url });
      }
      continue;
    }
    if (res.status >= 400) {
      problem({ who, url, from, what: `HTTP ${res.status}` });
      continue;
    }
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) continue;
    const html = await res.text();
    const bad = errorPage(html);
    if (bad) {
      problem({ who, url, from, what: bad });
      continue;
    }
    for (const link of linksIn(html)) if (!seen.has(link)) queue.push({ url: link, from: url });
  }
  return { pages, slowest };
}

async function signIn(email) {
  const { res, error } = await (async () => {
    try {
      return {
        res: await fetch(new URL("/api/auth/login", base), {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: base.origin },
          body: JSON.stringify({ email, password }),
        }),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  })();
  if (error) throw new Error(`cannot reach ${base.origin}: ${error}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(`${email}: ${body?.error?.message ?? `HTTP ${res.status}`}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { cookie, next: body.data.next };
}

const report = [];
const anon = await crawl("public", null, ["/", "/pricing", "/login"]);
report.push(["public", anon]);
for (const email of accounts) {
  try {
    const { cookie, next } = await signIn(email);
    report.push([email, await crawl(email, cookie, [next, "/notifications", "/account"])]);
  } catch (error) {
    problem({ who: email, url: "/api/auth/login", from: "(sign-in)", what: error.message });
  }
}

for (const [who, r] of report) console.log(`  ${who.padEnd(28)} ${String(r.pages).padStart(4)} pages · slowest ${r.slowest.url} (${r.slowest.ms} ms)`);
console.log(`  ${"images, video, files".padEnd(28)} ${String(assetsChecked.size).padStart(4)} checked`);
if (problems.length) {
  console.error(`\n✖ crawl: ${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
  for (const p of problems) console.error(`  [${p.who}] ${p.url}  ← ${p.from}: ${p.what}`);
  process.exit(1);
}
console.log(`\n✔ crawl: every page reached from ${report.length} sign-ins rendered, and every linked file exists`);
