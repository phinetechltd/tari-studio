// Fails when the product name — or another product's name — leaks into src/.
//
//  1. The placeholder name lives in src/lib/brand.ts only. A literal copy
//     anywhere else is a rename that will be missed.
//  2. Code was ported from another product. Its name, and the names of its
//     customers and integrations, must not appear in anything a user can see
//     (src/app) or in seed data (prisma/). Comments in src/lib and src/server
//     may credit where a pattern came from; screens and seeds may not.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css|mjs|prisma)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (f) => path.relative(root, f).replaceAll("\\", "/");
const problems = [];

// The product name (src/lib/brand.ts) and the placeholder it replaced.
const PLACEHOLDER = /Tari Studio|Agency Platform/;
const FOREIGN = /\b(Raut|XOS|IntelliCash|Zamar|Tari Africa|Digitax|eTIMS|Acacia Distributors)\b/;

for (const file of walk(path.join(root, "src"))) {
  const r = rel(file);
  const text = fs.readFileSync(file, "utf8");

  if (PLACEHOLDER.test(text) && r !== "src/lib/brand.ts" && !r.endsWith(".test.ts")) {
    problems.push(`${r}: hard-codes the placeholder product name (import PRODUCT_NAME from @/lib/brand)`);
  }
  if (r.startsWith("src/app/") && FOREIGN.test(text)) {
    problems.push(`${r}: a user-facing file mentions another product ("${text.match(FOREIGN)[0]}")`);
  }
}

const seed = path.join(root, "prisma", "seed.ts");
if (fs.existsSync(seed) && FOREIGN.test(fs.readFileSync(seed, "utf8"))) {
  problems.push("prisma/seed.ts: seed data mentions another product");
}

if (problems.length > 0) {
  console.error(`✖ brand check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("✔ brand check: the product name lives in one place; no foreign names in screens or seeds");
