import "server-only";

import crypto from "node:crypto";

import type { GeneratedAsset, Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, type Tx } from "@/lib/db";
import {
  buildModelInput,
  FAMILIES,
  MODES,
  modelCredits,
  type AspectRatio,
  type CatalogueModel,
  type GenerationMode,
  type ModelFamily,
} from "@/lib/generation-models";
import { isPaidPlan, PricingError, videoCreditsFor, type Pricing } from "@/lib/pricing";
import type { StartImageRef } from "@/lib/studio-context";

import { alertProviderOutOfCredits, claimAlert, recordUsage } from "./ai-credits";
import { modelByKey, resolveModel } from "./ai-models";
import { GenerationProviderError, generationProviderFor, providerForRequest } from "./higgsfield";
import { enqueue } from "./jobs";
import { notify } from "./notify";
import { providerUrlFor } from "./reference-images";
import { saveFromUrl } from "./storage";
import { refund, spend, wallet } from "./credits";
import { getPricing } from "./pricing-store";

/**
 * Image and video generation, end to end:
 *
 *   requestGeneration   (web)     asset GENERATING + credits charged, one transaction
 *   content.generate    (worker)  submit to Higgsfield, remember its request id
 *   content.poll        (worker)  check status on a widening interval
 *        completed  ->  download into storage/, asset READY
 *        failed     ->  asset FAILED, credits refunded
 *
 * Every worker step is idempotent (the queue delivers at least once): each one
 * re-reads the asset and does nothing unless it is still GENERATING, and the
 * terminal transitions are conditional updates that only one caller can win.
 */

/** Give up on a generation that has not finished in this long, and refund it. */
const GIVE_UP_AFTER_MS = 30 * 60_000;

export interface GenerationRequest {
  organizationId: string;
  userId: string;
  mode: GenerationMode;
  prompt: string;
  seconds?: number;
  aspectRatio: AspectRatio;
  threadId?: string | null;
  orderId?: string | null;
  parentAssetId?: string | null;
  brandId?: string | null;
  /** The campaign this creative is for (listed on the campaign page) */
  campaignId?: string | null;
  /**
   * What shaped the prompt, kept in the asset's metadata. `startImage` is the picture that starts a video
   * (it turns a text-to-video request into image-to-video where the model supports it).
   */
  context?: { templateId?: string | null; characterIds?: string[]; brandId?: string | null; productId?: string | null; startImage?: StartImageRef | null } | null;
  /** A catalogue model (AiModel.key); the mode's default when not given */
  modelKey?: string | null;
}

/**
 * Credits a request costs: the model's own rate when the admin set one,
 * otherwise the price list's (by default 2 per image, 22 per started 5 s of video).
 */
export function creditsFor(
  p: Pricing,
  mode: GenerationMode,
  seconds?: number,
  model?: Pick<CatalogueModel, "family" | "creditsPerImage" | "creditsPerStep"> | null,
): number {
  try {
    if (model) return modelCredits(p, model, seconds);
    if (MODES[mode].media === "IMAGE") return p.imageCredits;
    return videoCreditsFor(p, seconds ?? 5);
  } catch (e) {
    if (e instanceof PricingError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
    throw e;
  }
}

/** The family that builds an existing asset's request: its catalogue model, or the built-in one for its mode. */
async function familyOf(asset: { modelKey: string | null }, mode: GenerationMode): Promise<ModelFamily> {
  const model = await modelByKey(asset.modelKey);
  return model?.family ?? (MODES[mode].media === "IMAGE" ? "soul" : "seedance");
}

/**
 * How many generations an organisation may run at once: its plan's parallel
 * jobs (by default Free 1, Basic 2, Pro 3, Max 8). The operator's INTERNAL
 * organisation, which fulfils paid orders, is not limited.
 */
export async function parallelLimit(organizationId: string, p: Pricing): Promise<number | null> {
  const [org, sub] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { plan: true } }),
    db.subscription.findUnique({ where: { organizationId }, select: { plan: true, status: true } }),
  ]);
  if (org?.plan === "INTERNAL") return null;
  const key = sub && sub.status !== "EXPIRED" && isPaidPlan(sub.plan) ? sub.plan : "FREE";
  return p.plans[key].parallel;
}

/**
 * Creates the asset and charges its credits in one transaction, then queues the
 * work. `withinTx` lets a caller claim something atomically with the charge (the
 * Studio claims its quote message, so a double-click cannot generate twice).
 */
export async function requestGeneration(
  req: GenerationRequest,
  withinTx?: (tx: Tx, asset: GeneratedAsset) => Promise<void>,
): Promise<GeneratedAsset> {
  const prompt = req.prompt.trim();
  if (prompt.length < 3) throw new ApiError(422, "VALIDATION_FAILED", "Describe what you want in a few words.");
  if (prompt.length > 2000) throw new ApiError(422, "VALIDATION_FAILED", "Keep the prompt under 2,000 characters.");
  const pricing = await getPricing();
  const model = await resolveModel(req.mode, req.modelKey);
  const cost = creditsFor(pricing, req.mode, req.seconds, model);
  // A picture can start a video where the model has an image-to-video endpoint: the request then runs as "animate".
  const startImage = req.mode === "video" && req.context?.startImage && model.endpoints.animate ? req.context.startImage : null;
  const mode: GenerationMode = startImage ? "animate" : req.mode;
  const spec = MODES[mode];

  const limit = await parallelLimit(req.organizationId, pricing);
  if (limit !== null) {
    const running = await db.generatedAsset.count({ where: { organizationId: req.organizationId, status: "GENERATING" } });
    if (running >= limit) {
      throw new ApiError(
        429,
        "PARALLEL_LIMIT",
        `Your plan runs ${limit} generation${limit === 1 ? "" : "s"} at a time. Wait for one to finish, or upgrade for more.`,
        { limit, running },
      );
    }
  }

  if (spec.source && !startImage) {
    if (!req.parentAssetId) throw new ApiError(422, "VALIDATION_FAILED", `${spec.label} starts from an existing ${spec.source.toLowerCase()}.`);
    const parent = await db.generatedAsset.findFirst({
      where: { id: req.parentAssetId, organizationId: req.organizationId, status: "READY", archivedAt: null },
      select: { mediaType: true, url: true },
    });
    if (!parent || parent.mediaType !== spec.source || !parent.url) {
      throw new ApiError(422, "VALIDATION_FAILED", `Pick a finished ${spec.source.toLowerCase()} to ${req.mode}.`);
    }
  }

  // Validate the provider body now, so a bad request fails here and not in the worker.
  try {
    buildModelInput(model.family, mode, {
      prompt,
      seconds: req.seconds,
      aspectRatio: req.aspectRatio,
      sourceUrl: spec.source ? "https://placeholder.invalid/source" : undefined,
    });
  } catch (e) {
    throw new ApiError(422, "VALIDATION_FAILED", (e as Error).message);
  }

  const asset = await db.$transaction(async (tx) => {
    const created = await tx.generatedAsset.create({
      data: {
        organizationId: req.organizationId,
        brandId: req.brandId ?? null,
        campaignId: req.campaignId ?? null,
        status: "GENERATING",
        mediaType: spec.media,
        model: model.endpoints[mode]!,
        modelKey: model.key,
        prompt,
        requestId: `gen_${crypto.randomUUID()}`,
        createdById: req.userId,
        durationSeconds: spec.media === "VIDEO" ? (req.seconds ?? 5) : null,
        aspectRatio: req.aspectRatio,
        resolution: FAMILIES[model.family].resolution,
        threadId: req.threadId ?? null,
        orderId: req.orderId ?? null,
        parentAssetId: req.parentAssetId ?? null,
        metadata: {
          mode,
          ...(req.context?.templateId ? { templateId: req.context.templateId } : {}),
          ...(req.context?.characterIds?.length ? { characterIds: req.context.characterIds } : {}),
          ...(req.context?.brandId ? { brandId: req.context.brandId } : {}),
          ...(req.context?.productId ? { productId: req.context.productId } : {}),
          ...(startImage ? { startImage: { source: startImage.source, id: startImage.id } } : {}),
        } satisfies Prisma.InputJsonValue,
      },
    });

    const charged = await spend(tx, {
      organizationId: req.organizationId,
      credits: cost,
      assetId: created.id,
      userId: req.userId,
    });
    const asset = await tx.generatedAsset.update({ where: { id: created.id }, data: { tokensCharged: charged } });

    if (req.orderId) {
      await tx.order.updateMany({ where: { id: req.orderId, status: "PAID" }, data: { status: "IN_PRODUCTION" } });
    }
    if (req.threadId) await tx.studioThread.update({ where: { id: req.threadId }, data: { updatedAt: new Date() } });
    if (withinTx) await withinTx(tx, asset);
    return asset;
  });

  await enqueue("content.generate", { assetId: asset.id }, {
    dedupeKey: `content.generate:${asset.id}`,
    organizationId: asset.organizationId,
    maxAttempts: 4,
  });

  await audit({
    organizationId: req.organizationId,
    userId: req.userId,
    action: "GENERATION_REQUEST",
    entity: "GeneratedAsset",
    entityId: asset.id,
    changes: { mode, startImage: startImage?.source ?? null, model: model.key, seconds: req.seconds ?? null, credits: asset.tokensCharged, orderId: req.orderId ?? null },
  });
  await warnIfWalletEmpty(req.organizationId, pricing);
  return asset;
}

/** Tells the owners once when the wallet can no longer pay for an image; re-arms when it can again. */
async function warnIfWalletEmpty(organizationId: string, pricing: Pricing): Promise<void> {
  try {
    const w = await wallet(organizationId);
    if (w.unmetered) return;
    const key = `credits-empty:${organizationId}`;
    if (w.credits >= pricing.imageCredits) {
      await db.alertMark.deleteMany({ where: { key } });
      return;
    }
    if (!(await claimAlert(key))) return;
    await notify({
      event: "credits.empty",
      organizationId,
      title: w.credits === 0 ? "Your credits are used up" : `Only ${w.credits} credit${w.credits === 1 ? "" : "s"} left`,
      body: "Top up or choose a plan to keep making images and videos.",
      href: "/billing",
    });
  } catch (error) {
    console.error("[generation] wallet warning failed", error);
  }
}

/** Marks a generation failed (once) and refunds its credits. */
export async function failGeneration(assetId: string, reason: string): Promise<boolean> {
  const won = await db.generatedAsset.updateMany({
    where: { id: assetId, status: "GENERATING" },
    data: { status: "FAILED", error: reason.slice(0, 500), failedAt: new Date() },
  });
  if (won.count !== 1) return false;

  const refunded = await refund(assetId, reason.slice(0, 200));
  const asset = await db.generatedAsset.findUnique({
    where: { id: assetId },
    select: { organizationId: true, createdById: true, mediaType: true, threadId: true },
  });
  if (asset) {
    await notify({
      event: "generation.failed",
      organizationId: asset.organizationId,
      userIds: [asset.createdById],
      title: `Your ${asset.mediaType === "IMAGE" ? "image" : "video"} could not be made`,
      body: `${reason.slice(0, 200)}${refunded && !/credits were returned/i.test(reason) ? ` ${refunded} credits were returned.` : ""}`,
      href: asset.threadId ? `/content?project=${asset.threadId}` : "/content/assets",
    }).catch((error) => console.error("[generation] failure notice", error));
    await audit({
      organizationId: asset.organizationId,
      userId: asset.createdById,
      action: "GENERATION_FAILED",
      entity: "GeneratedAsset",
      entityId: assetId,
      changes: { reason, refundedCredits: refunded },
    });
  }
  return true;
}

function pollDelayMs(n: number): number {
  // 5 s, 5 s, 8 s, 12 s, then every 20 s.
  return [5_000, 5_000, 8_000, 12_000][n] ?? 20_000;
}

async function schedulePoll(asset: { id: string; organizationId: string }, n: number): Promise<void> {
  await enqueue("content.poll", { assetId: asset.id, n }, {
    dedupeKey: `content.poll:${asset.id}:${n}`,
    runAt: new Date(Date.now() + pollDelayMs(n)),
    organizationId: asset.organizationId,
    maxAttempts: 3,
  });
}

/** Worker step 1: send the request to the provider. */
export async function submitGeneration(assetId: string, finalAttempt: boolean): Promise<void> {
  const asset = await db.generatedAsset.findUnique({
    where: { id: assetId },
    include: { parent: { select: { url: true } } },
  });
  if (!asset || asset.status !== "GENERATING") return;
  if (asset.externalRequestId) {
    await schedulePoll(asset, 0);
    return;
  }

  const meta = (asset.metadata ?? {}) as {
    mode?: GenerationMode;
    startImage?: StartImageRef;
    brandId?: string;
    productId?: string;
    characterIds?: string[];
    templateId?: string;
  };
  const mode = (meta.mode ?? (asset.mediaType === "IMAGE" ? "image" : "video")) as GenerationMode;

  let billedTo: "platform" | "organization" = "platform";
  try {
    const provider = await generationProviderFor(asset.organizationId);
    billedTo = provider.billedTo;
    // A starting picture is sent to the provider first; a video is never started from a picture it never received.
    let sourceUrl = asset.parent?.url ?? undefined;
    if (meta.startImage && !sourceUrl) {
      sourceUrl = await providerUrlFor(asset.organizationId, meta.startImage, meta, provider);
    }
    let input: Record<string, unknown>;
    try {
      input = buildModelInput(await familyOf(asset, mode), mode, {
        prompt: asset.prompt,
        seconds: asset.durationSeconds ?? undefined,
        aspectRatio: (asset.aspectRatio ?? MODES[mode].defaultAspect) as AspectRatio,
        sourceUrl,
      });
    } catch (e) {
      await failGeneration(asset.id, (e as Error).message);
      return;
    }
    // What the platform will be charged, recorded as usage when the render completes.
    // Generation is platform-managed, so every finished render draws on the platform balance.
    const cost = provider.billedTo === "platform" && asset.providerMilliCredits === null ? await provider.estimate(asset.model, input, mode) : null;
    if (cost) {
      await db.generatedAsset.update({ where: { id: asset.id }, data: { providerMilliCredits: cost.milliCredits, providerUsdMicros: cost.usdMicros } });
    }
    const requestId = await provider.submit(asset.model, input, mode);
    await db.generatedAsset.update({ where: { id: asset.id }, data: { externalRequestId: requestId } });
    await schedulePoll(asset, 0);
  } catch (e) {
    if (e instanceof GenerationProviderError && e.outOfCredits && billedTo === "platform") {
      await alertProviderOutOfCredits(e.message).catch((error) => console.error("[generation] out-of-credits alert", error));
    }
    const retryable = e instanceof GenerationProviderError ? e.retryable : true;
    if (!retryable || finalAttempt) {
      await failGeneration(asset.id, e instanceof Error ? e.message : String(e));
      return;
    }
    throw e; // the queue retries with backoff
  }
}

/** Worker step 2: check on the request, and finish or fail the asset. */
export async function pollGeneration(assetId: string, n: number): Promise<void> {
  const asset = await db.generatedAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status !== "GENERATING" || !asset.externalRequestId) return;

  if (Date.now() - asset.createdAt.getTime() > GIVE_UP_AFTER_MS) {
    await failGeneration(asset.id, "The generation took too long and was stopped. Your credits were returned.");
    return;
  }

  let state;
  try {
    state = await (await providerForRequest(asset.externalRequestId, asset.organizationId)).status(asset.externalRequestId);
  } catch (e) {
    if (e instanceof GenerationProviderError && !e.retryable) {
      await failGeneration(asset.id, e.message);
      return;
    }
    await schedulePoll(asset, n + 1);
    return;
  }

  if (state.status === "queued" || state.status === "in_progress") {
    await schedulePoll(asset, n + 1);
    return;
  }
  if (state.status === "nsfw") {
    await failGeneration(asset.id, "The request was blocked by the content filter. Your credits were returned.");
    return;
  }
  if (state.status === "failed" || state.status === "canceled") {
    const detail = (state.raw as { detail?: string; error?: string } | null)?.detail ?? (state.raw as { error?: string } | null)?.error;
    await failGeneration(asset.id, `The generation failed${detail ? `: ${String(detail).slice(0, 200)}` : ""}. Your credits were returned.`);
    return;
  }

  if (!state.url) {
    await failGeneration(asset.id, "The generation finished without a file. Your credits were returned.");
    return;
  }

  let saved;
  try {
    saved = await saveFromUrl(
      state.url,
      `assets/${asset.organizationId}/${asset.id}`,
      asset.mediaType === "IMAGE" ? ".png" : ".mp4",
    );
  } catch (e) {
    // The file exists at the provider; try the download again shortly.
    if (n < 12) {
      await schedulePoll(asset, n + 1);
      return;
    }
    await failGeneration(asset.id, `The finished file could not be downloaded (${(e as Error).message}).`);
    return;
  }

  const won = await db.generatedAsset.updateMany({
    where: { id: asset.id, status: "GENERATING" },
    data: {
      status: "READY",
      url: state.url.startsWith("sim://") ? null : state.url,
      storageKey: saved.key,
      mimeType: saved.mimeType,
      fileSizeBytes: saved.bytes,
      readyAt: new Date(),
    },
  });
  if (won.count === 1) {
    if (asset.providerMilliCredits !== null) {
      await recordUsage({
        assetId: asset.id,
        organizationId: asset.organizationId,
        modelKey: asset.modelKey,
        milliCredits: asset.providerMilliCredits,
        usdMicros: asset.providerUsdMicros,
        note: state.url.startsWith("sim://") ? "simulator" : undefined,
      }).catch((error) => console.error("[generation] usage not recorded", error));
    }
    await audit({
      organizationId: asset.organizationId,
      userId: asset.createdById,
      action: "GENERATION_READY",
      entity: "GeneratedAsset",
      entityId: asset.id,
      changes: { bytes: saved.bytes, mimeType: saved.mimeType },
    });
  }
}

/** A client-safe view of an asset: the file is always served through our route, never the provider URL. */
export function assetView(a: GeneratedAsset) {
  const mode = (a.metadata as { mode?: string } | null)?.mode ?? (a.mediaType === "IMAGE" ? "image" : "video");
  return {
    id: a.id,
    status: a.status,
    mediaType: a.mediaType,
    mode,
    modelKey: a.modelKey,
    prompt: a.prompt,
    durationSeconds: a.durationSeconds,
    aspectRatio: a.aspectRatio,
    tokensCharged: a.tokensCharged,
    error: a.error,
    threadId: a.threadId,
    orderId: a.orderId,
    parentAssetId: a.parentAssetId,
    canDerive: a.status === "READY" && Boolean(a.url),
    fileUrl: a.status === "READY" && a.storageKey ? `/api/content/assets/${a.id}/file` : null,
    downloadCount: a.downloadCount,
    createdAt: a.createdAt.toISOString(),
    readyAt: a.readyAt?.toISOString() ?? null,
  };
}
export type AssetView = ReturnType<typeof assetView>;
