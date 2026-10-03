import "server-only";

import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { ApiError, badRequest, notFound } from "@/lib/api";
import { auditAs } from "@/lib/audit";
import { insideServiceWindow, STAGES } from "@/lib/automation-rules";
import { db } from "@/lib/db";
import { toWhatsAppId } from "@/lib/phone";
import type { Principal } from "@/lib/rbac";
import { orgIdOf, scope } from "@/lib/tenant";
import { extractRefCode } from "@/lib/tracked-links";

import { fireAutomations } from "./automations";
import { env } from "@/lib/env";

import { resolveGateway } from "./gateways";
import { meta, metaAppFor, metaAppForChannel, MetaApiError } from "./meta";
import { channelToken } from "./social";

/**
 * WhatsApp Cloud API: the webhook that receives customers' messages and
 * delivery receipts, and the one function that sends.
 *
 * Inbound messages are stored as they arrive (the webhook must answer Meta
 * quickly, and these are a handful of indexed writes); automations run on the
 * worker. WhatsApp retries a delivery it thinks failed, so every message is
 * claimed once by its wamid before anything else happens.
 */

// ── webhook payload (the parts we read) ─────────────────────────────────

interface WaContact {
  wa_id: string;
  profile?: { name?: string };
}

interface WaInbound {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  video?: { id?: string; caption?: string };
  document?: { id?: string; caption?: string; filename?: string };
  audio?: { id?: string };
  sticker?: { id?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}

interface WaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

export interface WaWebhook {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: WaContact[];
        messages?: WaInbound[];
        statuses?: WaStatus[];
      };
    }>;
  }>;
}

function bodyOf(m: WaInbound): { type: string; body: string | null; mediaId: string | null } {
  switch (m.type) {
    case "text":
      return { type: "text", body: m.text?.body ?? null, mediaId: null };
    case "image":
      return { type: "image", body: m.image?.caption ?? null, mediaId: m.image?.id ?? null };
    case "video":
      return { type: "video", body: m.video?.caption ?? null, mediaId: m.video?.id ?? null };
    case "document":
      return { type: "document", body: m.document?.caption ?? m.document?.filename ?? null, mediaId: m.document?.id ?? null };
    case "audio":
      return { type: "audio", body: null, mediaId: m.audio?.id ?? null };
    case "sticker":
      return { type: "sticker", body: null, mediaId: m.sticker?.id ?? null };
    case "location": {
      const l = m.location ?? {};
      return { type: "location", body: [l.name, l.address, l.latitude != null ? `${l.latitude},${l.longitude}` : null].filter(Boolean).join(" · ") || null, mediaId: null };
    }
    case "button":
      return { type: "interactive", body: m.button?.text ?? null, mediaId: null };
    case "interactive":
      return { type: "interactive", body: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null, mediaId: null };
    default:
      return { type: "unsupported", body: null, mediaId: null };
  }
}

function preview(type: string, body: string | null): string {
  if (body) return body.slice(0, 140);
  return type === "unsupported" ? "(a message type this inbox cannot show)" : `(${type})`;
}

/**
 * The app secrets that may have signed a delivery: the deployment's, plus the
 * own Meta app of each organisation whose number the payload names. Only the
 * claimed numbers' organisations are tried, so a forged payload naming another
 * tenant's number still needs that tenant's secret to pass.
 */
export async function webhookSecretsFor(rawBody: string): Promise<string[]> {
  const secrets = new Set<string>();
  const deployment = env().META_APP_SECRET;
  if (deployment) secrets.add(deployment);
  let numbers: string[] = [];
  try {
    const parsed = JSON.parse(rawBody) as WaWebhook;
    numbers = (parsed.entry ?? [])
      .flatMap((e) => (e.changes ?? []).map((c) => c.value?.metadata?.phone_number_id))
      .filter((id): id is string => typeof id === "string");
  } catch {
    // Not JSON: only the deployment secret can be tried, and the route rejects it next.
  }
  if (numbers.length > 0) {
    const owners = await db.socialChannel.findMany({
      where: { platform: "WHATSAPP", externalId: { in: numbers.slice(0, 20) }, status: { not: "DISCONNECTED" } },
      select: { organizationId: true },
      distinct: ["organizationId"],
    });
    for (const o of owners) {
      const app = await metaAppFor(o.organizationId);
      if (app) secrets.add(app.appSecret);
    }
  }
  return [...secrets];
}

/** Tokens Meta may echo when a webhook URL is registered: the deployment's and each organisation's own. */
export async function webhookVerifyTokens(): Promise<string[]> {
  const tokens = new Set<string>();
  const deployment = env().META_WEBHOOK_VERIFY_TOKEN;
  if (deployment) tokens.add(deployment);
  const rows = await db.setting.findMany({ where: { key: "gateway:social" }, select: { organizationId: true } });
  for (const row of rows) {
    const cfg = await resolveGateway(row.organizationId, "social").catch(() => null);
    if (cfg?.webhookVerifyToken) tokens.add(cfg.webhookVerifyToken);
  }
  return [...tokens];
}

export interface WebhookOutcome {
  messages: number;
  duplicates: number;
  statuses: number;
  unrouted: number;
}

export async function processWebhook(payload: WaWebhook): Promise<WebhookOutcome> {
  const outcome: WebhookOutcome = { messages: 0, duplicates: 0, statuses: 0, unrouted: 0 };
  if (payload.object !== "whatsapp_business_account") return outcome;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value) continue;
      const phoneNumberId = change.value.metadata?.phone_number_id;
      const channel = phoneNumberId
        ? await db.socialChannel.findFirst({
            where: { platform: "WHATSAPP", externalId: phoneNumberId, status: { not: "DISCONNECTED" } },
            select: { id: true, organizationId: true, brandId: true, externalId: true },
          })
        : null;
      if (!channel) {
        outcome.unrouted += (change.value.messages?.length ?? 0) + (change.value.statuses?.length ?? 0);
        continue;
      }
      for (const message of change.value.messages ?? []) {
        const stored = await ingestInbound(channel, change.value.contacts ?? [], message);
        if (stored) outcome.messages++;
        else outcome.duplicates++;
      }
      for (const status of change.value.statuses ?? []) {
        await applyStatus(channel.organizationId, status);
        outcome.statuses++;
      }
    }
  }
  return outcome;
}

async function ingestInbound(
  channel: { id: string; organizationId: string; brandId: string },
  contacts: WaContact[],
  m: WaInbound,
): Promise<boolean> {
  const organizationId = channel.organizationId;

  // Claim the wamid first: a WhatsApp retry of this delivery stops here.
  try {
    await db.webhookEvent.create({
      data: { organizationId, source: "whatsapp", eventType: "message", externalId: m.id, payload: m as unknown as Prisma.InputJsonValue, status: "PROCESSING" },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }

  const waId = toWhatsAppId("+" + m.from) ?? m.from;
  const profileName = contacts.find((c) => c.wa_id === m.from)?.profile?.name?.trim() || null;
  const { type, body, mediaId } = bodyOf(m);
  const sentAt = Number.isFinite(Number(m.timestamp)) ? new Date(Number(m.timestamp) * 1000) : new Date();

  const ref = extractRefCode(body);
  const link = ref
    ? await db.trackedLink.findFirst({ where: { shortCode: ref, organizationId }, select: { campaignId: true } })
    : null;

  const result = await db.$transaction(async (tx) => {
    const existing = await tx.contact.findUnique({ where: { organizationId_phone: { organizationId, phone: waId } } });
    const contact = existing
      ? await tx.contact.update({
          where: { id: existing.id },
          data: {
            name: existing.name ?? profileName,
            lastMessageAt: sentAt,
            // The first campaign that brought them keeps the credit.
            campaignId: existing.campaignId ?? link?.campaignId ?? null,
          },
        })
      : await tx.contact.create({
          data: {
            organizationId,
            brandId: channel.brandId,
            phone: waId,
            name: profileName,
            source: "WHATSAPP",
            campaignId: link?.campaignId ?? null,
            lastMessageAt: sentAt,
          },
        });

    const conversation = await tx.conversation.upsert({
      where: { channelId_contactId: { channelId: channel.id, contactId: contact.id } },
      create: {
        organizationId,
        channelId: channel.id,
        contactId: contact.id,
        lastInboundAt: sentAt,
        lastMessageAt: sentAt,
        lastMessagePreview: preview(type, body),
        unreadCount: 1,
      },
      update: {
        status: "OPEN",
        lastInboundAt: sentAt,
        lastMessageAt: sentAt,
        lastMessagePreview: preview(type, body),
        unreadCount: { increment: 1 },
      },
    });

    const message = await tx.message.create({
      data: {
        organizationId,
        conversationId: conversation.id,
        direction: "IN",
        type,
        body,
        mediaId,
        externalId: m.id,
        status: "RECEIVED",
        createdAt: sentAt,
      },
    });
    return { contact, isNew: !existing, conversation, message };
  });

  await db.webhookEvent.updateMany({
    where: { organizationId, externalId: m.id },
    data: { status: "PROCESSED", processedAt: new Date() },
  });

  const context = {
    conversationId: result.conversation.id,
    messageId: result.message.id,
    contactId: result.contact.id,
    body,
  };
  if (result.isNew) {
    await fireAutomations({ organizationId, brandId: channel.brandId, trigger: "LEAD_CREATED", eventKey: `lead:${result.contact.id}`, context });
  }
  await fireAutomations({ organizationId, brandId: channel.brandId, trigger: "MESSAGE_RECEIVED", eventKey: `msg:${result.message.id}`, context });
  return true;
}

const STATUS_RANK: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3 };

async function applyStatus(organizationId: string, s: WaStatus): Promise<void> {
  const next = s.status.toUpperCase();
  const message = await db.message.findUnique({
    where: { organizationId_externalId: { organizationId, externalId: s.id } },
    select: { id: true, status: true },
  });
  if (!message) return;
  if (next === "FAILED") {
    const reason = s.errors?.[0];
    await db.message.update({
      where: { id: message.id },
      data: { status: "FAILED", error: [reason?.title, reason?.message].filter(Boolean).join(": ").slice(0, 500) || "WhatsApp could not deliver it." },
    });
    return;
  }
  // Receipts can arrive out of order; never move backwards (READ then DELIVERED).
  if ((STATUS_RANK[next] ?? -1) > (STATUS_RANK[message.status] ?? -1)) {
    await db.message.update({ where: { id: message.id }, data: { status: next } });
  }
}

// ── sending ──────────────────────────────────────────────────────────────

export class OutsideServiceWindowError extends ApiError {
  constructor() {
    super(
      409,
      "OUTSIDE_SERVICE_WINDOW",
      "More than 24 hours have passed since the customer last wrote. WhatsApp only allows approved template messages until they write again.",
    );
  }
}

export async function sendWhatsAppText(
  conversationId: string,
  text: string,
  opts: { author: "PERSON" | "AUTOMATION" | "AI"; sentById?: string; automationId?: string },
) {
  const body = text.trim();
  if (!body) throw badRequest("Write a message first.");
  if (body.length > 4096) throw badRequest("WhatsApp messages are limited to 4,096 characters.");

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { channel: true, contact: { select: { id: true, phone: true, stage: true } } },
  });
  if (!conversation) throw notFound("Conversation not found.");
  const channel = conversation.channel;
  if (channel.status === "DISCONNECTED" || !channel.externalId) {
    throw new ApiError(409, "CHANNEL_DISCONNECTED", "This WhatsApp number is disconnected. Reconnect it under Channels.");
  }
  if (!insideServiceWindow(conversation.lastInboundAt)) throw new OutsideServiceWindowError();
  const token = channelToken(channel);
  if (!token) throw new ApiError(409, "CHANNEL_TOKEN_UNREADABLE", "The WhatsApp token cannot be read. Reconnect the number under Channels.");

  const message = await db.message.create({
    data: {
      organizationId: conversation.organizationId,
      conversationId,
      direction: "OUT",
      type: "text",
      body,
      status: "QUEUED",
      author: opts.author,
      sentById: opts.sentById ?? null,
      automationId: opts.automationId ?? null,
    },
  });

  try {
    const { messageId } = await meta().sendWhatsAppText({
      phoneNumberId: channel.externalId,
      token,
      to: conversation.contact.phone,
      body,
      app: await metaAppForChannel(channel),
    });
    const sent = await db.message.update({ where: { id: message.id }, data: { status: "SENT", externalId: messageId } });
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: sent.createdAt, lastMessagePreview: body.slice(0, 140), ...(opts.author === "PERSON" ? { unreadCount: 0 } : {}) },
    });
    if (opts.author === "PERSON" && conversation.contact.stage === "NEW") {
      await db.contact.update({ where: { id: conversation.contact.id }, data: { stage: "CONTACTED" } });
    }
    await db.socialChannel.update({ where: { id: channel.id }, data: { lastUsedAt: new Date() } });
    return sent;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await db.message.update({ where: { id: message.id }, data: { status: "FAILED", error: reason.slice(0, 500) } });
    throw new ApiError(502, "SEND_FAILED", error instanceof MetaApiError ? `WhatsApp did not accept the message: ${reason}` : reason);
  }
}

// ── inbox, for people ────────────────────────────────────────────────────

export async function listConversations(principal: Principal, filter: { status?: string; q?: string } = {}) {
  const q = filter.q?.trim();
  return db.conversation.findMany({
    where: {
      ...scope(principal),
      ...(filter.status ? { status: filter.status } : {}),
      ...(q
        ? { contact: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }] } }
        : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      contact: { select: { id: true, name: true, phone: true, stage: true, campaign: { select: { id: true, name: true } } } },
      channel: { select: { id: true, name: true, handle: true } },
    },
  });
}

export async function getConversation(principal: Principal, id: string) {
  const conversation = await db.conversation.findFirst({
    where: { id, ...scope(principal) },
    include: {
      contact: { include: { campaign: { select: { id: true, name: true } } } },
      channel: { select: { id: true, name: true, handle: true, status: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 300 },
    },
  });
  if (!conversation) throw notFound("Conversation not found.");
  return conversation;
}

/** Marks a conversation read here, and the customer's last message read on their phone (best effort). */
export async function markConversationRead(principal: Principal, id: string) {
  const conversation = await db.conversation.findFirst({ where: { id, ...scope(principal) }, include: { channel: true } });
  if (!conversation || conversation.unreadCount === 0) return;
  await db.conversation.update({ where: { id }, data: { unreadCount: 0 } });
  const lastIn = await db.message.findFirst({
    where: { conversationId: id, direction: "IN", externalId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { externalId: true },
  });
  const token = channelToken(conversation.channel);
  if (lastIn?.externalId && token && conversation.channel.externalId) {
    await meta()
      .markWhatsAppRead({
        phoneNumberId: conversation.channel.externalId,
        token,
        messageId: lastIn.externalId,
        app: await metaAppForChannel(conversation.channel),
      })
      .catch(() => undefined);
  }
}

export async function replyAsPerson(principal: Principal, conversationId: string, text: string, request?: Request) {
  const conversation = await db.conversation.findFirst({ where: { id: conversationId, ...scope(principal) }, select: { id: true } });
  if (!conversation) throw notFound("Conversation not found.");
  const message = await sendWhatsAppText(conversationId, text, { author: "PERSON", sentById: principal.userId });
  await auditAs(principal, "CREATE", "Message", message.id, { conversationId }, request);
  return message;
}

export async function updateConversation(principal: Principal, id: string, input: { status?: "OPEN" | "CLOSED"; automationsPaused?: boolean }) {
  const conversation = await db.conversation.findFirst({ where: { id, ...scope(principal) }, select: { id: true } });
  if (!conversation) throw notFound("Conversation not found.");
  return db.conversation.update({ where: { id }, data: input });
}

// ── leads ────────────────────────────────────────────────────────────────

export async function listContacts(principal: Principal, filter: { stage?: string; q?: string } = {}) {
  const q = filter.q?.trim();
  return db.contact.findMany({
    where: {
      ...scope(principal),
      ...(filter.stage && (STAGES as readonly string[]).includes(filter.stage) ? { stage: filter.stage } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/\D/g, "") || q } }] } : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      campaign: { select: { id: true, name: true } },
      brand: { select: { name: true } },
      conversations: { select: { id: true }, take: 1, orderBy: { lastMessageAt: "desc" } },
    },
  });
}

export async function updateContact(
  principal: Principal,
  id: string,
  input: { stage?: string; notes?: string | null; name?: string | null; tags?: string[] },
  request?: Request,
) {
  const contact = await db.contact.findFirst({ where: { id, ...scope(principal) }, select: { id: true, stage: true } });
  if (!contact) throw notFound("Contact not found.");
  if (input.stage && !(STAGES as readonly string[]).includes(input.stage)) throw badRequest("Unknown stage.");
  const updated = await db.contact.update({
    where: { id },
    data: {
      ...(input.stage ? { stage: input.stage } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
    },
  });
  await auditAs(principal, "UPDATE", "Contact", id, { from: contact.stage, to: input.stage }, request);
  return updated;
}

// ── development: a customer message without a phone ─────────────────────

/**
 * Builds the webhook payload WhatsApp would send and runs it through the real
 * ingestion path. Only available with the Meta simulator, so it cannot inject
 * messages into a live inbox.
 */
export async function simulateInbound(principal: Principal, input: { channelId: string; from: string; name?: string; body: string }) {
  if (meta().name !== "simulator") throw new ApiError(403, "SIMULATOR_ONLY", "Test messages are only available with the Meta simulator.");
  const channel = await db.socialChannel.findFirst({
    where: { id: input.channelId, organizationId: orgIdOf(principal), platform: "WHATSAPP", status: { not: "DISCONNECTED" } },
    select: { externalId: true },
  });
  if (!channel?.externalId) throw notFound("WhatsApp channel not found.");
  const waId = toWhatsAppId(input.from);
  if (!waId) throw badRequest("Enter a phone number, e.g. 0712 345 678.");
  const payload: WaWebhook = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "SIMULATED_WABA",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: channel.externalId },
              contacts: [{ wa_id: waId, profile: { name: input.name?.trim() || undefined } }],
              messages: [
                {
                  from: waId,
                  id: `wamid.SIMIN${crypto.randomBytes(12).toString("hex").toUpperCase()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: input.body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  return processWebhook(payload);
}
