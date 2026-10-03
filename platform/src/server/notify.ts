import "server-only";

import type { NotificationDelivery } from "@prisma/client";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { PRODUCT_NAME } from "@/lib/brand";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  CHANNELS,
  eventSpec,
  EVENTS,
  eventsFor,
  OUTBOUND_CHANNELS,
  personMayOptOut,
  policyAllows,
  resolvedPolicy,
  shouldSend,
  type Audience,
  type Channel,
  type EventKey,
  type NotificationPolicy,
  type OutboundChannel,
} from "@/lib/notification-events";
import type { Principal } from "@/lib/rbac";
import { kenyanMsisdn, smsText } from "@/lib/sms";

import { htmlFromText, renderEmail, sendEmail } from "./email";
import { enqueue } from "./jobs";
import { sendSms, smsMode } from "./sms";

/**
 * One way to tell people something: `notify(event, …)`.
 *
 *   in-app   a Notification row per recipient (the bell, /notifications)
 *   email    a NotificationDelivery row, sent by the worker (notify.deliver)
 *   SMS      the same, through Bonga
 *
 * Which channels an event uses comes from the catalogue defaults, the platform
 * admin's policy and each person's preferences (src/lib/notification-events.ts).
 * A message that is not sent (opted out, no phone number, daily cap) is still a
 * logged delivery row, so "why didn't I get the text?" has an answer.
 *
 * Call it after the transaction that caused the event has committed: a rolled
 * back payment must not send a receipt.
 */

const POLICY_KEY = "notificationPolicy";
const REFRESH_MS = 10_000;
const ROLES: Record<Exclude<Audience, "person" | "platform">, string[]> = {
  owners: ["OWNER"],
  managers: ["OWNER", "BRAND_MANAGER"],
  team: ["OWNER", "BRAND_MANAGER", "MARKETER"],
};

// ── policy ───────────────────────────────────────────────────────────────

const policySchema = z.record(z.string(), z.object({ IN_APP: z.boolean().optional(), EMAIL: z.boolean().optional(), SMS: z.boolean().optional() }));

let policyCache: { at: number; policy: NotificationPolicy } | null = null;

export async function getNotificationPolicy(force = false): Promise<NotificationPolicy> {
  if (!force && policyCache && Date.now() - policyCache.at < REFRESH_MS) return policyCache.policy;
  try {
    const row = await db.platformSetting.findUnique({ where: { key: POLICY_KEY } });
    const parsed = row?.value ? policySchema.safeParse(JSON.parse(row.value)) : null;
    policyCache = { at: Date.now(), policy: parsed?.success ? parsed.data : {} };
  } catch {
    if (!policyCache) return {};
  }
  return policyCache!.policy;
}

export function forgetNotificationPolicy(): void {
  policyCache = null;
}

/** Saves the platform admin's channel switches (only differences from the defaults are kept). */
export async function saveNotificationPolicy(principal: Principal, raw: unknown, request?: Request) {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only platform admins change notification settings.");
  const parsed = policySchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "The notification settings are not valid.");
  const next: NotificationPolicy = {};
  const changed: string[] = [];
  const before = resolvedPolicy(await getNotificationPolicy(true));
  for (const e of EVENTS) {
    const row = parsed.data[e.key] ?? {};
    for (const c of CHANNELS) {
      const value = row[c] ?? before[e.key]![c];
      if (value !== e.defaults[c]) (next[e.key] ??= {})[c] = value;
      if (value !== before[e.key]![c]) changed.push(`${e.key}.${c}=${value ? "on" : "off"}`);
    }
  }
  await db.platformSetting.upsert({
    where: { key: POLICY_KEY },
    create: { key: POLICY_KEY, value: JSON.stringify(next), updatedById: principal.userId },
    update: { value: JSON.stringify(next), cipherText: null, iv: null, authTag: null, updatedById: principal.userId },
  });
  if (changed.length) {
    await audit({ organizationId: null, userId: principal.userId, action: "NOTIFICATION_POLICY_UPDATE", entity: "PlatformSetting", entityId: POLICY_KEY, changes: { changed }, request });
  }
  policyCache = null;
  return resolvedPolicy(next);
}

// ── sending ──────────────────────────────────────────────────────────────

export interface NotifyInput {
  event: EventKey;
  /** Required for every audience except "platform" */
  organizationId?: string | null;
  /** The people for audience "person"; for others, limits the audience to these */
  userIds?: string[];
  title: string;
  body?: string | null;
  /** Where the notification leads, a path inside the app */
  href?: string | null;
}

interface Recipient {
  id: string;
  email: string;
  name: string;
  phone: string | null;
}

async function recipientsFor(audience: Audience, input: NotifyInput): Promise<Recipient[]> {
  const select = { id: true, email: true, name: true, phone: true } as const;
  if (audience === "platform") {
    return db.user.findMany({ where: { isPlatformAdmin: true, status: "ACTIVE", ...(input.userIds ? { id: { in: input.userIds } } : {}) }, select });
  }
  if (!input.organizationId) return [];
  if (audience === "person") {
    if (!input.userIds?.length) return [];
    return db.user.findMany({
      where: { id: { in: input.userIds }, status: "ACTIVE", memberships: { some: { organizationId: input.organizationId, status: "ACTIVE" } } },
      select,
    });
  }
  const members = await db.membership.findMany({
    where: {
      organizationId: input.organizationId,
      status: "ACTIVE",
      role: { in: ROLES[audience] },
      user: { status: "ACTIVE" },
      ...(input.userIds ? { userId: { in: input.userIds } } : {}),
    },
    select: { user: { select } },
  });
  return members.map((m) => m.user);
}

function absolute(href: string | null | undefined): string {
  const base = env().APP_BASE_URL.replace(/\/$/, "");
  return href ? (href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`) : base;
}

/** Creates the in-app notifications and queues the email and SMS. Never throws for a delivery problem. */
export async function notify(input: NotifyInput): Promise<{ recipients: number; inApp: number; queued: number; suppressed: number }> {
  const spec = eventSpec(input.event);
  if (!spec) throw new Error(`Unknown notification event ${input.event}`);
  const people = await recipientsFor(spec.audience, input);
  if (people.length === 0) return { recipients: 0, inApp: 0, queued: 0, suppressed: 0 };

  const policy = await getNotificationPolicy();
  const organizationId = spec.audience === "platform" ? null : (input.organizationId ?? null);
  const title = input.title.slice(0, 200);
  const body = input.body?.slice(0, 1000) ?? null;

  let inApp = 0;
  const notificationFor = new Map<string, string>();
  if (policyAllows(policy, input.event, "IN_APP")) {
    const rows = await db.notification.createManyAndReturn({
      data: people.map((p) => ({ organizationId, userId: p.id, kind: input.event, title, body, href: input.href ?? null })),
      select: { id: true, userId: true },
    });
    for (const r of rows) notificationFor.set(r.userId, r.id);
    inApp = rows.length;
  }

  const prefs = await db.notificationPreference.findMany({
    where: { userId: { in: people.map((p) => p.id) }, event: input.event },
    select: { userId: true, channel: true, enabled: true },
  });
  const prefOf = (userId: string, channel: OutboundChannel) => prefs.find((p) => p.userId === userId && p.channel === channel)?.enabled;

  const footer = `You get this because of your ${PRODUCT_NAME} notification settings: ${absolute("/account")}`;
  const email = renderEmail({ product: PRODUCT_NAME, title, body, action: input.href ? { label: "Open", url: absolute(input.href) } : null, footer });
  const sms = smsText(title, body, PRODUCT_NAME);

  const rows: Array<Omit<NotificationDelivery, "id" | "createdAt" | "updatedAt" | "sentAt" | "provider" | "providerRef" | "mock" | "attempts">> = [];
  for (const channel of OUTBOUND_CHANNELS) {
    if (!policyAllows(policy, input.event, channel)) continue;
    if (channel === "SMS" && smsMode() === "off") continue;
    for (const p of people) {
      const decision = shouldSend(policy, input.event, channel, prefOf(p.id, channel));
      const to = channel === "EMAIL" ? p.email : kenyanMsisdn(p.phone);
      const reason = !decision.send ? "Switched off in the person's notification settings." : !to ? "No mobile number on the account." : null;
      rows.push({
        notificationId: notificationFor.get(p.id) ?? null,
        organizationId,
        userId: p.id,
        event: input.event,
        channel,
        recipient: to ?? (channel === "SMS" ? "(no phone)" : p.email),
        subject: channel === "EMAIL" ? title : null,
        body: channel === "EMAIL" ? email.text : sms,
        status: reason ? "SUPPRESSED" : "QUEUED",
        error: reason,
      });
    }
  }
  if (rows.length === 0) return { recipients: people.length, inApp, queued: 0, suppressed: 0 };

  const created = await db.notificationDelivery.createManyAndReturn({ data: rows, select: { id: true, status: true, organizationId: true } });
  const queued = created.filter((d) => d.status === "QUEUED");
  for (const d of queued) {
    await enqueue("notify.deliver", { deliveryId: d.id }, { dedupeKey: `notify.deliver:${d.id}:0`, organizationId: d.organizationId, maxAttempts: 3 });
  }
  return { recipients: people.length, inApp, queued: queued.length, suppressed: created.length - queued.length };
}

/** Start of today in East Africa time (UTC+3, no daylight saving), as a UTC instant. */
function startOfDayEAT(now = new Date()): Date {
  const eat = new Date(now.getTime() + 3 * 3_600_000);
  return new Date(Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate()) - 3 * 3_600_000);
}

/**
 * The worker step: sends one queued delivery. Claimed with a conditional
 * update, so a redelivered job cannot send twice. A provider failure is
 * retried by the queue; the last attempt records it as FAILED.
 */
export async function deliverNotification(deliveryId: string, finalAttempt = true): Promise<NotificationDelivery | null> {
  const claimed = await db.notificationDelivery.updateMany({
    // A SENDING row older than five minutes belonged to a worker that died mid-send.
    where: { id: deliveryId, OR: [{ status: "QUEUED" }, { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } }] },
    data: { status: "SENDING", attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return db.notificationDelivery.findUnique({ where: { id: deliveryId } });
  const d = (await db.notificationDelivery.findUnique({ where: { id: deliveryId } }))!;

  const finish = (data: Partial<NotificationDelivery>) => db.notificationDelivery.update({ where: { id: d.id }, data });

  if (d.channel === "SMS") {
    const cap = env().SMS_DAILY_CAP;
    const today = await db.notificationDelivery.count({ where: { channel: "SMS", status: "SENT", sentAt: { gte: startOfDayEAT() } } });
    if (today >= cap) return finish({ status: "SUPPRESSED", error: `Today's SMS limit (${cap}) was reached. Raise it in Settings → SMS.` });
  }

  let result: { ok: boolean; error?: string; reference?: string | null; mock?: boolean; provider?: string };
  try {
    if (d.channel === "EMAIL") {
      const r = await sendEmail({ to: d.recipient, subject: d.subject ?? PRODUCT_NAME, text: d.body, html: htmlFromText(PRODUCT_NAME, d.body) });
      result = { ok: r.ok, error: r.error, reference: r.id ?? null, mock: r.mock, provider: r.provider };
    } else {
      result = await sendSms({ to: d.recipient, text: d.body });
    }
  } catch (error) {
    // A stand-in refused in production, or a bug: not something a retry fixes.
    return finish({ status: "FAILED", error: (error instanceof Error ? error.message : String(error)).slice(0, 500) });
  }

  if (result.ok) {
    return finish({ status: "SENT", error: null, provider: result.provider ?? null, providerRef: result.reference ?? null, mock: Boolean(result.mock), sentAt: new Date() });
  }
  if (!finalAttempt) {
    await finish({ status: "QUEUED", error: result.error ?? "Not sent", provider: result.provider ?? null });
    throw new Error(result.error ?? "Delivery failed");
  }
  return finish({ status: "FAILED", error: (result.error ?? "Not sent").slice(0, 500), provider: result.provider ?? null });
}

/** A platform admin re-sends a failed or suppressed delivery. */
export async function retryDelivery(principal: Principal, deliveryId: string, request?: Request) {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only platform admins retry deliveries.");
  const d = await db.notificationDelivery.findUnique({ where: { id: deliveryId } });
  if (!d) throw new ApiError(404, "NOT_FOUND", "Delivery not found.");
  if (d.status !== "FAILED" && d.status !== "SUPPRESSED") throw new ApiError(409, "CONFLICT", "Only failed or held-back messages can be retried.");
  let recipient = d.recipient;
  if (d.channel === "SMS" && !kenyanMsisdn(recipient) && d.userId) {
    const user = await db.user.findUnique({ where: { id: d.userId }, select: { phone: true } });
    recipient = kenyanMsisdn(user?.phone) ?? recipient;
    if (!kenyanMsisdn(recipient)) throw new ApiError(422, "NO_PHONE", "This person has no mobile number on their account yet.");
  }
  const won = await db.notificationDelivery.updateMany({ where: { id: d.id, status: d.status }, data: { status: "QUEUED", recipient, error: null } });
  if (won.count !== 1) throw new ApiError(409, "CONFLICT", "Someone else just changed this delivery.");
  await enqueue("notify.deliver", { deliveryId: d.id }, { dedupeKey: `notify.deliver:${d.id}:${d.attempts + 1}`, organizationId: d.organizationId, maxAttempts: 3 });
  await audit({ organizationId: d.organizationId, userId: principal.userId, action: "NOTIFICATION_RETRY", entity: "NotificationDelivery", entityId: d.id, changes: { channel: d.channel, event: d.event }, request });
  return { id: d.id, status: "QUEUED" };
}

/** "Send test" on the admin page: straight through the provider, logged like any delivery. */
export async function sendTest(principal: Principal, channel: OutboundChannel, to: string, request?: Request) {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only platform admins send test messages.");
  const recipient = channel === "EMAIL" ? to.trim().toLowerCase() : kenyanMsisdn(to);
  if (!recipient || (channel === "EMAIL" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient))) {
    throw new ApiError(422, "VALIDATION_FAILED", channel === "EMAIL" ? "Enter an email address." : "Enter a Kenyan mobile number, e.g. 0712 345 678.");
  }
  const title = `Test ${channel === "EMAIL" ? "email" : "SMS"} from ${PRODUCT_NAME}`;
  const body = "If you can read this, notifications reach you on this channel.";
  const rendered = renderEmail({ product: PRODUCT_NAME, title, body });
  const row = await db.notificationDelivery.create({
    data: {
      userId: principal.userId,
      event: "test",
      channel,
      recipient,
      subject: channel === "EMAIL" ? title : null,
      body: channel === "EMAIL" ? rendered.text : smsText(title, body, PRODUCT_NAME),
      status: "QUEUED",
    },
  });
  await audit({ organizationId: null, userId: principal.userId, action: "NOTIFICATION_TEST", entity: "NotificationDelivery", entityId: row.id, changes: { channel }, request });
  const done = await deliverNotification(row.id, true);
  return { id: row.id, status: done?.status ?? "FAILED", error: done?.error ?? null, mock: done?.mock ?? false, provider: done?.provider ?? null };
}

// ── people's preferences ─────────────────────────────────────────────────

export async function preferencesFor(userId: string, organizationId: string | null) {
  const [user, memberships, saved, policy] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { isPlatformAdmin: true, phone: true, email: true } }),
    db.membership.findMany({ where: { userId, status: "ACTIVE", ...(organizationId ? { organizationId } : {}) }, select: { role: true } }),
    db.notificationPreference.findMany({ where: { userId } }),
    getNotificationPolicy(),
  ]);
  const events = eventsFor({ platformAdmin: user.isPlatformAdmin, roles: memberships.map((m) => m.role) });
  return {
    phone: user.phone,
    email: user.email,
    smsOn: smsMode() !== "off",
    events: events.map((e) => ({
      key: e.key,
      label: e.label,
      description: e.description,
      group: e.group,
      essential: e.essential,
      channels: Object.fromEntries(
        OUTBOUND_CHANNELS.map((c) => {
          const available = policyAllows(policy, e.key, c);
          const pref = saved.find((s) => s.event === e.key && s.channel === c)?.enabled;
          return [c, { available, enabled: available && (e.essential || pref !== false), locked: e.essential }];
        }),
      ) as Record<OutboundChannel, { available: boolean; enabled: boolean; locked: boolean }>,
    })),
  };
}

const prefSchema = z.array(z.object({ event: z.string(), channel: z.enum(OUTBOUND_CHANNELS), enabled: z.boolean() })).max(200);

export async function savePreferences(userId: string, raw: unknown) {
  const items = prefSchema.parse(raw);
  for (const item of items) {
    if (!eventSpec(item.event)) throw new ApiError(422, "VALIDATION_FAILED", `Unknown event ${item.event}.`);
    if (!personMayOptOut(item.event)) continue; // essential: not the person's to switch off
    await db.notificationPreference.upsert({
      where: { userId_event_channel: { userId, event: item.event, channel: item.channel } },
      create: { userId, event: item.event, channel: item.channel, enabled: item.enabled },
      update: { enabled: item.enabled },
    });
  }
}

export type { Channel };
