import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { TOKENS, contrastRatio } from "./design-tokens";

const css = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

describe("design tokens", () => {
  it("every theme defines the same keys", () => {
    for (const set of [TOKENS.dark, TOKENS.afroDark, TOKENS.afroLight]) {
      assert.deepEqual(Object.keys(TOKENS.light).sort(), Object.keys(set).sort());
    }
  });

  it("globals.css declares every token, in both themes, with the same value", () => {
    const block = (selector: RegExp) => {
      const m = css.match(selector);
      assert.ok(m, `missing ${selector}`);
      return m[1]!;
    };
    const blocks = {
      light: block(/:root\s*\{([^}]*)\}/),
      dark: block(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/),
      // The automatic dark theme is a hand-kept copy of the pinned one.
      "auto-dark": block(
        /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/,
      ),
      // Public pages pin the light theme (.theme-light); it must stay a copy of it.
      "pinned-light": block(/\.theme-light\s*\{([^}]*)\}/),
      // The African theme the app wears, in both modes.
      "afro-dark": block(/\.theme-afro\s*\{([^}]*)\}/),
      "afro-light": block(/\.theme-afro-light\s*\{([^}]*)\}/),
    } as const;
    const tokensFor = {
      light: TOKENS.light,
      dark: TOKENS.dark,
      "auto-dark": TOKENS.dark,
      "pinned-light": TOKENS.light,
      "afro-dark": TOKENS.afroDark,
      "afro-light": TOKENS.afroLight,
    } as const;

    for (const theme of ["light", "dark", "auto-dark", "pinned-light", "afro-dark", "afro-light"] as const) {
      for (const [key, value] of Object.entries(tokensFor[theme])) {
        const re = new RegExp(`--c-${key}:\\s*([^;]+);`);
        const found = blocks[theme].match(re);
        assert.ok(found, `--c-${key} missing from ${theme} theme in globals.css`);
        assert.equal(found[1]!.trim(), value, `--c-${key} differs from design-tokens.ts (${theme})`);
      }
    }
  });

  it("text pairs meet WCAG AA (4.5:1) in every theme", () => {
    const pairs: Array<[keyof typeof TOKENS.light, keyof typeof TOKENS.light]> = [
      ["ink", "bg"],
      ["ink", "surface"],
      ["muted", "bg"],
      ["muted", "surface"],
      ["onprimary", "primary"],
      ["primary", "bg"],
      ["danger", "bg"],
      ["success", "bg"],
      ["warning", "bg"],
      ["info", "bg"],
    ];
    for (const theme of ["light", "dark", "afroDark", "afroLight"] as const) {
      for (const [fg, bg] of pairs) {
        const ratio = contrastRatio(TOKENS[theme][fg], TOKENS[theme][bg]);
        assert.ok(ratio >= 4.5, `${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
      }
    }
  });
});
