// Fails on text that has been through the wrong encoding, or that hides something.
//
//  - invalid UTF-8, a BOM, the replacement character (a character was lost);
//  - mojibake: what UTF-8 text becomes when re-read as Windows-1252 (a document
//    pasted in and edited on Windows is exactly how these creep in);
//  - invisible characters in source: stray control characters, zero-width
//    characters and bidirectional overrides. None belongs in code, and the
//    bidi ones can make code read differently from how it runs.
//
// This file deliberately contains no backslash-u escapes and no literal
// look-alikes: every special character is built from a numeric code point, so
// the file cannot trip its own rules or be mangled by an editor or tool.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".next", ".pg", "uploads", "migrations"]);
const decoder = new TextDecoder("utf-8", { fatal: true });
const cc = (n) => String.fromCharCode(n);

// Mojibake signatures, as code points:
//   U+00E2 U+20AC              a lead byte plus a Windows-1252 euro sign
//   U+00C3 then U+0080..U+00BF a Latin-1 lead byte then a continuation byte
//   U+00C2 then U+00A0..U+00BF the same for two-byte sequences
const MOJIBAKE = new RegExp(
  `${cc(0xe2)}${cc(0x20ac)}|${cc(0xc3)}[${cc(0x80)}-${cc(0xbf)}]|${cc(0xc2)}[${cc(0xa0)}-${cc(0xbf)}]`,
);

// [from, to] inclusive code point ranges that must not appear in source.
const FORBIDDEN = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f], // DEL and the C1 controls
  [0x200b, 0x200f], // zero-width space/joiners and directional marks
  [0x202a, 0x202e], // bidi embeddings and overrides
  [0x0300, 0x036f], // combining marks: invisible in a diff and easy to leave behind
  [0x2060, 0x2064], // word joiner and invisible operators
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
  [0xfffd, 0xfffd], // replacement character
];

const isForbidden = (code) => FORBIDDEN.some(([a, b]) => code >= a && code <= b);
const hex = (code) => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css|mjs|json|prisma|md)$/.test(entry.name) && entry.name !== "package-lock.json") out.push(full);
  }
  return out;
}

const problems = [];
let checked = 0;

for (const dir of ["src", "scripts", "prisma"]) {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) continue;
  for (const file of walk(base)) {
    checked++;
    const rel = path.relative(root, file).replaceAll("\\", "/");
    const buf = fs.readFileSync(file);

    let text;
    try {
      text = decoder.decode(buf);
    } catch {
      problems.push(`${rel}: not valid UTF-8`);
      continue;
    }

    const found = new Map();
    let line = 1;
    for (const ch of text) {
      const code = ch.codePointAt(0);
      if (ch === "\n") line++;
      else if (isForbidden(code) && !found.has(code)) found.set(code, line);
    }
    for (const [code, ln] of found) problems.push(`${rel}:${ln}: contains ${hex(code)}, which does not belong in source`);

    if (MOJIBAKE.test(text)) problems.push(`${rel}: contains mojibake (UTF-8 text re-read as Windows-1252)`);
  }
}

if (problems.length > 0) {
  console.error(`✖ encoding check failed:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`✔ encoding check: ${checked} files are clean UTF-8 with no hidden characters`);
