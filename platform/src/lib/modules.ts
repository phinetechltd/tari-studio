/**
 * Module licensing.
 *
 * Each module is sold separately, so a tenant that has not bought one must not
 * reach it through the console *or* the API. The licence check lives here and is
 * called from both (via `rbac.can`).
 *
 * There are deliberately no prices in this file. Pricing is a commercial
 * decision that has not been made; a number here would end up quoted as fact.
 *
 * Modules marked `comingSoon` are declared so the gate, the requirements graph
 * and the platform console are built once against the full shape, but they
 * cannot be enabled until the feature ships.
 */

export const MODULE_KEYS = [
  "CONTENT_STUDIO",
  "SOCIAL_PUBLISHING",
  "CAMPAIGN_TRACKING",
  "AI_CONTENT",
  "WHATSAPP_AI",
  "LEADS_CRM",
  "QUOTATIONS",
  "HARDWARE_INVENTORY",
  "INSTALLATIONS",
  "SUPPORT_DESK",
  "CUSTOMER_INSIGHTS",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  summary: string;
  /** Modules that must also be enabled for this one to be useful. */
  requires: ModuleKey[];
  /** Declared but not yet built: cannot be enabled. */
  comingSoon: boolean;
  /** The release in which it is planned to ship. */
  release: "R1" | "R2" | "R3" | "R4" | "R5";
  icon: string;
}

export const MODULE_CATALOG: Record<ModuleKey, ModuleDefinition> = {
  CONTENT_STUDIO: {
    key: "CONTENT_STUDIO",
    name: "Content Studio",
    summary: "AI content ideas, designer briefs, submissions and approvals.",
    requires: [],
    comingSoon: false,
    release: "R1",
    icon: "pen-tool",
  },
  SOCIAL_PUBLISHING: {
    key: "SOCIAL_PUBLISHING",
    name: "Social Publishing",
    summary: "Connect Facebook Pages and Instagram; schedule and publish approved posts.",
    requires: ["CONTENT_STUDIO"],
    comingSoon: false,
    release: "R1",
    icon: "send",
  },
  CAMPAIGN_TRACKING: {
    key: "CAMPAIGN_TRACKING",
    name: "Campaigns & Tracking",
    summary: "Campaigns, tracked WhatsApp links, post performance and the daily report.",
    requires: [],
    comingSoon: false,
    release: "R1",
    icon: "bar-chart",
  },
  AI_CONTENT: {
    key: "AI_CONTENT",
    name: "AI Content Generation",
    summary: "Metered AI generation of ideas, briefs and captions from your catalogue.",
    requires: [],
    comingSoon: false,
    release: "R1",
    icon: "sparkles",
  },
  WHATSAPP_AI: {
    key: "WHATSAPP_AI",
    name: "WhatsApp Inbox & Automations",
    summary: "One inbox for your WhatsApp numbers, instant and AI replies from your catalogue, and automations.",
    requires: ["LEADS_CRM"],
    comingSoon: false,
    release: "R2",
    icon: "message-circle",
  },
  LEADS_CRM: {
    key: "LEADS_CRM",
    name: "Leads & Pipeline",
    summary: "Every WhatsApp contact as a lead, credited to the campaign that brought them, with a sales pipeline.",
    requires: [],
    comingSoon: false,
    release: "R2",
    icon: "users",
  },
  QUOTATIONS: {
    key: "QUOTATIONS",
    name: "Quotations",
    summary: "Quotes built from bundles, reviewed by a human, sent to the customer.",
    requires: ["LEADS_CRM"],
    comingSoon: true,
    release: "R3",
    icon: "file-text",
  },
  HARDWARE_INVENTORY: {
    key: "HARDWARE_INVENTORY",
    name: "Hardware Inventory",
    summary: "Serial-level stock from reserved to sold, assigned and installed.",
    requires: [],
    comingSoon: true,
    release: "R3",
    icon: "box",
  },
  INSTALLATIONS: {
    key: "INSTALLATIONS",
    name: "Installations",
    summary: "Technician scheduling, checklists, photos and customer sign-off.",
    requires: ["HARDWARE_INVENTORY"],
    comingSoon: true,
    release: "R4",
    icon: "wrench",
  },
  SUPPORT_DESK: {
    key: "SUPPORT_DESK",
    name: "Support Desk",
    summary: "AI troubleshooting, tickets and escalation for installed customers.",
    requires: ["WHATSAPP_AI"],
    comingSoon: true,
    release: "R4",
    icon: "life-buoy",
  },
  CUSTOMER_INSIGHTS: {
    key: "CUSTOMER_INSIGHTS",
    name: "Customer Insights",
    summary: "Support and lead data turned into new content recommendations.",
    requires: [],
    comingSoon: true,
    release: "R5",
    icon: "lightbulb",
  },
};

export const MODULE_LIST: ModuleDefinition[] = MODULE_KEYS.map((k) => MODULE_CATALOG[k]);

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

/** Modules whose absence would leave `key` half-working. */
export function missingPrerequisites(key: ModuleKey, enabled: ReadonlySet<string>): ModuleKey[] {
  return MODULE_CATALOG[key].requires.filter((r) => !enabled.has(r));
}

/**
 * Modules that depend on `key` and are currently enabled — the ones that would
 * be left half-working if `key` were switched off.
 */
export function dependentsOf(key: ModuleKey, enabled: ReadonlySet<string>): ModuleKey[] {
  return MODULE_LIST.filter((m) => m.requires.includes(key) && enabled.has(m.key)).map(
    (m) => m.key,
  );
}
