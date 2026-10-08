import "server-only";

import { z } from "zod";

/** Environment, validated once and read through this module.
 *
 * Evaluated lazily: Next imports server modules while building, when secrets
 * are legitimately absent, so a parse at import time would break `next build`.
 */

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(24, "AUTH_SECRET must be at least 24 characters"),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(720),
  APP_BASE_URL: z.string().url().default("http://localhost:3400"),
  EMAIL_PROVIDER: z.enum(["console", "smtp"]).default("console"),
  /** SMTP relay for EMAIL_PROVIDER=smtp (any provider: Google Workspace, Zoho, Mailgun, SES, Brevo…) */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  /** "true" for implicit TLS (port 465); otherwise STARTTLS is used when the server offers it */
  SMTP_SECURE: z
    .string()
    .transform((v) => v === "1" || v.toLowerCase() === "true")
    .default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** The From address, e.g. hello@tari.studio (must be allowed by the SMTP account) */
  EMAIL_FROM: z.string().email().optional(),
  /** The From name; defaults to the product name */
  EMAIL_FROM_NAME: z.string().optional(),
  EMAIL_REPLY_TO: z.string().email().optional(),
  /** SMS notifications. "console" logs them (development; production refuses it), "off" sends none. */
  SMS_PROVIDER: z.enum(["console", "bonga", "off"]).default("console"),
  BONGA_SMS_CLIENT_ID: z.string().optional(),
  BONGA_SMS_API_KEY: z.string().optional(),
  BONGA_SMS_API_SECRET: z.string().optional(),
  BONGA_SMS_SERVICE_ID: z.string().optional(),
  BONGA_SMS_ENDPOINT: z.string().url().default("http://167.172.14.50:4002/v1/send-sms"),
  /** At most this many SMS a day (East Africa time), across the platform; a runaway loop cannot drain the Bonga balance */
  SMS_DAILY_CAP: z.coerce.number().int().min(0).default(300),
  META_PROVIDER: z.enum(["simulator", "graph"]).default("simulator"),
  AI_PROVIDER: z.enum(["fixtures", "anthropic", "nvidia"]).default("fixtures"),
  /** Comma-separated fallback chain, e.g. "nvidia:nemotron-3-ultra,nvidia:nemotron-3-nano,fixtures:default".
   *  Each entry is either "provider" or "provider:model".  The first entry is the primary.
   *  When empty or unset, the chain is derived from AI_PROVIDER (backwards compatible —
   *  single-provider behaviour is the degenerate case of a one-entry chain). */
  AI_FALLBACK_CHAIN: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),
  /** Anthropic model for captions, briefs and WhatsApp replies (default claude-sonnet-5). */
  AI_MODEL: z.string().optional(),
  /** Model for quick, simple tasks: one-line copy, classification (default claude-haiku-4-5). */
  AI_CHEAP_MODEL: z.string().optional(),
  /** Seconds to wait before treating a provider as timed out and trying the next. */
  AI_TIMEOUT_SEC: z.coerce.number().int().positive().default(45),
  /** Meta app (Facebook Login, Pages, Instagram, WhatsApp Cloud API). Required when META_PROVIDER=graph. */
  META_APP_ID: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Set to "false" to hide the Google button without removing the keys */
  GOOGLE_AUTH_ENABLED: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  /** Graph API version, e.g. v23.0. Update when Meta retires the one in use. */
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v23.0"),
  /** The string Meta echoes when you register the webhook URL; any long random value you choose. */
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  /** M-Pesa STK push. "simulator" pretends, for development; production refuses it. */
  PAYMENT_PROVIDER: z.enum(["simulator", "daraja"]).default("simulator"),
  MPESA_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  /** CustomerPayBillOnline (Paybill) or CustomerBuyGoodsOnline (Till) */
  MPESA_TRANSACTION_TYPE: z
    .enum(["CustomerPayBillOnline", "CustomerBuyGoodsOnline"])
    .default("CustomerPayBillOnline"),
  /** The till number for Buy Goods; defaults to the shortcode for Paybill */
  MPESA_PARTY_B: z.string().optional(),
  /**
   * Paystack checkout (cards, M-Pesa and Apple Pay through Paystack) and card
   * renewals for plans. "simulator" pretends, for development; production
   * refuses it. "off" hides Paystack and leaves M-Pesa STK as the only method.
   */
  PAYSTACK_PROVIDER: z.enum(["simulator", "paystack", "off"]).default("simulator"),
  /** sk_live_… or sk_test_…; also the key that signs Paystack's webhooks */
  PAYSTACK_SECRET_KEY: z.string().optional(),
  /** pk_live_… / pk_test_… — Paystack's public key, for card fields embedded in our pages */
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  /** Image and video generation. "simulator" returns sample media; production refuses it. */
  /**
   * TikTok: Login Kit + Content Posting API (developers.tiktok.com) for posting,
   * and optionally the TikTok API for Business (business-api.tiktok.com) for
   * reading and answering comments. "simulator" pretends (production refuses it).
   */
  TIKTOK_PROVIDER: z.enum(["simulator", "live", "off"]).default("simulator"),
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  TIKTOK_BUSINESS_APP_ID: z.string().optional(),
  TIKTOK_BUSINESS_SECRET: z.string().optional(),
  /** Pinterest API v5: an organisation's own pins and boards as template sources. */
  PINTEREST_PROVIDER: z.enum(["simulator", "live", "off"]).default("simulator"),
  PINTEREST_APP_ID: z.string().optional(),
  PINTEREST_APP_SECRET: z.string().optional(),
  /** "on" once Pinterest grants the app partner search (searching all of Pinterest, not just your own pins) */
  PINTEREST_PARTNER_SEARCH: z.enum(["on", "off"]).default("off"),
  /** Google Search Console "HTML tag" verification code (the content="…" value only) */
  GOOGLE_SITE_VERIFICATION: z.string().max(200).optional(),
  /** Bing Webmaster Tools verification code (msvalidate.01) */
  BING_SITE_VERIFICATION: z.string().max(200).optional(),
  /** The product's official social profiles, comma-separated URLs (search engines link them to the site) */
  SEO_SOCIAL_PROFILES: z.string().max(2000).optional(),
  GENERATION_PROVIDER: z.enum(["simulator", "higgsfield"]).default("simulator"),
  /** Higgsfield API credentials, "KEY_ID:KEY_SECRET" */
  HF_CREDENTIALS: z.string().optional(),
  /** Where downloaded generations are kept, relative to the app directory */
  STORAGE_DIR: z.string().default("storage"),
  /** The organisation that owns public orders from the landing page (the operator's own agency) */
  ORDERS_ORGANIZATION_SLUG: z.string().default("demo-agency"),
  /** The organisation whose published posts appear on the public blog; defaults to the orders organisation */
  BLOG_ORGANIZATION_SLUG: z.string().optional(),
  REQUIRE_TOTP: z
    .string()
    .transform((v) => v !== "0" && v !== "false" && v !== "")
    .default("true"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/**
 * Values a platform admin set in the console (src/lib/platform-config.ts). They
 * win over process.env, so every reader of env() honours the dashboard without
 * knowing it exists.
 */
let overrides: Record<string, string> = {};

export function setEnvOverrides(next: Record<string, string>): void {
  const same =
    Object.keys(next).length === Object.keys(overrides).length && Object.entries(next).every(([k, v]) => overrides[k] === v);
  if (same) return;
  overrides = { ...next };
  cached = null;
}

/** The problems a candidate set of overrides would cause, without applying it. */
export function validateEnvOverrides(candidate: Record<string, string>): string[] {
  const parsed = schema.safeParse({ ...process.env, ...candidate });
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment — ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test seam: forget the cached parse after a test changes `process.env`. */
export function resetEnvCache(): void {
  cached = null;
}

export const isProduction = (): boolean => process.env.NODE_ENV === "production";
