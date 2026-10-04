/**
 * What a platform admin may set from the console instead of the server's .env.
 *
 * Each entry is named after the environment variable it overrides, so every
 * existing reader (env()) honours it without change. Deliberately absent:
 * DATABASE_URL, AUTH_SECRET and CREDENTIALS_KEY (the dashboard's own secrets
 * are sealed with CREDENTIALS_KEY, so it cannot live in the dashboard),
 * APP_BASE_URL, and REQUIRE_TOTP (a dashboard must not be able to switch off
 * two-factor authentication).
 */

export type PlatformGroup = "ai" | "video" | "social" | "mpesa" | "paystack" | "email" | "sms" | "google";

export interface PlatformSettingSpec {
  key: string;
  label: string;
  group: PlatformGroup;
  /** Sealed at rest, write-only, shown as a masked hint. */
  secret: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  help?: string;
}

export const PLATFORM_GROUPS: Array<{ id: PlatformGroup; name: string; summary: string }> = [
  { id: "ai", name: "AI models", summary: "Claude (or NVIDIA) for the Studio chat, captions and WhatsApp replies." },
  { id: "video", name: "Image & video generation", summary: "Higgsfield renders the ads, reels and posters." },
  { id: "social", name: "Meta: Facebook, Instagram, WhatsApp", summary: "The Meta app behind Facebook Login, publishing and the WhatsApp webhook." },
  { id: "mpesa", name: "M-Pesa (Daraja)", summary: "STK push for orders, plans and credit top-ups." },
  { id: "paystack", name: "Paystack", summary: "Cards, M-Pesa and Apple Pay on Paystack's checkout, and card renewals for plans." },
  { id: "email", name: "Email (SMTP)", summary: "Invitations, receipts and notification emails, sent through your SMTP account." },
  { id: "google", name: "Google sign-in", summary: "Lets people sign in or sign up with their Google account. Create an OAuth client in Google Cloud and paste its id and secret here." },
  { id: "sms", name: "SMS (Bonga)", summary: "Urgent notifications by text: failed renewals, plans ending, empty wallets, AI credits." },
];

export const PLATFORM_SETTINGS: PlatformSettingSpec[] = [
  {
    key: "AI_PROVIDER",
    label: "Provider",
    group: "ai",
    secret: false,
    options: [
      { value: "anthropic", label: "Anthropic (Claude)" },
      { value: "nvidia", label: "NVIDIA NIM" },
      { value: "fixtures", label: "Fixtures (development only)" },
    ],
  },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API key", group: "ai", secret: true, placeholder: "sk-ant-api03-…", help: "From console.anthropic.com → API Keys." },
  { key: "AI_MODEL", label: "Claude model", group: "ai", secret: false, placeholder: "claude-sonnet-5" },
  { key: "AI_CHEAP_MODEL", label: "Quick-task model", group: "ai", secret: false, placeholder: "claude-haiku-4-5" },
  { key: "NVIDIA_API_KEY", label: "NVIDIA API key", group: "ai", secret: true, placeholder: "nvapi-…" },
  {
    key: "AI_FALLBACK_CHAIN",
    label: "Fallback order",
    group: "ai",
    secret: false,
    placeholder: "anthropic:claude-sonnet-5,nvidia:nvidia-nemotron-3-super",
    help: "Optional. Tried left to right when a provider times out.",
  },

  {
    key: "GENERATION_PROVIDER",
    label: "Mode",
    group: "video",
    secret: false,
    options: [
      { value: "higgsfield", label: "Live (Higgsfield)" },
      { value: "simulator", label: "Simulator (development only)" },
    ],
  },
  { key: "HF_CREDENTIALS", label: "Higgsfield credentials", group: "video", secret: true, placeholder: "KEY_ID:KEY_SECRET" },

  {
    key: "META_PROVIDER",
    label: "Mode",
    group: "social",
    secret: false,
    options: [
      { value: "graph", label: "Live (Graph API)" },
      { value: "simulator", label: "Simulator (development only)" },
    ],
  },
  { key: "META_APP_ID", label: "Meta app ID", group: "social", secret: false, placeholder: "1234567890123456" },
  { key: "META_APP_SECRET", label: "Meta app secret", group: "social", secret: true, help: "Also verifies every webhook signature." },
  { key: "META_WEBHOOK_VERIFY_TOKEN", label: "Webhook verify token", group: "social", secret: true, help: "Any long random string; paste the same into the Meta app." },
  { key: "META_GRAPH_VERSION", label: "Graph API version", group: "social", secret: false, placeholder: "v23.0" },

  {
    key: "PAYMENT_PROVIDER",
    label: "Mode",
    group: "mpesa",
    secret: false,
    options: [
      { value: "daraja", label: "Live (Daraja)" },
      { value: "simulator", label: "Simulator (development only)" },
    ],
  },
  {
    key: "MPESA_ENV",
    label: "Daraja environment",
    group: "mpesa",
    secret: false,
    options: [
      { value: "sandbox", label: "Sandbox" },
      { value: "production", label: "Production" },
    ],
  },
  { key: "MPESA_CONSUMER_KEY", label: "Consumer key", group: "mpesa", secret: true },
  { key: "MPESA_CONSUMER_SECRET", label: "Consumer secret", group: "mpesa", secret: true },
  { key: "MPESA_PASSKEY", label: "Passkey", group: "mpesa", secret: true },
  { key: "MPESA_SHORTCODE", label: "Shortcode", group: "mpesa", secret: false, placeholder: "174379" },
  {
    key: "MPESA_TRANSACTION_TYPE",
    label: "Transaction type",
    group: "mpesa",
    secret: false,
    options: [
      { value: "CustomerPayBillOnline", label: "Paybill" },
      { value: "CustomerBuyGoodsOnline", label: "Till (Buy Goods)" },
    ],
  },
  { key: "MPESA_PARTY_B", label: "Till number (Buy Goods only)", group: "mpesa", secret: false },
  {
    key: "PAYSTACK_PROVIDER",
    label: "Mode",
    group: "paystack",
    secret: false,
    options: [
      { value: "paystack", label: "Live (Paystack)" },
      { value: "simulator", label: "Simulator (development only)" },
      { value: "off", label: "Off (M-Pesa only)" },
    ],
  },
  {
    key: "PAYSTACK_SECRET_KEY",
    label: "Secret key",
    group: "paystack",
    secret: true,
    placeholder: "sk_live_…",
    help: "Paystack dashboard, Settings, API Keys & Webhooks. It also signs the webhook: set the webhook URL to /api/webhooks/paystack.",
  },

  {
    key: "EMAIL_PROVIDER",
    label: "Mode",
    group: "email",
    secret: false,
    options: [
      { value: "smtp", label: "Live (SMTP)" },
      { value: "console", label: "Console (development only)" },
    ],
  },
  { key: "SMTP_HOST", label: "SMTP host", group: "email", secret: false, placeholder: "smtp.zoho.com" },
  { key: "SMTP_PORT", label: "Port", group: "email", secret: false, placeholder: "587", help: "587 with STARTTLS, or 465 with TLS on." },
  {
    key: "SMTP_SECURE",
    label: "TLS from the start",
    group: "email",
    secret: false,
    options: [
      { value: "false", label: "No (STARTTLS, port 587)" },
      { value: "true", label: "Yes (port 465)" },
    ],
  },
  { key: "SMTP_USER", label: "Username", group: "email", secret: false, placeholder: "hello@yourdomain.co.ke" },
  { key: "SMTP_PASSWORD", label: "Password", group: "email", secret: true, help: "An app password where the provider offers one." },
  { key: "EMAIL_FROM", label: "From address", group: "email", secret: false, placeholder: "hello@yourdomain.co.ke" },
  { key: "EMAIL_FROM_NAME", label: "From name", group: "email", secret: false, placeholder: "Your product name" },
  { key: "EMAIL_REPLY_TO", label: "Reply-to address", group: "email", secret: false, placeholder: "support@yourdomain.co.ke" },
  {
    key: "SMS_PROVIDER",
    label: "Mode",
    group: "sms",
    secret: false,
    options: [
      { value: "bonga", label: "Live (Bonga SMS)" },
      { value: "console", label: "Console (development only)" },
      { value: "off", label: "Off (no SMS)" },
    ],
  },
  { key: "BONGA_SMS_CLIENT_ID", label: "API client ID", group: "sms", secret: false, help: "From the Bonga SMS portal, API settings." },
  { key: "BONGA_SMS_API_KEY", label: "API key", group: "sms", secret: true },
  { key: "BONGA_SMS_API_SECRET", label: "API secret", group: "sms", secret: true },
  { key: "BONGA_SMS_SERVICE_ID", label: "Service ID", group: "sms", secret: false, help: "The sender ID service to send from." },
  { key: "BONGA_SMS_ENDPOINT", label: "Send endpoint", group: "sms", secret: false, placeholder: "http://167.172.14.50:4002/v1/send-sms", help: "Leave empty for Bonga's default." },
  { key: "GOOGLE_CLIENT_ID", label: "OAuth client ID", group: "google", secret: false, placeholder: "123456789-abc.apps.googleusercontent.com", help: "Google Cloud Console → APIs & Services → Credentials → OAuth client (Web). Add the redirect URI shown on this page." },
  { key: "GOOGLE_CLIENT_SECRET", label: "OAuth client secret", group: "google", secret: true },
  {
    key: "GOOGLE_AUTH_ENABLED",
    label: "Show the Google button",
    group: "google",
    secret: false,
    options: [
      { value: "true", label: "Yes (when the keys are set)" },
      { value: "false", label: "No, hide it" },
    ],
  },
  { key: "SMS_DAILY_CAP", label: "Daily SMS limit", group: "sms", secret: false, placeholder: "300", help: "Across the platform; texts beyond it are logged, not sent." },
];

export const PLATFORM_SETTING_KEYS: ReadonlySet<string> = new Set(PLATFORM_SETTINGS.map((s) => s.key));

export function specFor(key: string): PlatformSettingSpec | undefined {
  return PLATFORM_SETTINGS.find((s) => s.key === key);
}

/** Masked hint for a secret: enough to tell which key is loaded, never the key. */
export function maskHint(value: string): string {
  return value.length <= 8 ? "••••••••" : `••••••••${value.slice(-4)}`;
}
