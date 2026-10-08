import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { auditAs } from "@/lib/audit";
import { db } from "@/lib/db";
import { ASPECT_RATIOS, type GenerationMode } from "@/lib/generation-models";
import { MODULE_KEYS } from "@/lib/modules";
import type { Principal } from "@/lib/rbac";
import { describeSchedule, nextRunAt, normaliseSchedule, scheduleProblem, validTimeZone, type Schedule } from "@/lib/schedule";
import { orgIdOf } from "@/lib/tenant";

import { resolveModel } from "./ai-models";
import { draftCaption } from "./copywriter";
import { creditsFor, requestGeneration } from "./generation";
import { enqueue } from "./jobs";
import { notify } from "./notify";
import { getPricing } from "./pricing-store";
import { stockState } from "./products";
import { assertReady, AUTOPILOT_NEEDS, requirements } from "./readiness";
import { wallet } from "./credits";
import { composePrompt, resolveContext, type QuoteMeta } from "./studio";

/**
 * Autopilot: makes content on a schedule and posts it, or holds it for approval.
 *
 *   autopilot.tick     (worker, every minute)  finds autopilots whose time has come and queues one run per slot
 *   autopilot.run      (worker)                checks the essentials and the wallet, picks a product, starts a generation
 *   autopilot.finish   (worker)                when the picture or video is ready: writes the caption, then
 *                                              posts it (AUTO_POST) or holds it for approval (APPROVE_FIRST)
 *
 * Every step is safe to deliver twice: a slot has one AutopilotRun row (unique per autopilot and slot),
 * and each state change is a conditional update that only one caller can win. Nothing here throws a
 * run into a retry storm: a run that cannot go ahead is recorded as SKIPPED with the reason, and the
 * team is told.
 */

export const MODES_OF_AUTOPILOT = ["APPROVE_FIRST", "AUTO_POST"] as const;
export type AutopilotMode = (typeof MODES_OF_AUTOPILOT)[number];

/** A slot older than this when the worker gets to it is skipped rather than posted late. */
const MISSED_AFTER_MS = 6 * 3600_000;
/** After this many failed runs in a row the autopilot switches itself off. */
export const MAX_CONSECUTIVE_FAILURES = 3;
const GIVE_UP_AFTER_MS = 45 * 60_000;

const scheduleSchema = z.object({ days: z.array(z.number().int()).max(7), times: z.array(z.string().max(5)).max(8) });

export const autopilotSchema = z.object({
  name: z.string().trim().min(2, "Give it a name").max(80),
  brandId: z.string().min(1).max(40),
  mode: z.enum(MODES_OF_AUTOPILOT).default("APPROVE_FIRST"),
  contentKind: z.enum(["IMAGE", "VIDEO"]).default("IMAGE"),
  seconds: z.number().int().min(4).max(30).nullable().optional(),
  aspectRatio: z.enum(ASPECT_RATIOS).default("1:1"),
  productIds: z.array(z.string().max(40)).max(20).default([]),
  characterIds: z.array(z.string().max(40)).max(3).default([]),
  templateId: z.string().max(40).nullable().optional(),
  channelIds: z.array(z.string().max(40)).min(1, "Choose where to post").max(6),
  guidance: z.string().trim().max(600).default(""),
  schedule: scheduleSchema,
  monthlyCreditCap: z.number().int().min(1).max(1_000_000).nullable().optional(),
  enabled: z.boolean().optional(),
});
export type AutopilotInput = z.infer<typeof autopilotSchema>;
export const autopilotUpdateSchema = autopilotSchema.partial();

/** The person who set an autopilot up acts for it; this is a minimal stand-in for them inside the worker. */
function actingAs(organizationId: string, userId: string): Principal {
  return { userId, organizationId, role: "OWNER", extraPermissions: [], enabledModules: new Set<string>(MODULE_KEYS), mfa: true };
}

// ── checks shared by create and update ──────────────────────────────────

async function validateChoices(organizationId: string, input: Pick<AutopilotInput, "brandId" | "productIds" | "characterIds" | "templateId" | "channelIds">) {
  const brand = await db.brand.findFirst({ where: { id: input.brandId, organizationId, status: "ACTIVE" }, select: { id: true, timezone: true, name: true } });
  if (!brand) throw new ApiError(422, "VALIDATION_FAILED", "Pick one of your own brands.");
  if (input.productIds.length) {
    const n = await db.catalogueItem.count({ where: { id: { in: input.productIds }, organizationId, brandId: brand.id, status: "ACTIVE" } });
    if (n !== new Set(input.productIds).size) throw new ApiError(422, "VALIDATION_FAILED", "Choose products that belong to this brand.");
  }
  if (input.characterIds.length) {
    const n = await db.character.count({ where: { id: { in: input.characterIds }, organizationId, archivedAt: null } });
    if (n !== new Set(input.characterIds).size) throw new ApiError(422, "VALIDATION_FAILED", "One of the characters is not available.");
  }
  if (input.templateId) {
    const t = await db.template.findFirst({ where: { id: input.templateId, status: "PUBLISHED" }, select: { id: true } });
    if (!t) throw new ApiError(422, "VALIDATION_FAILED", "That template is not available.");
  }
  const channels = await db.socialChannel.findMany({
    where: { id: { in: input.channelIds }, organizationId, brandId: brand.id, status: "ACTIVE", archivedAt: null },
    select: { id: true, platform: true },
  });
  if (channels.length !== new Set(input.channelIds).size) throw new ApiError(422, "VALIDATION_FAILED", "Choose connected accounts that belong to this brand.");
  if (channels.some((c) => c.platform === "WHATSAPP")) throw new ApiError(422, "VALIDATION_FAILED", "WhatsApp numbers cannot publish to a feed. Choose a Facebook Page or Instagram account.");
  return brand;
}

function checkedSchedule(s: Schedule): Schedule {
  const problem = scheduleProblem(s);
  if (problem) throw new ApiError(422, "VALIDATION_FAILED", problem);
  return normaliseSchedule(s);
}

// ── views ───────────────────────────────────────────────────────────────

export interface RunView {
  id: string;
  slot: string;
  status: string;
  reason: string | null;
  caption: string | null;
  creditsSpent: number;
  createdAt: string;
  media: { type: "IMAGE" | "VIDEO"; url: string } | null;
  posts: Array<{ id: string; channel: string; platform: string; status: string; error: string | null }>;
}

/** What a run looks like to a person: once its posts exist, their state is the truth. */
export function displayStatus(runStatus: string, posts: Array<{ status: string }>): string {
  if (runStatus !== "SCHEDULED" || posts.length === 0) return runStatus;
  if (posts.every((p) => p.status === "PUBLISHED")) return "PUBLISHED";
  if (posts.some((p) => p.status === "FAILED")) return "POST_FAILED";
  return "SCHEDULED";
}

async function runViews(organizationId: string, runs: Array<{ id: string; slotKey: string; status: string; reason: string | null; caption: string | null; creditsSpent: number; createdAt: Date; assetId: string | null; postIds: string[] }>): Promise<RunView[]> {
  const assetIds = runs.map((r) => r.assetId).filter((x): x is string => Boolean(x));
  const postIds = runs.flatMap((r) => r.postIds);
  const [assets, posts] = await Promise.all([
    assetIds.length ? db.generatedAsset.findMany({ where: { id: { in: assetIds }, organizationId }, select: { id: true, mediaType: true, status: true } }) : [],
    postIds.length ? db.socialPost.findMany({ where: { id: { in: postIds }, organizationId }, select: { id: true, status: true, error: true, channel: { select: { name: true, platform: true } } } }) : [],
  ]);
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const postById = new Map(posts.map((p) => [p.id, p]));
  return runs.map((r) => {
    const ps = r.postIds.map((id) => postById.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const a = r.assetId ? assetById.get(r.assetId) : null;
    return {
      id: r.id,
      slot: r.slotKey,
      status: displayStatus(r.status, ps),
      reason: r.reason,
      caption: r.caption,
      creditsSpent: r.creditsSpent,
      createdAt: r.createdAt.toISOString(),
      media: a && a.status === "READY" ? { type: a.mediaType as "IMAGE" | "VIDEO", url: `/api/content/assets/${a.id}/file` } : null,
      posts: ps.map((p) => ({ id: p.id, channel: p.channel.name, platform: p.channel.platform, status: p.status, error: p.error })),
    };
  });
}

export interface AutopilotView {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  enabled: boolean;
  mode: string;
  contentKind: string;
  seconds: number | null;
  aspectRatio: string;
  productIds: string[];
  characterIds: string[];
  templateId: string | null;
  channelIds: string[];
  guidance: string;
  schedule: Schedule;
  scheduleText: string;
  timezone: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  monthlyCreditCap: number | null;
  pausedReason: string | null;
  awaiting: number;
}

type Row = Prisma.AutopilotGetPayload<{ include: { brand: { select: { name: true } } } }>;

function view(a: Row, awaiting = 0): AutopilotView {
  const schedule = a.schedule as unknown as Schedule;
  return {
    id: a.id,
    name: a.name,
    brandId: a.brandId,
    brandName: a.brand.name,
    enabled: a.enabled,
    mode: a.mode,
    contentKind: a.contentKind,
    seconds: a.seconds,
    aspectRatio: a.aspectRatio,
    productIds: a.productIds,
    characterIds: a.characterIds,
    templateId: a.templateId,
    channelIds: a.channelIds,
    guidance: a.guidance,
    schedule,
    scheduleText: describeSchedule(schedule),
    timezone: a.timezone,
    nextRunAt: a.nextRunAt?.toISOString() ?? null,
    lastRunAt: a.lastRunAt?.toISOString() ?? null,
    monthlyCreditCap: a.monthlyCreditCap,
    pausedReason: a.pausedReason,
    awaiting,
  };
}

export async function listAutopilots(organizationId: string): Promise<AutopilotView[]> {
  const [rows, waiting] = await Promise.all([
    db.autopilot.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, include: { brand: { select: { name: true } } } }),
    db.autopilotRun.groupBy({ by: ["autopilotId"], where: { organizationId, status: "AWAITING_APPROVAL" }, _count: true }),
  ]);
  const count = new Map(waiting.map((w) => [w.autopilotId, w._count]));
  return rows.map((r) => view(r, count.get(r.id) ?? 0));
}

export async function getAutopilot(principal: Principal, id: string): Promise<{ autopilot: AutopilotView; runs: RunView[] }> {
  const organizationId = orgIdOf(principal);
  const a = await db.autopilot.findFirst({ where: { id, organizationId }, include: { brand: { select: { name: true } } } });
  if (!a) throw new ApiError(404, "NOT_FOUND", "Autopilot not found.");
  const runs = await db.autopilotRun.findMany({ where: { autopilotId: id }, orderBy: { createdAt: "desc" }, take: 30 });
  const awaiting = runs.filter((r) => r.status === "AWAITING_APPROVAL").length;
  return { autopilot: view(a, awaiting), runs: await runViews(organizationId, runs) };
}

/** Runs waiting for a person's approval across the organisation, newest first. */
export async function awaitingApproval(organizationId: string): Promise<Array<RunView & { autopilotId: string; autopilotName: string }>> {
  const runs = await db.autopilotRun.findMany({
    where: { organizationId, status: "AWAITING_APPROVAL" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { autopilot: { select: { name: true } } },
  });
  const views = await runViews(organizationId, runs);
  return views.map((v, i) => ({ ...v, autopilotId: runs[i]!.autopilotId, autopilotName: runs[i]!.autopilot.name }));
}

export async function countAwaiting(organizationId: string): Promise<number> {
  return db.autopilotRun.count({ where: { organizationId, status: "AWAITING_APPROVAL" } });
}

// ── create, change, delete ──────────────────────────────────────────────

export async function createAutopilot(principal: Principal, input: AutopilotInput, request?: Request): Promise<AutopilotView> {
  const organizationId = orgIdOf(principal);
  const brand = await validateChoices(organizationId, input);
  const schedule = checkedSchedule(input.schedule);
  const timezone = validTimeZone(brand.timezone) ? brand.timezone : "Africa/Nairobi";
  const enabled = input.enabled ?? true;
  if (enabled) await assertReady(organizationId, AUTOPILOT_NEEDS, { brandId: brand.id });
  const created = await db.autopilot.create({
    data: {
      organizationId,
      brandId: brand.id,
      name: input.name,
      enabled,
      mode: input.mode,
      contentKind: input.contentKind,
      seconds: input.contentKind === "VIDEO" ? (input.seconds ?? 10) : null,
      aspectRatio: input.aspectRatio,
      productIds: input.productIds,
      characterIds: input.characterIds,
      templateId: input.templateId ?? null,
      channelIds: input.channelIds,
      guidance: input.guidance,
      schedule: schedule as unknown as Prisma.InputJsonValue,
      timezone,
      monthlyCreditCap: input.monthlyCreditCap ?? null,
      nextRunAt: enabled ? nextRunAt(schedule, timezone, new Date()) : null,
      createdById: principal.userId,
    },
  });
  await auditAs(principal, "AUTOPILOT_CREATE", "Autopilot", created.id, { name: created.name, mode: created.mode }, request);
  return (await getAutopilot(principal, created.id)).autopilot;
}

export async function updateAutopilot(principal: Principal, id: string, input: z.infer<typeof autopilotUpdateSchema>, request?: Request): Promise<AutopilotView> {
  const organizationId = orgIdOf(principal);
  const existing = await db.autopilot.findFirst({ where: { id, organizationId } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Autopilot not found.");

  const merged = {
    brandId: input.brandId ?? existing.brandId,
    productIds: input.productIds ?? existing.productIds,
    characterIds: input.characterIds ?? existing.characterIds,
    templateId: input.templateId === undefined ? existing.templateId : input.templateId,
    channelIds: input.channelIds ?? existing.channelIds,
  };
  const brand = await validateChoices(organizationId, merged);
  const schedule = input.schedule ? checkedSchedule(input.schedule) : (existing.schedule as unknown as Schedule);
  const timezone = validTimeZone(brand.timezone) ? brand.timezone : existing.timezone;
  const enabled = input.enabled ?? existing.enabled;
  if (enabled && (!existing.enabled || input.brandId || input.channelIds)) await assertReady(organizationId, AUTOPILOT_NEEDS, { brandId: brand.id });
  const contentKind = input.contentKind ?? existing.contentKind;

  await db.autopilot.update({
    where: { id },
    data: {
      name: input.name,
      brandId: merged.brandId,
      mode: input.mode,
      contentKind,
      seconds: contentKind === "VIDEO" ? (input.seconds ?? existing.seconds ?? 10) : null,
      aspectRatio: input.aspectRatio,
      productIds: input.productIds,
      characterIds: input.characterIds,
      templateId: input.templateId,
      channelIds: input.channelIds,
      guidance: input.guidance,
      schedule: input.schedule ? (schedule as unknown as Prisma.InputJsonValue) : undefined,
      timezone,
      monthlyCreditCap: input.monthlyCreditCap,
      enabled,
      // Switching on (or changing the schedule) works out the next slot afresh and clears an old pause.
      nextRunAt: enabled ? (input.schedule || !existing.enabled || !existing.nextRunAt ? nextRunAt(schedule, timezone, new Date()) : existing.nextRunAt) : null,
      ...(enabled && !existing.enabled ? { consecutiveFailures: 0, pausedReason: null } : {}),
    },
  });
  await auditAs(principal, "AUTOPILOT_UPDATE", "Autopilot", id, { fields: Object.keys(input) }, request);
  return (await getAutopilot(principal, id)).autopilot;
}

export async function deleteAutopilot(principal: Principal, id: string, request?: Request): Promise<void> {
  const existing = await db.autopilot.findFirst({ where: { id, organizationId: orgIdOf(principal) }, select: { id: true } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Autopilot not found.");
  await db.autopilot.delete({ where: { id } });
  await auditAs(principal, "AUTOPILOT_DELETE", "Autopilot", id, {}, request);
}

/** Makes one post now so the person can see what Autopilot will do. It always waits for approval. */
export async function runNow(principal: Principal, id: string, request?: Request): Promise<{ queued: true }> {
  const organizationId = orgIdOf(principal);
  const a = await db.autopilot.findFirst({ where: { id, organizationId }, select: { id: true, brandId: true } });
  if (!a) throw new ApiError(404, "NOT_FOUND", "Autopilot not found.");
  await assertReady(organizationId, AUTOPILOT_NEEDS, { brandId: a.brandId });
  const slot = `manual-${Date.now()}`;
  await enqueue("autopilot.run", { autopilotId: id, slot, manual: true }, { organizationId, dedupeKey: `autopilot:${id}:${slot}`, maxAttempts: 2 });
  await auditAs(principal, "AUTOPILOT_RUN", "Autopilot", id, { manual: true }, request);
  return { queued: true };
}

// ── approvals ───────────────────────────────────────────────────────────

export async function approveRun(principal: Principal, runId: string, edit: { caption?: string } = {}, request?: Request): Promise<void> {
  const organizationId = orgIdOf(principal);
  const run = await db.autopilotRun.findFirst({ where: { id: runId, organizationId } });
  if (!run) throw new ApiError(404, "NOT_FOUND", "Nothing to approve.");
  const won = await db.autopilotRun.updateMany({ where: { id: runId, status: "AWAITING_APPROVAL" }, data: { status: "SCHEDULED", reason: null } });
  if (won.count !== 1) throw new ApiError(409, "CONFLICT", "This one was already approved or rejected.");

  const when = new Date();
  const caption = edit.caption?.trim();
  const posts = await db.socialPost.findMany({ where: { id: { in: run.postIds }, organizationId, status: "DRAFT" } });
  for (const p of posts) {
    const content = p.content as unknown as { text?: string; assetId?: string | null; link?: string | null };
    await db.socialPost.update({
      where: { id: p.id },
      data: {
        status: "SCHEDULED",
        scheduledAt: when,
        approvedById: principal.userId,
        approvedAt: when,
        content: (caption ? { ...content, text: caption } : content) as unknown as Prisma.InputJsonValue,
      },
    });
    await enqueue("publish.post", { postId: p.id }, { runAt: when, organizationId, dedupeKey: `publish:${p.id}:0`, maxAttempts: 4 });
  }
  if (caption) await db.autopilotRun.update({ where: { id: runId }, data: { caption } });
  await auditAs(principal, "AUTOPILOT_APPROVE", "AutopilotRun", runId, { posts: posts.length, edited: Boolean(caption) }, request);
}

export async function rejectRun(principal: Principal, runId: string, request?: Request): Promise<void> {
  const organizationId = orgIdOf(principal);
  const run = await db.autopilotRun.findFirst({ where: { id: runId, organizationId } });
  if (!run) throw new ApiError(404, "NOT_FOUND", "Nothing to reject.");
  const won = await db.autopilotRun.updateMany({ where: { id: runId, status: "AWAITING_APPROVAL" }, data: { status: "REJECTED", reason: "Not approved" } });
  if (won.count !== 1) throw new ApiError(409, "CONFLICT", "This one was already approved or rejected.");
  await db.socialPost.updateMany({ where: { id: { in: run.postIds }, organizationId, status: "DRAFT" }, data: { status: "ARCHIVED" } });
  await auditAs(principal, "AUTOPILOT_REJECT", "AutopilotRun", runId, {}, request);
}

// ── the worker ──────────────────────────────────────────────────────────

/** Switches an autopilot off and tells the owners why. */
async function pause(autopilotId: string, organizationId: string, name: string, reason: string): Promise<void> {
  await db.autopilot.updateMany({ where: { id: autopilotId, enabled: true }, data: { enabled: false, nextRunAt: null, pausedReason: reason } });
  await notify({
    event: "autopilot.paused",
    organizationId,
    title: `Autopilot “${name}” switched itself off`,
    body: reason,
    href: `/app/autopilot/${autopilotId}`,
  }).catch((e) => console.error("[autopilot] pause notice", e));
}

async function recordFailure(autopilotId: string, organizationId: string, name: string, reason: string): Promise<void> {
  const a = await db.autopilot.update({ where: { id: autopilotId }, data: { consecutiveFailures: { increment: 1 } }, select: { consecutiveFailures: true } });
  if (a.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    await pause(autopilotId, organizationId, name, `${MAX_CONSECUTIVE_FAILURES} posts in a row did not work. The last problem: ${reason}`);
  }
}

async function skip(runId: string, a: { id: string; organizationId: string; name: string }, reason: string, tell = true): Promise<void> {
  await db.autopilotRun.update({ where: { id: runId }, data: { status: "SKIPPED", reason: reason.slice(0, 300) } });
  if (tell) {
    await notify({
      event: "autopilot.skipped",
      organizationId: a.organizationId,
      title: `Autopilot “${a.name}” skipped a post`,
      body: reason,
      href: `/app/autopilot/${a.id}`,
    }).catch((e) => console.error("[autopilot] skip notice", e));
  }
}

/** Every minute: queue a run for each autopilot whose slot has arrived, and move it on to its next slot. */
export async function autopilotTick(now = new Date()): Promise<number> {
  const due = await db.autopilot.findMany({ where: { enabled: true, nextRunAt: { lte: now } }, take: 100 });
  let queued = 0;
  for (const a of due) {
    const slot = a.nextRunAt!;
    const next = nextRunAt(a.schedule as unknown as Schedule, a.timezone, now > slot ? now : slot);
    // Only the caller that moves nextRunAt off this slot queues it.
    const moved = await db.autopilot.updateMany({ where: { id: a.id, nextRunAt: slot }, data: { nextRunAt: next } });
    if (moved.count !== 1) continue;
    await enqueue("autopilot.run", { autopilotId: a.id, slot: slot.toISOString() }, {
      organizationId: a.organizationId,
      dedupeKey: `autopilot:${a.id}:${slot.toISOString()}`,
      maxAttempts: 2,
    });
    queued++;
  }
  return queued;
}

export async function runAutopilot(autopilotId: string, slot: string, manual = false, now = new Date()): Promise<void> {
  const a = await db.autopilot.findUnique({ where: { id: autopilotId }, include: { brand: { select: { name: true } } } });
  if (!a) return;
  if (!a.enabled && !manual) return;

  // One row per slot: a second delivery of the same job finds it and stops. (The unique key is the real
  // guard when two deliveries race; this look-up only keeps the log quiet in the usual case.)
  if (await db.autopilotRun.findUnique({ where: { autopilotId_slotKey: { autopilotId: a.id, slotKey: slot } }, select: { id: true } })) return;
  let run;
  try {
    run = await db.autopilotRun.create({ data: { autopilotId: a.id, organizationId: a.organizationId, slotKey: slot, status: "PLANNED" } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return;
    throw e;
  }
  const org = a.organizationId;
  const who = { id: a.id, organizationId: org, name: a.name };

  if (!manual) {
    const at = new Date(slot).getTime();
    if (Number.isFinite(at) && now.getTime() - at > MISSED_AFTER_MS) return skip(run.id, who, "The server was not running at the scheduled time, so this post was skipped rather than sent late.", false);
  }

  const member = await db.membership.findFirst({ where: { userId: a.createdById, organizationId: org, status: "ACTIVE" }, select: { id: true } });
  if (!member) {
    await skip(run.id, who, "The person who set this up is no longer on the team.", false);
    return pause(a.id, org, a.name, "The person who set this up is no longer on the team. Open it, check the settings and switch it on again.");
  }

  // The essentials, checked again now: things change between setting up and running.
  const unmet = (await requirements(org, AUTOPILOT_NEEDS.filter((n) => n !== "credits"), { brandId: a.brandId })).filter((r) => !r.ok);
  if (unmet.length > 0) {
    const channelGone = unmet.some((r) => r.key === "channel");
    await skip(run.id, who, `Needs attention first: ${unmet.map((r) => r.title.toLowerCase()).join("; ")}.`);
    if (channelGone) await pause(a.id, org, a.name, "The connected Facebook or Instagram account is no longer connected. Reconnect it, then switch Autopilot on again.");
    return;
  }
  const channels = await db.socialChannel.findMany({ where: { id: { in: a.channelIds }, organizationId: org, status: "ACTIVE", archivedAt: null }, select: { id: true } });
  if (channels.length !== a.channelIds.length) {
    await skip(run.id, who, "One of the chosen accounts is no longer connected.");
    return pause(a.id, org, a.name, "One of the chosen Facebook or Instagram accounts is no longer connected. Reconnect it or remove it from this Autopilot, then switch it on again.");
  }

  // Which product: the next one in the list that is still in stock.
  let productId: string | null = null;
  if (a.productIds.length > 0) {
    const rows = await db.catalogueItem.findMany({ where: { id: { in: a.productIds }, organizationId: org, status: "ACTIVE" }, select: { id: true, trackStock: true, stockQty: true, lowStockAt: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const available = a.productIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r) && !stockState(r!).outOfStock);
    if (available.length === 0) return skip(run.id, who, "Everything on the product list is out of stock or archived.");
    productId = available[a.rotation % available.length]!.id;
  }

  // Credits: today's price, this month's cap, and what is in the wallet.
  const mode: GenerationMode = a.contentKind === "VIDEO" ? "video" : "image";
  const pricing = await getPricing();
  const model = await resolveModel(mode, null);
  const cost = creditsFor(pricing, mode, a.seconds ?? undefined, model);
  if (a.monthlyCreditCap !== null) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const spent = await db.autopilotRun.aggregate({ where: { autopilotId: a.id, createdAt: { gte: monthStart } }, _sum: { creditsSpent: true } });
    if ((spent._sum.creditsSpent ?? 0) + cost > a.monthlyCreditCap) {
      return skip(run.id, who, `This month's limit of ${a.monthlyCreditCap} credits would be passed. It starts again next month, or raise the limit.`);
    }
  }
  const w = await wallet(org);
  if (!w.unmetered && w.credits < cost) return skip(run.id, who, `Not enough credits: this post needs ${cost} and the wallet has ${w.credits}. Top up to keep Autopilot going.`);

  // Build the request exactly as the Studio would.
  const brandName = a.brand.name;
  const product = productId ? await db.catalogueItem.findUnique({ where: { id: productId }, select: { name: true } }) : null;
  const ownWords = a.guidance.trim() || `A fresh social media ${a.contentKind === "VIDEO" ? "video" : "picture"} for ${brandName}${product ? `, showing ${product.name}` : ""}`;
  const resolved = await resolveContext(org, { brandId: a.brandId, productId, characterIds: a.characterIds, templateId: a.templateId });
  const meta: QuoteMeta = { mode, prompt: ownWords, seconds: a.seconds, aspectRatio: a.aspectRatio as QuoteMeta["aspectRatio"], parentAssetId: null, ...resolved };
  const prompt = await composePrompt(org, meta);

  try {
    const asset = await requestGeneration({
      organizationId: org,
      userId: a.createdById,
      mode,
      prompt,
      seconds: a.seconds ?? undefined,
      aspectRatio: meta.aspectRatio,
      brandId: a.brandId,
      context: {
        templateId: resolved.templateId ?? null,
        characterIds: resolved.characterIds ?? [],
        brandId: resolved.brandId ?? null,
        productId: resolved.productId ?? null,
        startImage: mode === "video" ? (resolved.startImage ?? null) : null,
      },
    });
    await db.autopilotRun.update({ where: { id: run.id }, data: { status: "GENERATING", assetId: asset.id, creditsSpent: asset.tokensCharged } });
    await db.autopilot.update({ where: { id: a.id }, data: { rotation: { increment: 1 }, lastRunAt: now } });
    await enqueue("autopilot.finish", { runId: run.id, n: 0 }, {
      organizationId: org,
      runAt: new Date(Date.now() + 20_000),
      dedupeKey: `autopilot.finish:${run.id}:0`,
      maxAttempts: 3,
    });
  } catch (e) {
    if (e instanceof ApiError && (e.code === "INSUFFICIENT_CREDITS" || e.code === "PARALLEL_LIMIT")) {
      return skip(run.id, who, e.code === "PARALLEL_LIMIT" ? "Your plan was busy making other content at that moment." : "Not enough credits for this post.");
    }
    const reason = e instanceof Error ? e.message : String(e);
    await db.autopilotRun.update({ where: { id: run.id }, data: { status: "FAILED", reason: reason.slice(0, 300) } });
    await recordFailure(a.id, org, a.name, reason);
  }
}

/** The caption: written by the AI writer from the brand's facts, or a plain line if the writer is not available. */
async function captionFor(a: { organizationId: string; createdById: string; brandId: string; guidance: string; brand: { name: string; slogan: string | null } }, productId: string | null, platform: "FACEBOOK" | "INSTAGRAM"): Promise<string> {
  const product = productId ? await db.catalogueItem.findUnique({ where: { id: productId }, select: { name: true, description: true } }) : null;
  const brief = `${product ? `Announce ${product.name}. ` : `A post for ${a.brand.name}. `}${a.guidance}`.trim();
  try {
    const r = await draftCaption(actingAs(a.organizationId, a.createdById), { brandId: a.brandId, platform, brief });
    if (r.caption.trim()) return r.caption.trim();
  } catch (e) {
    console.error("[autopilot] caption writer failed, using a plain caption", e);
  }
  return [product ? product.name : a.brand.name, a.brand.slogan].filter(Boolean).join(". ");
}

export async function finishAutopilotRun(runId: string, n = 0): Promise<void> {
  const run = await db.autopilotRun.findUnique({ where: { id: runId } });
  if (!run || !run.assetId) return;
  const a = await db.autopilot.findUnique({ where: { id: run.autopilotId }, include: { brand: { select: { name: true, slogan: true } } } });
  if (!a) return;
  const org = run.organizationId;
  const asset = await db.generatedAsset.findUnique({ where: { id: run.assetId }, select: { status: true, error: true, createdAt: true, metadata: true } });
  if (!asset) return;

  if (run.status !== "GENERATING" && run.status !== "FINISHING") return;

  if (asset.status === "GENERATING") {
    if (Date.now() - asset.createdAt.getTime() > GIVE_UP_AFTER_MS) {
      await db.autopilotRun.update({ where: { id: runId }, data: { status: "FAILED", reason: "The picture or video took too long to make." } });
      return recordFailure(a.id, org, a.name, "The picture or video took too long to make.");
    }
    await enqueue("autopilot.finish", { runId, n: n + 1 }, {
      organizationId: org,
      runAt: new Date(Date.now() + Math.min(120_000, 20_000 * (n + 1))),
      dedupeKey: `autopilot.finish:${runId}:${n + 1}`,
      maxAttempts: 3,
    });
    return;
  }
  if (asset.status !== "READY") {
    const reason = asset.error ?? "The picture or video could not be made.";
    await db.autopilotRun.update({ where: { id: runId }, data: { status: "FAILED", reason: reason.slice(0, 300) } });
    return recordFailure(a.id, org, a.name, reason);
  }

  // Only one caller gets to write the caption and make the posts.
  const stale = new Date(Date.now() - 10 * 60_000);
  const won = await db.autopilotRun.updateMany({
    where: { id: runId, OR: [{ status: "GENERATING" }, { status: "FINISHING", updatedAt: { lt: stale } }] },
    data: { status: "FINISHING" },
  });
  if (won.count !== 1) return;

  try {
    const productId = (asset.metadata as { productId?: string } | null)?.productId ?? null;
    const channels = await db.socialChannel.findMany({ where: { id: { in: a.channelIds }, organizationId: org, status: "ACTIVE", archivedAt: null }, select: { id: true, brandId: true, platform: true, name: true } });
    if (channels.length === 0) throw new Error("None of the chosen accounts is connected any more.");
    const captions = new Map<string, string>();
    for (const platform of new Set(channels.map((c) => c.platform))) {
      captions.set(platform, await captionFor(a, productId, platform === "INSTAGRAM" ? "INSTAGRAM" : "FACEBOOK"));
    }
    const autoPost = a.mode === "AUTO_POST" && !run.slotKey.startsWith("manual-");
    const when = new Date();
    const postIds: string[] = [];
    for (const c of channels) {
      const content = { text: captions.get(c.platform) ?? "", assetId: run.assetId, link: null };
      const post = await db.socialPost.create({
        data: {
          organizationId: org,
          brandId: c.brandId,
          channelId: c.id,
          content: content as unknown as Prisma.InputJsonValue,
          status: autoPost ? "SCHEDULED" : "DRAFT",
          scheduledAt: autoPost ? when : null,
          createdById: a.createdById,
          approvedById: autoPost ? a.createdById : null,
          approvedAt: autoPost ? when : null,
        },
        select: { id: true },
      });
      postIds.push(post.id);
      if (autoPost) await enqueue("publish.post", { postId: post.id }, { runAt: when, organizationId: org, dedupeKey: `publish:${post.id}:0`, maxAttempts: 4 });
    }
    await db.autopilotRun.update({
      where: { id: runId },
      data: { status: autoPost ? "SCHEDULED" : "AWAITING_APPROVAL", postIds, caption: [...captions.values()][0] ?? null, reason: autoPost ? null : "Waiting for your approval" },
    });
    await db.autopilot.update({ where: { id: a.id }, data: { consecutiveFailures: 0 } });
    await notify(
      autoPost
        ? { event: "autopilot.posted", organizationId: org, title: `Autopilot “${a.name}” posted`, body: (captions.values().next().value as string | undefined)?.slice(0, 140) ?? "A new post is on its way.", href: `/app/autopilot/${a.id}` }
        : { event: "autopilot.needs_approval", organizationId: org, title: `A post from “${a.name}” is waiting for you`, body: "Look it over, change the caption if you like, then approve it.", href: `/app/autopilot/${a.id}` },
    ).catch((e) => console.error("[autopilot] notice", e));
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await db.autopilotRun.update({ where: { id: runId }, data: { status: "FAILED", reason: reason.slice(0, 300) } });
    await recordFailure(a.id, org, a.name, reason);
  }
}
