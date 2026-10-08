/**
 * Every notification the platform sends, in one catalogue: who receives it,
 * whether a person may switch it off, and which channels it uses by default.
 *
 * Three layers decide whether a message goes out on a channel:
 *
 *   1. the platform policy   a platform admin turns channels on or off per event
 *                            (Platform admin → Notifications); defaults below
 *   2. the person's choice   NotificationPreference; ignored for essential events
 *   3. a way to reach them   an email address always; a phone number for SMS
 *
 * SMS costs money per message (Bonga), so by default it is on only for the
 * events that need action soon: a renewal that failed, a plan about to end, an
 * empty wallet, and (for platform admins) the AI credits running out.
 * Pure: shared by the server, the settings pages and the tests.
 */

export type Channel = "IN_APP" | "EMAIL" | "SMS";
export const CHANNELS: readonly Channel[] = ["IN_APP", "EMAIL", "SMS"];
export const OUTBOUND_CHANNELS = ["EMAIL", "SMS"] as const;
export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

/**
 *   owners    the organisation's Owners
 *   managers  Owners and Brand managers (orders, quotes)
 *   team      Owners, Brand managers and Marketers (automations)
 *   person    named people (whoever started a generation)
 *   platform  platform admins (no organisation)
 */
export type Audience = "owners" | "managers" | "team" | "person" | "platform";

export interface EventSpec {
  key: string;
  label: string;
  description: string;
  group: "Billing" | "Orders" | "Studio" | "Products" | "Autopilot" | "Automations" | "Platform";
  audience: Audience;
  /** Account and money matters: people cannot opt out, only an admin can switch a channel off */
  essential: boolean;
  defaults: Record<Channel, boolean>;
}

const on = (email: boolean, sms: boolean, inApp = true): Record<Channel, boolean> => ({ IN_APP: inApp, EMAIL: email, SMS: sms });

export const EVENTS = [
  {
    key: "billing.payment_received",
    label: "Payment received",
    description: "A plan or credit purchase went through.",
    group: "Billing",
    audience: "owners",
    essential: false,
    defaults: on(true, false),
  },
  {
    key: "billing.renewal_failed",
    label: "Renewal failed",
    description: "The card on file was declined when the plan renewed.",
    group: "Billing",
    audience: "owners",
    essential: true,
    defaults: on(true, true),
  },
  {
    key: "plan.ending",
    label: "Plan ending soon",
    description: "Three days before a plan that does not renew itself ends.",
    group: "Billing",
    audience: "owners",
    essential: true,
    defaults: on(true, true),
  },
  {
    key: "plan.ended",
    label: "Plan ended",
    description: "A plan ended; credits stay in the wallet.",
    group: "Billing",
    audience: "owners",
    essential: true,
    defaults: on(true, false),
  },
  {
    key: "credits.empty",
    label: "Credits used up",
    description: "The wallet no longer covers an image.",
    group: "Billing",
    audience: "owners",
    essential: true,
    defaults: on(true, true),
  },
  {
    key: "ai.limit_reached",
    label: "AI writing limit reached",
    description: "This month's allowance for captions, replies and briefs is used up.",
    group: "Billing",
    audience: "owners",
    essential: false,
    defaults: on(true, false),
  },
  {
    key: "order.paid",
    label: "Order paid",
    description: "A customer paid for a done-for-you order.",
    group: "Orders",
    audience: "managers",
    essential: false,
    defaults: on(true, false),
  },
  {
    key: "order.quote_requested",
    label: "Quote requested",
    description: "A customer asked for a price on extras.",
    group: "Orders",
    audience: "managers",
    essential: false,
    defaults: on(true, false),
  },
  {
    key: "generation.failed",
    label: "Generation failed",
    description: "An image or video could not be made; its credits were returned.",
    group: "Studio",
    audience: "person",
    essential: false,
    defaults: on(false, false),
  },
  {
    key: "product.low_stock",
    label: "Product running low",
    description: "A tracked product fell to its warning level or ran out.",
    group: "Products",
    audience: "managers",
    essential: false,
    defaults: on(true, false),
  },
  {
    key: "autopilot.needs_approval",
    label: "Autopilot post waiting for approval",
    description: "An Autopilot set to ask first has made a post for you to approve.",
    group: "Autopilot",
    audience: "team",
    essential: false,
    defaults: on(true, false),
  },
  {
    key: "autopilot.posted",
    label: "Autopilot posted",
    description: "An Autopilot published a post.",
    group: "Autopilot",
    audience: "team",
    essential: false,
    defaults: on(false, false),
  },
  {
    key: "autopilot.skipped",
    label: "Autopilot skipped a post",
    description: "A scheduled run was skipped (not enough credits, nothing in stock, or the monthly limit).",
    group: "Autopilot",
    audience: "managers",
    essential: false,
    defaults: on(true, false),
  },
  {
    key: "autopilot.paused",
    label: "Autopilot switched itself off",
    description: "Repeated failures or a disconnected account stopped an Autopilot.",
    group: "Autopilot",
    audience: "owners",
    essential: true,
    defaults: on(true, false),
  },  {
    key: "automation.notify",
    label: "Automation alerts",
    description: "An automation's \"notify the team\" step.",
    group: "Automations",
    audience: "team",
    essential: false,
    defaults: on(false, false),
  },
  {
    key: "platform.subscription_paid",
    label: "Subscription paid",
    description: "An organisation bought or renewed a plan.",
    group: "Platform",
    audience: "platform",
    essential: false,
    defaults: on(false, false),
  },
  {
    key: "platform.renewal_failed",
    label: "Customer renewal failed",
    description: "An organisation's card was declined at renewal.",
    group: "Platform",
    audience: "platform",
    essential: false,
    defaults: on(true, false),
  },
  {
    key: "ai.credits_low",
    label: "AI credits running low",
    description: "The Higgsfield balance fell below the alert level.",
    group: "Platform",
    audience: "platform",
    essential: true,
    defaults: on(true, true),
  },
  {
    key: "ai.budget_threshold",
    label: "AI budget threshold",
    description: "This month's AI spend reached 80% or 100% of its budget.",
    group: "Platform",
    audience: "platform",
    essential: true,
    defaults: on(true, false),
  },
  {
    key: "ai.provider_out_of_credits",
    label: "Provider out of credits",
    description: "Higgsfield refused a generation for lack of credits.",
    group: "Platform",
    audience: "platform",
    essential: true,
    defaults: on(true, true),
  },
] as const satisfies readonly EventSpec[];

export type EventKey = (typeof EVENTS)[number]["key"];

const BY_KEY = new Map<string, EventSpec>(EVENTS.map((e) => [e.key, e]));

export function eventSpec(key: string): EventSpec | undefined {
  return BY_KEY.get(key);
}

export function isEventKey(key: string): key is EventKey {
  return BY_KEY.has(key);
}

/** The platform admin's channel switches, per event. Missing entries take the catalogue default. */
export type NotificationPolicy = Partial<Record<string, Partial<Record<Channel, boolean>>>>;

export function policyAllows(policy: NotificationPolicy, event: string, channel: Channel): boolean {
  const spec = eventSpec(event);
  if (!spec) return false;
  return policy[event]?.[channel] ?? spec.defaults[channel];
}

/** The full matrix, defaults filled in: what the admin page shows. */
export function resolvedPolicy(policy: NotificationPolicy): Record<string, Record<Channel, boolean>> {
  return Object.fromEntries(EVENTS.map((e) => [e.key, Object.fromEntries(CHANNELS.map((c) => [c, policyAllows(policy, e.key, c)])) as Record<Channel, boolean>]));
}

/** Whether a person's own choice may silence this event on this channel. */
export function personMayOptOut(event: string): boolean {
  return !eventSpec(event)?.essential;
}

/**
 * Should this event go to this person on this channel? `preference` is their
 * saved choice (undefined = none saved). In-app is never opted out of.
 */
export function shouldSend(
  policy: NotificationPolicy,
  event: string,
  channel: Channel,
  preference: boolean | undefined,
): { send: boolean; reason?: "policy" | "opted_out" } {
  if (!policyAllows(policy, event, channel)) return { send: false, reason: "policy" };
  if (channel !== "IN_APP" && preference === false && personMayOptOut(event)) return { send: false, reason: "opted_out" };
  return { send: true };
}

/** The events a person sees on their preferences page: those whose audience they belong to. */
export function eventsFor(opts: { platformAdmin: boolean; roles: readonly string[] }): EventSpec[] {
  const roles = new Set(opts.roles);
  return EVENTS.filter((e) => {
    switch (e.audience) {
      case "platform":
        return opts.platformAdmin;
      case "owners":
        return roles.has("OWNER");
      case "managers":
        return roles.has("OWNER") || roles.has("BRAND_MANAGER");
      case "team":
        return roles.has("OWNER") || roles.has("BRAND_MANAGER") || roles.has("MARKETER");
      case "person":
        return roles.size > 0;
    }
  });
}
