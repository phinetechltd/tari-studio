import { z } from "zod";

/**
 * The in-app assistant's settings, which a platform admin manages from the dashboard
 * (Platform admin → Assistant). Pure: shared by the server, the admin screen and the tests.
 *
 * Two tiers. "free" is the default system AI everybody gets; "paid" is for teams that pay
 * (an active plan, or credits bought in the last 90 days) with more messages and longer
 * answers. Both tiers run on the platform's managed AI keys — the tier never
 * changes whose key is used, only the quotas, model and features. Each tool can be
 * switched off, or limited to paying teams. The fixed safety rules in
 * src/lib/assistant-guard.ts are not settings: the admin can add to the assistant's
 * persona, but cannot remove the rules.
 */

export const ASSISTANT_TOOLS = [
  {
    key: "list_brands",
    label: "Look at brands",
    kind: "READ",
    description: "Reads the team's brands (name, slogan, voice) so it can answer and fill in gaps.",
    defaultPaidOnly: false,
  },
  {
    key: "list_products",
    label: "Look at products",
    kind: "READ",
    description: "Reads the team's products (name, price, description) without stock numbers.",
    defaultPaidOnly: false,
  },
  {
    key: "list_characters",
    label: "Look at characters",
    kind: "READ",
    description: "Reads the team's characters and their descriptions.",
    defaultPaidOnly: false,
  },
  {
    key: "improve_prompt",
    label: "Write a better prompt",
    kind: "LINK",
    description: "Rewrites a rough idea into a clear image or video prompt and offers a button that opens it in the Studio.",
    defaultPaidOnly: false,
  },
  {
    key: "update_brand",
    label: "Fill in a brand",
    kind: "PROPOSE",
    description: "Proposes a slogan, voice, colours and other details for a brand, for example from a logo or photo the person uploaded. Saved only when they press Apply.",
    defaultPaidOnly: false,
  },
  {
    key: "create_brand",
    label: "Create a brand",
    kind: "PROPOSE",
    description: "Proposes a new brand. Saved only when the person presses Apply.",
    defaultPaidOnly: false,
  },
  {
    key: "create_character",
    label: "Create a character",
    kind: "PROPOSE",
    description: "Proposes a character (name and look), and can keep the picture the person uploaded as its image.",
    defaultPaidOnly: false,
  },
  {
    key: "create_template",
    label: "Create a template",
    kind: "PROPOSE",
    description: "Proposes a private template (title, description, prompt hint), optionally with the uploaded picture.",
    defaultPaidOnly: false,
  },
  {
    key: "create_product",
    label: "Add a product",
    kind: "PROPOSE",
    description: "Proposes a product with a price and description, optionally with the uploaded picture.",
    defaultPaidOnly: false,
  },
  {
    key: "create_image",
    label: "Create an image",
    kind: "GENERATE",
    description: "Prepares an image in the Studio from the conversation. It shows the credit cost and nothing is charged until the person presses Generate there.",
    defaultPaidOnly: true,
  },
] as const;

export type AssistantToolKey = (typeof ASSISTANT_TOOLS)[number]["key"];
export const ASSISTANT_TOOL_KEYS = ASSISTANT_TOOLS.map((t) => t.key) as unknown as readonly [AssistantToolKey, ...AssistantToolKey[]];
export type Tier = "free" | "paid";

const tierSchema = z.object({
  /** "anthropic" (Claude), "nvidia" (the hosted models) or "platform" (whatever the deployment's AI chain is) */
  provider: z.enum(["anthropic", "nvidia", "platform"]),
  /** Empty = the provider's default model */
  model: z.string().trim().max(120).default(""),
  maxOutputTokens: z.number().int().min(200).max(8000),
  /** Messages one person may send per day; 0 = none */
  dailyMessages: z.number().int().min(0).max(5000),
  /** Whether this tier's model can read an uploaded picture */
  vision: z.boolean(),
});

export const assistantConfigSchema = z.object({
  enabled: z.boolean(),
  /** What people see the assistant called */
  name: z.string().trim().min(1).max(40),
  /** Added to the fixed rules: tone, what the business does, how to greet. Cannot loosen the rules. */
  persona: z.string().trim().max(2500),
  welcome: z.string().trim().max(400),
  free: tierSchema,
  paid: tierSchema,
  /** Per tool: on or off, and whether it is for paying teams only */
  tools: z.record(z.enum(ASSISTANT_TOOL_KEYS), z.object({ enabled: z.boolean(), paidOnly: z.boolean() })),
  /** Most tool rounds the assistant may take to answer one message */
  maxToolSteps: z.number().int().min(1).max(5),
  /** Longest message a person may send, in characters */
  maxInputChars: z.number().int().min(200).max(8000),
  /** Messages per person per minute */
  perMinute: z.number().int().min(1).max(60),
});

export type AssistantConfig = z.infer<typeof assistantConfigSchema>;

export function defaultAssistantConfig(): AssistantConfig {
  return {
    enabled: true,
    name: "Tari Assistant",
    persona: "Be warm, brief and practical. The people you help run small businesses and agencies in Kenya. Prefer plain words, and use Kenyan shillings (KES) for prices.",
    welcome: "Hi! I can fill in your brand from a logo or photo, create characters and templates, and turn rough ideas into prompts that work.",
    // Both tiers run on the platform's NVIDIA models (Kimi K3 by default —
    // see NVIDIA_DEFAULT_MODEL in src/server/ai.ts). The paid tier simply
    // allows more messages and longer answers.
    free: { provider: "nvidia", model: "", maxOutputTokens: 1500, dailyMessages: 15, vision: true },
    paid: { provider: "nvidia", model: "", maxOutputTokens: 3000, dailyMessages: 200, vision: true },
    tools: Object.fromEntries(ASSISTANT_TOOLS.map((t) => [t.key, { enabled: true, paidOnly: t.defaultPaidOnly }])) as AssistantConfig["tools"],
    maxToolSteps: 3,
    maxInputChars: 3000,
    perMinute: 12,
  };
}

/** Whatever was stored, repaired against the defaults, so a half-saved or older shape never breaks the assistant. */
export function normaliseAssistantConfig(raw: unknown): AssistantConfig {
  const base = defaultAssistantConfig();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<AssistantConfig>;
  const merged = {
    ...base,
    ...r,
    free: { ...base.free, ...(r.free ?? {}) },
    paid: { ...base.paid, ...(r.paid ?? {}) },
    tools: Object.fromEntries(ASSISTANT_TOOLS.map((t) => [t.key, { ...base.tools[t.key], ...(r.tools?.[t.key] ?? {}) }])),
  };
  const parsed = assistantConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}

/** Whether a tool may be used by a tier, under the current settings. */
export function toolAllowed(config: AssistantConfig, tool: AssistantToolKey, tier: Tier): boolean {
  const t = config.tools[tool];
  if (!t?.enabled) return false;
  return tier === "paid" || !t.paidOnly;
}

export function toolsFor(config: AssistantConfig, tier: Tier): AssistantToolKey[] {
  return ASSISTANT_TOOLS.map((t) => t.key).filter((k) => toolAllowed(config, k, tier));
}
