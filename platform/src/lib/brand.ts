/**
 * The product's name lives here and nowhere else.
 *
 * Named Tari Studio by the owner on 2 Oct 2026. The rename from XOS to Raut
 * showed what happens when a name is scattered through strings, seeds and
 * email templates: some copies always survive. Everything user-facing imports
 * from this file, and `scripts/check-brand.mjs` fails the build if the name
 * appears as a literal anywhere else in `src/`.
 *
 * Tenant brands (an agency's client brands) are a different thing entirely and
 * live in the database.
 */

export const PRODUCT_NAME: string = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? "Tari Studio";

export const PRODUCT_TAGLINE =
  "AI images and video ads for African brands: make them, publish them, and see what they sell.";

/** Where system email appears to come from, before a domain exists. */
export const PRODUCT_EMAIL_FROM_NAME: string = PRODUCT_NAME;

/**
 * Logo files, cut from the owner's artwork by colour-to-alpha (public/brand/).
 * The supplied lock-up has a navy wordmark for light backgrounds; the `*Dark`
 * files carry a white wordmark for the dark console and landing page.
 */
export const PRODUCT_LOGO = {
  /** The T-and-play mark alone, square, transparent */
  mark: "/brand/tari-mark.png",
  /** Mark beside the wordmark, for navigation bars on dark backgrounds */
  horizontalDark: { src: "/brand/tari-studio-horizontal-dark.png", width: 1183, height: 322 },
  /** Mark beside the wordmark, navy, for light backgrounds */
  horizontal: { src: "/brand/tari-studio-horizontal.png", width: 1183, height: 322 },
  /** Stacked lock-up, white wordmark */
  stackedDark: { src: "/brand/tari-studio-logo-dark.png", width: 766, height: 889 },
  /** Gold, red and green recolour of the mark with a cream wordmark, for the African-themed public pages */
  afroMark: "/brand/tari-afro-mark.png",
  afroHorizontal: { src: "/brand/tari-afro-horizontal.png", width: 1183, height: 322 },
  afroHorizontalLight: { src: "/brand/tari-afro-horizontal-light.png", width: 1183, height: 322 },
  afroStackedLight: { src: "/brand/tari-afro-stacked-light.png", width: 766, height: 889 },
  afroStacked: { src: "/brand/tari-afro-stacked.png", width: 766, height: 889 },
  /** Stacked lock-up as supplied, navy wordmark */
  stacked: { src: "/brand/tari-studio-logo.png", width: 766, height: 889 },
} as const;

/** The company that operates the platform (shown in the footer and the legal pages). */
export const OPERATOR_NAME = "PhineTech Ltd";
export const OPERATOR_URL = "https://phinetech.co.ke/";
/** Where people write for help and data requests. */
export const SUPPORT_EMAIL = "phinetechltd@gmail.com";
