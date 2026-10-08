import { z } from "zod";

/**
 * The automation vocabulary: what can trigger one, what it can check, and what it
 * can do. Pure and shared by the API (validation), the console (forms) and the
 * engine in src/server/automations.ts (evaluation).
 */

export const TRIGGERS = ["MESSAGE_RECEIVED", "LEAD_CREATED", "COMMENT_RECEIVED", "POST_PUBLISHED", "POST_FAILED"] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TRIGGER_LABELS: Record<Trigger, string> = {
  MESSAGE_RECEIVED: "A WhatsApp message arrives",
  LEAD_CREATED: "A new contact messages for the first time",
  COMMENT_RECEIVED: "Someone comments on a TikTok video",
  POST_PUBLISHED: "A scheduled post is published (Facebook, Instagram or TikTok)",
  POST_FAILED: "A scheduled post fails to publish",
};

/** Triggers whose conditions can match keywords in the incoming text. */
export const TEXT_TRIGGERS: ReadonlySet<Trigger> = new Set(["MESSAGE_RECEIVED", "COMMENT_RECEIVED"]);

export const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  WON: "Won",
  LOST: "Lost",
};

const text = (max: number) => z.string().trim().min(1).max(max);

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SEND_REPLY"), text: text(1000) }),
  z.object({ type: z.literal("AI_REPLY"), instructions: z.string().trim().max(1000).default("") }),
  z.object({ type: z.literal("SET_STAGE"), stage: z.enum(STAGES) }),
  z.object({ type: z.literal("ADD_TAG"), tag: text(40) }),
  z.object({ type: z.literal("NOTIFY_TEAM"), message: text(300) }),
]);
export type Action = z.infer<typeof ActionSchema>;
export type ActionType = Action["type"];

export const ACTION_LABELS: Record<ActionType, string> = {
  SEND_REPLY: "Send a reply (WhatsApp message, or a reply to the TikTok comment)",
  AI_REPLY: "Reply with AI (uses the brand's catalogue)",
  SET_STAGE: "Move the lead to a stage",
  ADD_TAG: "Tag the contact",
  NOTIFY_TEAM: "Notify the team",
};

/** Actions that need a WhatsApp contact to act on. Post events have none; a TikTok comment can be replied to, but has no contact. */
const CONVERSATION_ACTIONS: ReadonlySet<ActionType> = new Set(["SEND_REPLY", "AI_REPLY", "SET_STAGE", "ADD_TAG"]);
const CONTACT_ACTIONS: ReadonlySet<ActionType> = new Set(["SET_STAGE", "ADD_TAG"]);

export function actionsAllowedFor(trigger: Trigger): ActionType[] {
  const all = Object.keys(ACTION_LABELS) as ActionType[];
  if (trigger === "POST_PUBLISHED" || trigger === "POST_FAILED") return all.filter((a) => !CONVERSATION_ACTIONS.has(a));
  if (trigger === "COMMENT_RECEIVED") return all.filter((a) => !CONTACT_ACTIONS.has(a));
  return all;
}

export const MessageConditionsSchema = z.object({
  match: z.enum(["any", "keywords"]).default("any"),
  keywords: z.array(text(60)).max(20).default([]),
});

export const AutomationInputSchema = z
  .object({
    name: text(120),
    brandId: z.string().min(1).nullable().default(null),
    trigger: z.enum(TRIGGERS),
    conditions: MessageConditionsSchema.default({ match: "any", keywords: [] }),
    actions: z.array(ActionSchema).min(1).max(6),
    enabled: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    const allowed = new Set(actionsAllowedFor(value.trigger));
    value.actions.forEach((a, i) => {
      if (!allowed.has(a.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actions", i, "type"],
          message: `"${ACTION_LABELS[a.type]}" needs ${CONTACT_ACTIONS.has(a.type) ? "a WhatsApp contact" : "a message or comment to answer"}, which "${TRIGGER_LABELS[value.trigger]}" does not have.`,
        });
      }
    });
    if (value.conditions.match === "keywords" && value.conditions.keywords.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["conditions", "keywords"], message: "Add at least one keyword." });
    }
    const replies = value.actions.filter((a) => a.type === "SEND_REPLY" || a.type === "AI_REPLY").length;
    if (replies > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["actions"], message: "Send one reply per automation; customers read a burst of replies as spam." });
    }
  });
export type AutomationInput = z.infer<typeof AutomationInputSchema>;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether a message's text satisfies the conditions. Keywords match whole words, any case. */
export function messageMatches(conditions: { match: "any" | "keywords"; keywords: string[] }, body: string | null): boolean {
  if (conditions.match === "any") return true;
  const haystack = (body ?? "").toLowerCase();
  return conditions.keywords.some((k) => {
    const needle = k.trim().toLowerCase();
    return needle.length > 0 && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}($|[^\\p{L}\\p{N}])`, "u").test(haystack);
  });
}

/** Fills {{name}}, {{brand}} and {{message}}; unknown placeholders are left as written. */
export function renderTemplate(template: string, vars: { name?: string | null; brand?: string | null; message?: string | null }): string {
  return template.replace(/\{\{\s*(name|brand|message)\s*\}\}/g, (_, key: "name" | "brand" | "message") => {
    if (key === "name") return vars.name?.trim().split(/\s+/)[0] || "there";
    return (vars[key] ?? "").trim();
  });
}

/** The 24-hour customer-service window: free-form replies need a customer message within it. */
export const SERVICE_WINDOW_MS = 24 * 3_600_000;

export function insideServiceWindow(lastInboundAt: Date | null | undefined, now: Date = new Date()): boolean {
  return !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}
