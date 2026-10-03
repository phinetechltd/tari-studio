import "server-only";

import { Prisma } from "@prisma/client";

import { conflict, notFound } from "@/lib/api";
import { auditAs } from "@/lib/audit";
import {
  ActionSchema,
  AutomationInputSchema,
  MessageConditionsSchema,
  messageMatches,
  renderTemplate,
  type Action,
  type AutomationInput,
  type Trigger,
} from "@/lib/automation-rules";
import { db } from "@/lib/db";
import type { Principal } from "@/lib/rbac";
import { orgIdOf, scope } from "@/lib/tenant";

import { draftWhatsAppReply } from "./copywriter";
import { enqueue } from "./jobs";
import { notify } from "./notify";
import { sendWhatsAppText } from "./whatsapp";

/**
 * Automations: "when this happens, do that".
 *
 * An event (a WhatsApp message, a new lead, a post going out or failing) calls
 * `fireAutomations`, which enqueues one `automation.run` job per matching rule.
 * The job runs the rule's actions in order. The (automation, event) pair is
 * unique in AutomationRun, so a redelivered webhook or a retried job can never
 * send a customer the same reply twice.
 */

export interface AutomationContext {
  conversationId?: string;
  messageId?: string;
  contactId?: string;
  body?: string | null;
  postId?: string;
  channelName?: string;
  brandName?: string;
  url?: string | null;
  error?: string;
}

export interface AutomationEvent {
  organizationId: string;
  brandId: string | null;
  trigger: Trigger;
  /** Stable per event, e.g. "msg:<messageId>" — the idempotency key. */
  eventKey: string;
  context: AutomationContext;
}

export async function fireAutomations(event: AutomationEvent): Promise<number> {
  const rules = await db.automation.findMany({
    where: {
      organizationId: event.organizationId,
      trigger: event.trigger,
      enabled: true,
      OR: [{ brandId: null }, ...(event.brandId ? [{ brandId: event.brandId }] : [])],
    },
    select: { id: true, conditions: true },
  });

  let queued = 0;
  for (const rule of rules) {
    if (event.trigger === "MESSAGE_RECEIVED") {
      const conditions = MessageConditionsSchema.safeParse(rule.conditions);
      if (conditions.success && !messageMatches(conditions.data, event.context.body ?? null)) continue;
    }
    const id = await enqueue(
      "automation.run",
      { automationId: rule.id, eventKey: event.eventKey, context: event.context } as unknown as Prisma.InputJsonValue,
      { organizationId: event.organizationId, dedupeKey: `automation:${rule.id}:${event.eventKey}`, maxAttempts: 3 },
    );
    if (id) queued++;
  }
  return queued;
}

interface RunPayload {
  automationId: string;
  eventKey: string;
  context: AutomationContext;
}

/** The `automation.run` job. Records every outcome; only infrastructure failures throw. */
export async function runAutomation(payload: RunPayload): Promise<void> {
  const automation = await db.automation.findUnique({
    where: { id: payload.automationId },
    include: { brand: { select: { name: true } } },
  });
  if (!automation) return;

  let runId: string;
  try {
    const run = await db.automationRun.create({
      data: {
        automationId: automation.id,
        organizationId: automation.organizationId,
        eventKey: payload.eventKey,
        status: "RUNNING",
      },
      select: { id: true },
    });
    runId = run.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Already answered this event. A RUNNING leftover means a worker died
      // mid-run; it may have replied already, so it is closed, not re-run.
      await db.automationRun.updateMany({
        where: { automationId: automation.id, eventKey: payload.eventKey, status: "RUNNING" },
        data: { status: "FAILED", error: "Interrupted before it finished; not re-run in case a reply already went out.", finishedAt: new Date() },
      });
      return;
    }
    throw error;
  }

  const finish = async (status: "SUCCEEDED" | "FAILED" | "SKIPPED", detail: unknown, error?: string) => {
    await db.automationRun.update({
      where: { id: runId },
      data: { status, detail: detail as Prisma.InputJsonValue, error: error?.slice(0, 1000) ?? null, finishedAt: new Date() },
    });
    if (status !== "SKIPPED") {
      await db.automation.update({ where: { id: automation.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });
    }
  };

  if (!automation.enabled) return finish("SKIPPED", { reason: "Switched off before it ran." });

  const ctx = payload.context;
  const conversation = ctx.conversationId
    ? await db.conversation.findFirst({
        where: { id: ctx.conversationId, organizationId: automation.organizationId },
        include: { contact: true, channel: { select: { brand: { select: { name: true } } } } },
      })
    : null;
  if (conversation?.automationsPaused) return finish("SKIPPED", { reason: "Automations are paused on this conversation." });

  const actions = (Array.isArray(automation.actions) ? automation.actions : [])
    .map((a) => ActionSchema.safeParse(a))
    .filter((r): r is { success: true; data: Action } => r.success)
    .map((r) => r.data);

  const steps: Array<{ type: string; ok: boolean; note?: string }> = [];
  // A rule for "every brand" speaks as the brand whose number received the message.
  const vars = {
    name: conversation?.contact.name,
    brand: automation.brand?.name ?? conversation?.channel.brand.name ?? ctx.brandName ?? null,
    message: ctx.body ?? null,
  };

  for (const action of actions) {
    try {
      const note = await perform(action, automation.organizationId, automation.id, conversation, vars, ctx);
      steps.push({ type: action.type, ok: true, ...(note ? { note } : {}) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ type: action.type, ok: false, note: message.slice(0, 300) });
      // Later steps often depend on earlier ones (a tag after a reply); stop here.
      return finish("FAILED", { steps }, message);
    }
  }
  return finish("SUCCEEDED", { steps });
}

type ConversationWithContact = Prisma.ConversationGetPayload<{ include: { contact: true; channel: { select: { brand: { select: { name: true } } } } } }>;

async function perform(
  action: Action,
  organizationId: string,
  automationId: string,
  conversation: ConversationWithContact | null,
  vars: { name?: string | null; brand?: string | null; message?: string | null },
  ctx: AutomationContext,
): Promise<string | undefined> {
  const needConversation = () => {
    if (!conversation) throw new Error("This step needs a WhatsApp conversation, and the event had none.");
    return conversation;
  };

  switch (action.type) {
    case "SEND_REPLY": {
      const c = needConversation();
      await sendWhatsAppText(c.id, renderTemplate(action.text, vars), { author: "AUTOMATION", automationId });
      return undefined;
    }
    case "AI_REPLY": {
      const c = needConversation();
      const reply = await draftWhatsAppReply({ organizationId, conversationId: c.id, instructions: action.instructions });
      await sendWhatsAppText(c.id, reply, { author: "AI", automationId });
      return `${reply.length} characters`;
    }
    case "SET_STAGE": {
      const c = needConversation();
      await db.contact.update({ where: { id: c.contactId }, data: { stage: action.stage } });
      return action.stage;
    }
    case "ADD_TAG": {
      const c = needConversation();
      const tags = Array.isArray(c.contact.tags) ? (c.contact.tags as string[]) : [];
      if (!tags.includes(action.tag)) {
        await db.contact.update({ where: { id: c.contactId }, data: { tags: [...tags, action.tag] } });
      }
      return action.tag;
    }
    case "NOTIFY_TEAM": {
      const href = conversation ? `/app/inbox?c=${conversation.id}` : ctx.postId ? "/app/social" : "/app";
      const body = conversation
        ? `${conversation.contact.name ?? conversation.contact.phone}: ${(ctx.body ?? "").slice(0, 140)}`
        : ctx.error ?? ctx.url ?? ctx.channelName ?? null;
      const sent = await notify({ event: "automation.notify", organizationId, title: renderTemplate(action.message, vars).slice(0, 200), body, href });
      return `${sent.recipients} people`;
    }
  }
}

// ── management ───────────────────────────────────────────────────────────

async function assertBrand(principal: Principal, brandId: string | null) {
  if (!brandId) return;
  const brand = await db.brand.findFirst({ where: { id: brandId, ...scope(principal) }, select: { id: true } });
  if (!brand) throw notFound("Brand not found.");
}

export async function listAutomations(principal: Principal) {
  return db.automation.findMany({
    where: scope(principal),
    orderBy: [{ enabled: "desc" }, { createdAt: "desc" }],
    include: { brand: { select: { name: true } } },
  });
}

export async function createAutomation(principal: Principal, raw: unknown) {
  const input: AutomationInput = AutomationInputSchema.parse(raw);
  await assertBrand(principal, input.brandId);
  const automation = await db.automation.create({
    data: {
      organizationId: orgIdOf(principal),
      brandId: input.brandId,
      name: input.name,
      trigger: input.trigger,
      conditions: input.conditions as Prisma.InputJsonValue,
      actions: input.actions as Prisma.InputJsonValue,
      enabled: input.enabled,
      createdById: principal.userId,
    },
  });
  await auditAs(principal, "CREATE", "Automation", automation.id, { name: input.name, trigger: input.trigger });
  return automation;
}

async function ownedAutomation(principal: Principal, id: string) {
  const automation = await db.automation.findFirst({ where: { id, ...scope(principal) } });
  if (!automation) throw notFound("Automation not found.");
  return automation;
}

export async function updateAutomation(principal: Principal, id: string, raw: unknown) {
  await ownedAutomation(principal, id);
  const input = AutomationInputSchema.parse(raw);
  await assertBrand(principal, input.brandId);
  const automation = await db.automation.update({
    where: { id },
    data: {
      brandId: input.brandId,
      name: input.name,
      trigger: input.trigger,
      conditions: input.conditions as Prisma.InputJsonValue,
      actions: input.actions as Prisma.InputJsonValue,
      enabled: input.enabled,
    },
  });
  await auditAs(principal, "UPDATE", "Automation", id, { name: input.name, enabled: input.enabled });
  return automation;
}

export async function setAutomationEnabled(principal: Principal, id: string, enabled: boolean) {
  await ownedAutomation(principal, id);
  const automation = await db.automation.update({ where: { id }, data: { enabled } });
  await auditAs(principal, enabled ? "ACTIVATE" : "SUSPEND", "Automation", id);
  return automation;
}

export async function deleteAutomation(principal: Principal, id: string) {
  const automation = await ownedAutomation(principal, id);
  if (automation.enabled) throw conflict("Switch the automation off before deleting it.");
  await db.automation.delete({ where: { id } });
  await auditAs(principal, "DELETE", "Automation", id, { name: automation.name });
}

export async function recentRuns(principal: Principal, take = 30) {
  return db.automationRun.findMany({
    where: scope(principal),
    orderBy: { createdAt: "desc" },
    take,
    include: { automation: { select: { name: true, trigger: true } } },
  });
}
