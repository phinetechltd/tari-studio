// Static link check: every internal link, redirect and API call in the source
// must land on a page, route handler or public file that exists.
//
// It reads string and template literals in the places links live: href=,
// { href: "…" }, router.push/replace, redirect(), Link, callApi()/fetch("/api/…").
// Template placeholders (${id}) stand for one path segment, so
// `/app/orders/${order.id}` is checked against app/(console)/app/orders/[id].
// External URLs, mailto:/tel: and same-page #anchors are skipped. Query strings
// and fragments are ignored.
//
//   node scripts/check-links.mjs        exit 1 and a file:line list when a link is broken

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "src", "app");
const publicDir = path.join(root, "public");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".next")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ── the route tree ───────────────────────────────────────────────────────
const routes = [];
for (const file of walk(appDir)) {
  const base = path.basename(file);
  const kind = /^page\.(tsx|ts|jsx|js|mdx)$/.test(base) ? "page" : /^route\.(ts|js)$/.test(base) ? "route" : null;
  if (!kind) continue;
  const segments = path
    .relative(appDir, path.dirname(file))
    .split(path.sep)
    .filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
  const pattern = segments
    .map((s) => {
      if (/^\[\[\.\.\..+\]\]$/.test(s)) return "(?:/.*)?";
      if (/^\[\.\.\..+\]$/.test(s)) return "/.+";
      if (/^\[.+\]$/.test(s)) return "/[^/]+";
      return "/" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  const segs = segments.map((s) => (/^\[\[\.\.\..+\]\]$/.test(s) ? "**?" : /^\[\.\.\..+\]$/.test(s) ? "**" : /^\[.+\]$/.test(s) ? "*" : s));
  routes.push({ kind, path: "/" + segments.join("/"), re: new RegExp(`^${pattern || ""}/?$`), segs });
}
// Files Next serves itself.
const special = new Set(["/icon.png", "/apple-icon.png", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/opengraph-image.png"]);

const publicFiles = new Set(walk(publicDir).map((f) => "/" + path.relative(publicDir, f).split(path.sep).join("/")));

/** A link segment from a template placeholder (${id}, ${kind}) can be any single segment, static or dynamic. */
const ANY = "__any__";

function unify(routeSegs, linkSegs) {
  for (let i = 0; i < routeSegs.length; i++) {
    const r = routeSegs[i];
    if (r === "**") return linkSegs.length > i;
    if (r === "**?") return true;
    const l = linkSegs[i];
    if (l === undefined) return false;
    if (r !== "*" && l !== ANY && r !== l) return false;
  }
  return routeSegs.length === linkSegs.length;
}

function resolves(url) {
  if (special.has(url) || publicFiles.has(url)) return true;
  if (!url.includes(ANY)) return routes.some((r) => r.re.test(url));
  const linkSegs = url.split("/").filter(Boolean);
  return routes.some((r) => unify(r.segs, linkSegs));
}

// ── the links ────────────────────────────────────────────────────────────
const SOURCES = walk(path.join(root, "src")).filter((f) => /\.(tsx?|jsx?)$/.test(f) && !/\.test\.tsx?$/.test(f));

// A literal: "…", '…' or `…` (template placeholders become one segment).
const LIT = String.raw`(?:"([^"\n]*)"|'([^'\n]*)'|` + "`([^`]*)`" + ")";
const PATTERNS = [
  new RegExp(String.raw`\bhref\s*=\s*\{?\s*` + LIT, "g"),
  new RegExp(String.raw`\bhref\s*:\s*` + LIT, "g"),
  new RegExp(String.raw`\b(?:router\.(?:push|replace|prefetch)|redirect|permanentRedirect)\(\s*` + LIT, "g"),
  new RegExp(String.raw`\b(?:callApi|fetch)\s*(?:<[^>]*>)?\(\s*` + LIT, "g"),
  new RegExp(String.raw`\baction\s*=\s*\{?\s*` + LIT, "g"),
];

const problems = [];
let checked = 0;

for (const file of SOURCES) {
  const text = fs.readFileSync(file, "utf8");
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      let raw = m[1] ?? m[2] ?? m[3];
      if (raw === undefined) continue;
      const isTemplate = m[3] !== undefined;
      // Only links that start as an internal path count; a template that starts with ${…} is fully dynamic.
      if (!raw.startsWith("/") || raw.startsWith("//")) continue;
      let url = raw;
      if (isTemplate) {
        // A nested template (`${a ? `?${b}` : ""}`) is cut at its start: what follows is a query string.
        url = url.replace(/\$\{[^{}`]*\}/g, "\u0001");
        if (url.includes("${")) url = url.slice(0, url.indexOf("${"));
      }
      url = url.split("#")[0].split("?")[0];
      // "/orgs/${id}" or "/orgs/${id}/x": one segment. "/orders${qs}": a query string. "/a/v-${n}": part of a segment.
      url = url.replace(/\u0001$/, (m, at) => (url[at - 1] === "/" ? ANY : "")).replace(/(^|\/)\u0001(?=\/|$)/g, `$1${ANY}`).replace(/\u0001/g, "x");
      if (url.length > 1 && url.endsWith("/")) url = url.slice(0, -1);
      if (!url) url = "/";
      checked += 1;
      if (!resolves(url)) {
        const line = text.slice(0, m.index).split("\n").length;
        problems.push(`${path.relative(root, file)}:${line}  ${raw}`);
      }
    }
  }
}

if (problems.length) {
  console.error(`✖ link check: ${problems.length} internal link${problems.length === 1 ? "" : "s"} point nowhere:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`✔ link check: ${checked} internal links, redirects and API calls all resolve (${routes.filter((r) => r.kind === "page").length} pages, ${routes.filter((r) => r.kind === "route").length} route handlers)`);
