import "server-only";

import type { GeneratedAsset, Prisma, StudioMessage } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { formatKES } from "@/lib/money";
import { ASPECT_RATIOS, fitQuote, isAspectRatio, MODES, secondsAllowed, secondsLabel, FAMILIES, type CatalogueModel } from "@/lib/generation-models";
import { creditsToCents, VIDEO_MAX_SECONDS, VIDEO_MIN_SECONDS, type Pricing } from "@/lib/pricing";
import { DEFAULT_VIDEO_SECONDS, interpret, type Intent } from "@/lib/studio-intent";

import { modelByKey, modelsForMode, resolveModel } from "./ai-models";
import { assetView, creditsFor, requestGeneration, type AssetView } from "./generation";
import { promptCharacters } from "./characters";
import { getPricing } from "./pricing-store";
import { templateContext } from "./templates";

/**
 * The Video Studio's conversation.
 *
 * The assistant is deliberately deterministic: a message becomes a *quote*
 * (what will be made, how long, which shape, what it costs in credits), and
 * nothing is generated or charged until the user presses Generate on it.
 * Slash commands pick the mode; plain words like "15 seconds" or "vertical"
 * fill in the settings. No language model is needed for any of this, so the
 * Studio works the same whichever AI provider is configured.
 */

export interface QuoteMeta extends Intent {
  parentAssetId: string | null;
  /** The catalogue model it will run on; the mode's default when missing (quotes from before 3 Oct 2026) */
  modelKey?: string | null;
  /** A published template whose text goes in front of the prompt */
  templateId?: string | null;
  /** Characters whose names and descriptions go into the prompt */
  characterIds?: string[];
  /** The campaign the creative is for */
  campaignId?: string | null;
}

export { interpret };

/** What the user chose to shape a prompt, from the Studio's context bar. */
export interface PromptContext {
  templateId?: string | null;
  characterIds?: string[];
  campaignId?: string | null;
}

/** Checks a context against the organisation, dropping anything that is not theirs or not available. */
async function resolveContext(organizationId: string, ctx: PromptContext | undefined): Promise<Pick<QuoteMeta, "templateId" | "characterIds" | "campaignId">> {
  if (!ctx) return {};
  const template = ctx.templateId ? await templateContext(ctx.templateId) : null;
  const characters = ctx.characterIds?.length ? await promptCharacters(organizationId, ctx.characterIds) : [];
  const campaign = ctx.campaignId ? await db.campaign.findFirst({ where: { id: ctx.campaignId, organizationId }, select: { id: true } }) : null;
  return { templateId: template?.id ?? null, characterIds: characters.map((c) => c.id), campaignId: campaign?.id ?? null };
}

/** The prompt that is sent to the model: template text, then each character, then what the user wrote. */
export async function composePrompt(organizationId: string, meta: QuoteMeta): Promise<string> {
  const parts: string[] = [];
  const template = meta.templateId ? await templateContext(meta.templateId) : null;
  if (template) parts.push(template.text);
  const characters = meta.characterIds?.length ? await promptCharacters(organizationId, meta.characterIds) : [];
  for (const c of characters) parts.push(`Character ${c.name}${c.description ? `: ${c.description.replace(/[.\s]+$/, "")}` : ""}.`);
  const own = meta.prompt.trim();
  if (parts.length === 0) return own;
  // The user's own words always survive; the added context is trimmed to fit the 2,000-character limit.
  const room = Math.max(0, 2000 - own.length - 1);
  const context = parts.join(" ").slice(0, room).trim();
  return context ? `${context} ${own}` : own;
}

const DEFAULT_SECONDS = DEFAULT_VIDEO_SECONDS;

/** The model a quote runs on: its own when still offered, otherwise the mode's default (null if none is on). */
async function quoteModel(meta: QuoteMeta): Promise<CatalogueModel | null> {
  const options = await modelsForMode(meta.mode);
  return options.find((m) => m.key === meta.modelKey) ?? options[0] ?? null;
}

/** Puts a quote on a model: its key, and the nearest length and shape the model takes. */
function onModel(meta: QuoteMeta, model: CatalogueModel | null): QuoteMeta {
  if (!model) return { ...meta, modelKey: null };
  return { ...meta, ...fitQuote(model.family, meta.mode, meta.seconds, meta.aspectRatio), modelKey: model.key };
}

export async function quoteSummary(p: Pricing, meta: QuoteMeta): Promise<string> {
  const model = (await modelByKey(meta.modelKey)) ?? (await quoteModel(meta));
  const credits = creditsFor(p, meta.mode, meta.seconds ?? undefined, model);
  const what =
    meta.mode === "image"
      ? `a ${meta.aspectRatio} image`
      : meta.mode === "animate"
        ? `a ${meta.seconds}-second animation of your image`
        : meta.mode === "extend"
          ? `a ${meta.seconds}-second continuation of your clip`
          : `a ${meta.seconds}-second ${meta.aspectRatio} video`;
  const on = model ? ` with ${model.label}` : "";
  return `Ready to make ${what}${on}. This uses ${credits} credits (${formatKES(creditsToCents(p, credits))} at the pay-as-you-go rate).`;
}

const helpText = (p: Pricing) => [
  "Describe what you want and I will prepare it. Nothing is charged until you press Generate.",
  `/video: a clip from a description (4 to 30 s; ${p.videoCreditsPerStep} credits per started ${p.videoStepSeconds} s).`,
  `/image: a still image (${p.imageCredits} credits).`,
  "/animate: bring a finished image from this project to life.",
  "/extend: continue the last finished clip.",
  "/quote: captions, voice-over, music and other services, priced on request.",
  'Mention a length ("15 seconds") or a shape ("vertical", "16:9") and I will use it.',
].join("\n");

const QUOTE_TEXT =
  "Captions and copy, voice-over, music, subtitles, revisions and platform resizes are priced on request. " +
  "Send the details from the order page's quote form and the team will reply with a price.";

// ── threads ──────────────────────────────────────────────────────────────

export async function listThreads(organizationId: string, opts: { archived?: boolean; q?: string } = {}) {
  const threads = await db.studioThread.findMany({
    where: {
      organizationId,
      archivedAt: opts.archived ? { not: null } : null,
      ...(opts.q ? { title: { contains: opts.q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      archivedAt: true,
      _count: { select: { assets: true } },
    },
  });
  return threads.map((t) => ({
    id: t.id,
    title: t.title,
    updatedAt: t.updatedAt.toISOString(),
    archived: t.archivedAt !== null,
    clips: t._count.assets,
  }));
}

export async function createThread(organizationId: string, userId: string, title?: string, orderId?: string) {
  return db.studioThread.create({
    data: {
      organizationId,
      createdById: userId,
      title: (title?.trim() || "Untitled project").slice(0, 120),
      orderId: orderId ?? null,
    },
    select: { id: true, title: true },
  });
}

export async function ownedThread(organizationId: string, threadId: string) {
  const thread = await db.studioThread.findFirst({ where: { id: threadId, organizationId } });
  if (!thread) throw new ApiError(404, "NOT_FOUND", "Project not found.");
  return thread;
}

export interface MessageView {
  id: string;
  role: string;
  kind: string;
  body: string;
  meta: QuoteMeta | null;
  asset: AssetView | null;
  createdAt: string;
}

function messageView(m: StudioMessage, assets: Map<string, GeneratedAsset>): MessageView {
  const asset = m.assetId ? assets.get(m.assetId) : undefined;
  return {
    id: m.id,
    role: m.role,
    kind: m.kind,
    body: m.body,
    meta: (m.meta as QuoteMeta | null) ?? null,
    asset: asset ? assetView(asset) : null,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function threadDetail(organizationId: string, threadId: string) {
  const thread = await ownedThread(organizationId, threadId);
  const order = thread.orderId
    ? await db.order.findFirst({
        where: { id: thread.orderId, organizationId },
        select: { id: true, number: true, status: true, customerName: true, kind: true, imageTokens: true, videoSeconds: true, brief: true },
      })
    : null;
  const messages = await db.studioMessage.findMany({ where: { threadId }, orderBy: { createdAt: "asc" }, take: 500 });
  const assetIds = messages.map((m) => m.assetId).filter((x): x is string => Boolean(x));
  const assets = new Map(
    (await db.generatedAsset.findMany({ where: { id: { in: assetIds }, organizationId } })).map((a) => [a.id, a]),
  );
  return {
    thread: { id: thread.id, title: thread.title, archived: thread.archivedAt !== null },
    order,
    messages: messages.map((m) => messageView(m, assets)),
  };
}

export async function messageDetail(organizationId: string, messageId: string): Promise<MessageView> {
  const m = await db.studioMessage.findFirst({ where: { id: messageId, organizationId } });
  if (!m) throw new ApiError(404, "NOT_FOUND", "Message not found.");
  const assets = new Map<string, GeneratedAsset>();
  if (m.assetId) {
    const a = await db.generatedAsset.findFirst({ where: { id: m.assetId, organizationId } });
    if (a) assets.set(a.id, a);
  }
  return messageView(m, assets);
}

/** The most recent finished asset of a kind in a thread that can seed animate or extend. */
async function lastDerivable(organizationId: string, threadId: string, media: "IMAGE" | "VIDEO") {
  return db.generatedAsset.findFirst({
    where: { organizationId, threadId, mediaType: media, status: "READY", archivedAt: null, url: { not: null } },
    orderBy: { readyAt: "desc" },
    select: { id: true },
  });
}

/** A user turn: store it, then answer with a quote (or help). Nothing is charged here. */
export async function postMessage(
  organizationId: string,
  threadId: string,
  text: string,
  opts: { parentAssetId?: string | null; context?: PromptContext } = {},
): Promise<MessageView[]> {
  const thread = await ownedThread(organizationId, threadId);
  if (thread.archivedAt) throw new ApiError(409, "CONFLICT", "This project is archived. Restore it to keep working.");
  const trimmed = text.trim();
  if (!trimmed) throw new ApiError(422, "VALIDATION_FAILED", "Type what you want to make.");

  const { command, meta } = interpret(trimmed);

  const user = await db.studioMessage.create({
    data: { threadId, organizationId, role: "USER", kind: "TEXT", body: trimmed.slice(0, 4000) },
  });

  // First real message names an untitled project.
  if (thread.title === "Untitled project" && meta.prompt) {
    await db.studioThread.update({ where: { id: threadId }, data: { title: meta.prompt.slice(0, 60) } });
  } else {
    await db.studioThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
  }

  let reply: Prisma.StudioMessageUncheckedCreateInput;
  if (command === "help") {
    reply = { threadId, organizationId, role: "ASSISTANT", kind: "TEXT", body: helpText(await getPricing()) };
  } else if (command === "quote") {
    reply = { threadId, organizationId, role: "ASSISTANT", kind: "TEXT", body: QUOTE_TEXT };
  } else if (!meta.prompt || meta.prompt.length < 3) {
    reply = {
      threadId,
      organizationId,
      role: "ASSISTANT",
      kind: "TEXT",
      body: `Describe the ${MODES[meta.mode].media === "IMAGE" ? "image" : "clip"} after the command, e.g. "${
        meta.mode === "image" ? "/image a smiling landlord holding a prepaid meter" : "/video a tenant tops up a prepaid meter with M-Pesa, 10 seconds, vertical"
      }".`,
    };
  } else {
    let parentAssetId: string | null = null;
    const source = MODES[meta.mode].source;
    if (source) {
      const parent = opts.parentAssetId
        ? await db.generatedAsset.findFirst({
            where: { id: opts.parentAssetId, organizationId, mediaType: source, status: "READY", url: { not: null } },
            select: { id: true },
          })
        : await lastDerivable(organizationId, threadId, source);
      if (!parent) {
        reply = {
          threadId,
          organizationId,
          role: "ASSISTANT",
          kind: "TEXT",
          body:
            source === "IMAGE"
              ? "There is no finished image in this project to animate yet. Make one with /image first."
              : "There is no finished clip in this project to extend yet. Make one with /video first.",
        };
        const created = await db.studioMessage.create({ data: reply });
        return [messageView(user, new Map()), messageView(created, new Map())];
      }
      parentAssetId = parent.id;
    }
    const base: QuoteMeta = { ...meta, parentAssetId, ...(await resolveContext(organizationId, opts.context)) };
    const quote = onModel(base, await quoteModel(base));
    reply = {
      threadId,
      organizationId,
      role: "ASSISTANT",
      kind: "QUOTE",
      body: await quoteSummary(await getPricing(), quote),
      meta: quote as unknown as Prisma.InputJsonValue,
    };
  }

  const created = await db.studioMessage.create({ data: reply });
  return [messageView(user, new Map()), messageView(created, new Map())];
}

/** Adjusts an unclaimed quote (length, shape, prompt, image or video) before generating. */
export async function updateQuote(
  organizationId: string,
  messageId: string,
  patch: { seconds?: number; aspectRatio?: string; prompt?: string; mode?: "image" | "video"; modelKey?: string },
): Promise<MessageView> {
  const m = await db.studioMessage.findFirst({ where: { id: messageId, organizationId, kind: "QUOTE", assetId: null } });
  if (!m) throw new ApiError(409, "CONFLICT", "This quote has already been generated or does not exist.");
  let meta = { ...(m.meta as unknown as QuoteMeta) };

  if (patch.mode && !MODES[meta.mode].source && patch.mode !== meta.mode) {
    meta.mode = patch.mode;
    meta.aspectRatio = isAspectRatio(meta.aspectRatio) ? meta.aspectRatio : MODES[patch.mode].defaultAspect;
    meta.seconds = MODES[patch.mode].media === "VIDEO" ? (meta.seconds ?? DEFAULT_SECONDS) : null;
    meta.modelKey = null; // an image model cannot make the video: back to the mode's default
  }
  if (patch.modelKey !== undefined) {
    meta = onModel(meta, await resolveModel(meta.mode, patch.modelKey));
  } else {
    meta = onModel(meta, await quoteModel(meta));
  }
  const family = meta.modelKey ? ((await modelByKey(meta.modelKey))?.family ?? null) : null;
  const spec = family ? FAMILIES[family] : null;
  if (patch.seconds !== undefined && MODES[meta.mode].media === "VIDEO") {
    const rule = spec?.seconds ?? { min: VIDEO_MIN_SECONDS, max: VIDEO_MAX_SECONDS };
    if (!secondsAllowed(rule, patch.seconds)) {
      throw new ApiError(422, "VALIDATION_FAILED", `Length must be ${secondsLabel(rule).replace(/ s$/, " seconds")} on this model.`);
    }
    meta.seconds = patch.seconds;
  }
  if (patch.aspectRatio !== undefined) {
    const allowed = spec?.aspects ?? ASPECT_RATIOS;
    if (!isAspectRatio(patch.aspectRatio) || !allowed.includes(patch.aspectRatio)) {
      throw new ApiError(422, "VALIDATION_FAILED", `Pick one of ${allowed.join(", ")}.`);
    }
    meta.aspectRatio = patch.aspectRatio;
  }
  if (patch.prompt !== undefined) {
    const p = patch.prompt.trim();
    if (p.length < 3 || p.length > 2000) throw new ApiError(422, "VALIDATION_FAILED", "Keep the prompt between 3 and 2,000 characters.");
    meta.prompt = p;
  }

  const updated = await db.studioMessage.update({
    where: { id: m.id },
    data: { meta: meta as unknown as Prisma.InputJsonValue, body: await quoteSummary(await getPricing(), meta) },
  });
  return messageView(updated, new Map());
}

/**
 * Generate from a quote. The asset, the token charge and the claim on the quote
 * are one transaction; a second press finds the quote already claimed.
 */
export async function generateFromQuote(
  organizationId: string,
  userId: string,
  messageId: string,
  opts: { mayProduceOrders?: boolean } = {},
): Promise<MessageView> {
  const m = await db.studioMessage.findFirst({
    where: { id: messageId, organizationId, kind: { in: ["QUOTE", "GENERATION"] } },
  });
  if (!m) throw new ApiError(404, "NOT_FOUND", "Quote not found.");
  if (m.assetId) return messageDetail(organizationId, messageId);
  const meta = m.meta as unknown as QuoteMeta;

  // A project opened for a public order attaches its generations to that order.
  const thread = await db.studioThread.findUnique({ where: { id: m.threadId }, select: { orderId: true } });
  let orderId: string | null = null;
  if (thread?.orderId) {
    if (!opts.mayProduceOrders) throw new ApiError(403, "FORBIDDEN", "Only order managers can produce for an order.");
    const order = await db.order.findFirst({
      where: { id: thread.orderId, organizationId, status: { in: ["PAID", "IN_PRODUCTION"] } },
      select: { id: true },
    });
    if (!order) throw new ApiError(409, "CONFLICT", "This order is not in production. Reopen it before generating.");
    orderId = order.id;
  }

  await requestGeneration(
    {
      organizationId,
      userId,
      mode: meta.mode,
      prompt: await composePrompt(organizationId, meta),
      campaignId: meta.campaignId ?? null,
      context: { templateId: meta.templateId ?? null, characterIds: meta.characterIds ?? [] },
      seconds: meta.seconds ?? undefined,
      aspectRatio: meta.aspectRatio,
      threadId: m.threadId,
      parentAssetId: meta.parentAssetId,
      orderId,
      modelKey: meta.modelKey ?? null,
    },
    async (tx, asset) => {
      const claimed = await tx.studioMessage.updateMany({
        where: { id: m.id, assetId: null },
        data: { assetId: asset.id, kind: "GENERATION" },
      });
      if (claimed.count !== 1) throw new ApiError(409, "CONFLICT", "This quote is already being generated.");
    },
  );
  return messageDetail(organizationId, messageId);
}

/** Offers the same settings again as a fresh quote (after a failure, or for another take). */
export async function requote(organizationId: string, messageId: string): Promise<MessageView> {
  const m = await db.studioMessage.findFirst({
    where: { id: messageId, organizationId, kind: { in: ["QUOTE", "GENERATION"] } },
  });
  if (!m?.meta) throw new ApiError(404, "NOT_FOUND", "Nothing to repeat.");
  const old = m.meta as unknown as QuoteMeta;
  const meta = onModel(old, await quoteModel(old));
  const created = await db.studioMessage.create({
    data: {
      threadId: m.threadId,
      organizationId,
      role: "ASSISTANT",
      kind: "QUOTE",
      body: await quoteSummary(await getPricing(), meta),
      meta: meta as unknown as Prisma.InputJsonValue,
    },
  });
  return messageView(created, new Map());
}

/** Starts a derived quote (animate an image, extend a clip) from a finished asset. */
export async function deriveQuote(
  organizationId: string,
  assetId: string,
  mode: "animate" | "extend",
): Promise<MessageView> {
  const asset = await db.generatedAsset.findFirst({
    where: { id: assetId, organizationId, status: "READY", archivedAt: null },
  });
  const source = MODES[mode].source;
  if (!asset || !asset.threadId || asset.mediaType !== source) {
    throw new ApiError(422, "VALIDATION_FAILED", mode === "animate" ? "Pick a finished image." : "Pick a finished clip.");
  }
  if (!asset.url) {
    throw new ApiError(422, "VALIDATION_FAILED", "This file can be downloaded but not used as a source for new generations.");
  }
  const base: QuoteMeta = {
    mode,
    prompt: mode === "animate" ? `Bring this image to life: ${asset.prompt}` : `Continue the scene: ${asset.prompt}`,
    seconds: 5,
    aspectRatio: isAspectRatio(asset.aspectRatio) ? asset.aspectRatio : MODES[mode].defaultAspect,
    parentAssetId: asset.id,
  };
  const meta = onModel(base, await quoteModel(base));
  const created = await db.studioMessage.create({
    data: {
      threadId: asset.threadId,
      organizationId,
      role: "ASSISTANT",
      kind: "QUOTE",
      body: await quoteSummary(await getPricing(), meta),
      meta: meta as unknown as Prisma.InputJsonValue,
    },
  });
  await db.studioThread.update({ where: { id: asset.threadId }, data: { updatedAt: new Date() } });
  return messageView(created, new Map());
}
