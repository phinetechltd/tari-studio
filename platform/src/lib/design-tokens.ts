/**
 * Single source for colour. `tailwind.config.ts` reads the keys; `globals.css`
 * declares the matching `--c-<key>` variables (a unit test fails if the two
 * drift). Values are "r g b" triplets so Tailwind's opacity modifiers work.
 *
 * The product is dark: a near-black canvas with a black navigation rail, raised
 * charcoal cards and one accent, the cyan end of the logo's blue bar, so generated images and videos are the
 * brightest thing on screen. The light set is kept (and contrast-tested) for
 * any surface that must print or be read in daylight.
 */

export const TOKENS = {
  light: {
    bg: "255 255 255",
    surface: "246 247 248",
    raised: "255 255 255",
    line: "224 227 231",
    ink: "17 19 22",
    muted: "96 104 114",
    primary: "14 116 144",
    onprimary: "255 255 255",
    success: "21 128 61",
    warning: "180 83 9",
    danger: "185 28 28",
    info: "3 105 161",
    wash: "17 19 22",
  },
  dark: {
    bg: "0 0 0",
    surface: "7 7 7",
    raised: "22 22 22",
    line: "38 38 38",
    ink: "232 232 232",
    muted: "148 148 148",
    primary: "0 198 255",
    onprimary: "0 0 0",
    success: "93 243 215",
    warning: "255 159 81",
    danger: "255 110 110",
    info: "125 180 255",
    wash: "255 255 255",
  },
  /** The African theme the whole app wears (class .theme-afro on <html>): umber night. */
  afroDark: {
    bg: "15 8 5",
    surface: "21 12 8",
    raised: "35 21 14",
    line: "78 52 35",
    ink: "248 236 218",
    muted: "196 172 146",
    primary: "245 166 35",
    onprimary: "30 12 4",
    success: "126 217 140",
    warning: "255 138 61",
    danger: "255 107 90",
    info: "143 190 255",
    wash: "255 255 255",
  },
  /** Its daylight twin (.theme-afro-light): sand and cream with deepened gold. */
  afroLight: {
    bg: "253 247 237",
    surface: "248 239 224",
    raised: "255 252 246",
    line: "226 208 180",
    ink: "42 24 14",
    muted: "110 86 66",
    primary: "160 88 0",
    onprimary: "255 255 255",
    success: "21 110 60",
    warning: "150 68 6",
    danger: "185 28 28",
    info: "3 98 150",
    wash: "60 30 10",
  },
} as const;

export type TokenKey = keyof typeof TOKENS.light;

/** WCAG relative luminance of an "r g b" triplet. */
export function luminance(triplet: string): number {
  const [r, g, b] = triplet.split(" ").map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
