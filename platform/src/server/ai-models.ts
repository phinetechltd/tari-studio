import "server-only";

import type { AiModel } from "@prisma/client";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import {
  BUILT_IN_MODELS,
  FAMILIES,
  isModelFamily,
  MODES,
  type CatalogueModel,
  type GenerationMode,
} from "@/lib/generation-models";
import type { Principal } from "@/lib/rbac";

/**
 * The model catalogue (AiModel rows) a platform admin manages in Platform
 * admin → AI & credits: which models customers may pick, which one each mode
 * uses by default, and what each costs in credits. Read through a ten-second
 * cache like the price list, so a change reaches every process within seconds.
 * An empty table (or one that cannot be read) means the built-in Soul 2 and
 * Seedance 2.5, which is what the Studio ran before the catalogue existed.
 */

const REFRESH_MS = 10_000;
const MODE_KEYS = Object.keys(MODES) as GenerationMode[];

let cache: { at: number; models: CatalogueModel[] } | null = null;

function fromRow(row: AiModel): CatalogueModel | null {
  if (!isModelFamily(row.family)) return null;
  const raw = (row.endpoints ?? {}) as Record<string, unknown>;
  const endpoints: Partial<Record<GenerationMode, string>> = {};
  for (const mode of MODE_KEYS) {
    const v = raw[mode];
    if (typeof v === "string" && v.trim() && FAMILIES[row.family].modes.includes(mode)) endpoints[mode] = v.trim();
  }
  return {
    key: row.key,
    label: row.label,
    family: row.family,
    media: FAMILIES[row.family].media,
    endpoints,
    enabled: row.enabled,
    defaultFor: row.defaultFor.filter((m): m is GenerationMode => (MODE_KEYS as string[]).includes(m) && m in endpoints),
    creditsPerImage: row.creditsPerImage,
    creditsPerStep: row.creditsPerStep,
    providerMilliCreditsHint: row.providerMilliCreditsHint,
    description: row.description,
    sortOrder: row.sortOrder,
  };
}

async function load(force = false): Promise<CatalogueModel[]> {
  if (!force && cache && Date.now() - cache.at < REFRESH_MS) return cache.models;
  try {
    const rows = await db.aiModel.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
    const models = rows.map(fromRow).filter((m): m is CatalogueModel => m !== null);
    cache = { at: Date.now(), models: models.length ? models : BUILT_IN_MODELS };
  } catch {
    if (!cache) return BUILT_IN_MODELS;
  }
  return cache!.models;
}

export function forgetModelCache(): void {
  cache = null;
}

/** Every model in the catalogue (the admin's view), or only the enabled ones. */
export async function listModels(opts: { enabledOnly?: boolean; force?: boolean } = {}): Promise<CatalogueModel[]> {
  const models = await load(opts.force);
  return opts.enabledOnly ? models.filter((m) => m.enabled) : models;
}

/** The enabled models a customer can pick for a mode, the default first. */
export async function modelsForMode(mode: GenerationMode): Promise<CatalogueModel[]> {
  const models = (await listModels({ enabledOnly: true })).filter((m) => m.endpoints[mode]);
  return models.sort((a, b) => Number(b.defaultFor.includes(mode)) - Number(a.defaultFor.includes(mode)) || a.sortOrder - b.sortOrder);
}

/**
 * The model a new generation runs on: the one asked for when it is enabled and
 * can do the mode, otherwise the mode's default. Refuses a disabled model
 * rather than quietly swapping it, since the price may differ.
 */
export async function resolveModel(mode: GenerationMode, key?: string | null): Promise<CatalogueModel> {
  const options = await modelsForMode(mode);
  if (key) {
    const chosen = options.find((m) => m.key === key);
    if (!chosen) {
      throw new ApiError(422, "MODEL_UNAVAILABLE", `That model is not available for ${MODES[mode].label.toLowerCase()} right now. Pick another one.`);
    }
    return chosen;
  }
  const model = options[0];
  if (!model) throw new ApiError(503, "NO_MODEL", `No model is switched on for ${MODES[mode].label.toLowerCase()}. A platform admin can enable one.`);
  return model;
}

/** A model by key whatever its state (finishing a generation started before it was switched off). */
export async function modelByKey(key: string | null | undefined): Promise<CatalogueModel | null> {
  if (!key) return null;
  return (await listModels()).find((m) => m.key === key) ?? null;
}

// ── admin changes ────────────────────────────────────────────────────────

export const modelPatchSchema = z.object({
  label: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  enabled: z.boolean().optional(),
  defaultFor: z.array(z.enum(["image", "video", "animate", "extend"])).max(4).optional(),
  creditsPerImage: z.number().int().min(1).max(100_000).nullable().optional(),
  creditsPerStep: z.number().int().min(1).max(1_000_000).nullable().optional(),
  providerMilliCreditsHint: z.number().int().min(0).max(100_000_000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type ModelPatch = z.infer<typeof modelPatchSchema>;

/**
 * Saves one model. Making it the default for a mode takes that mode from any
 * other model; switching a model off hands its modes to the next enabled one.
 * Image and video must always keep at least one enabled model.
 */
export async function saveModel(principal: Principal, key: string, raw: unknown, request?: Request): Promise<CatalogueModel[]> {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only platform admins manage AI models.");
  const patch = modelPatchSchema.parse(raw);
  const all = await db.aiModel.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
  const row = all.find((r) => r.key === key);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Model not found.");
  const current = fromRow(row);
  if (!current) throw new ApiError(409, "CONFLICT", `This model's family "${row.family}" is not supported by this version.`);
  const spec = FAMILIES[current.family];

  const enabled = patch.enabled ?? row.enabled;
  if (spec.media === "IMAGE" && patch.creditsPerStep !== undefined && patch.creditsPerStep !== null) {
    throw new ApiError(422, "VALIDATION_FAILED", "Image models are priced per image.");
  }
  if (spec.media === "VIDEO" && patch.creditsPerImage !== undefined && patch.creditsPerImage !== null) {
    throw new ApiError(422, "VALIDATION_FAILED", "Video models are priced per started 5 seconds.");
  }
  let defaultFor = patch.defaultFor ?? current.defaultFor;
  const unsupported = defaultFor.filter((m) => !current.endpoints[m]);
  if (unsupported.length) throw new ApiError(422, "VALIDATION_FAILED", `${row.label} cannot ${unsupported.join(", ")}.`);
  if (!enabled) defaultFor = [];
  if (patch.defaultFor?.length && !enabled) throw new ApiError(422, "VALIDATION_FAILED", "Switch the model on before making it a default.");

  // Every mode the built-in models served must keep an enabled model after this change.
  const others = all.filter((r) => r.key !== key && r.enabled).map(fromRow).filter((m): m is CatalogueModel => m !== null);
  if (!enabled && row.enabled) {
    for (const mode of Object.keys(current.endpoints) as GenerationMode[]) {
      if (!others.some((o) => o.endpoints[mode])) {
        throw new ApiError(409, "LAST_MODEL", `${row.label} is the only model for ${MODES[mode].label.toLowerCase()}. Enable another one first.`);
      }
    }
  }

  const before = { enabled: row.enabled, defaultFor: row.defaultFor, creditsPerImage: row.creditsPerImage, creditsPerStep: row.creditsPerStep, label: row.label };
  await db.$transaction(async (tx) => {
    await tx.aiModel.update({
      where: { key },
      data: {
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.description !== undefined ? { description: patch.description || null } : {}),
        ...(patch.creditsPerImage !== undefined ? { creditsPerImage: patch.creditsPerImage } : {}),
        ...(patch.creditsPerStep !== undefined ? { creditsPerStep: patch.creditsPerStep } : {}),
        ...(patch.providerMilliCreditsHint !== undefined ? { providerMilliCreditsHint: patch.providerMilliCreditsHint } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        enabled,
        defaultFor,
        updatedById: principal.userId,
      },
    });
    // One default per mode: take the modes this model now claims from the others.
    for (const other of all.filter((r) => r.key !== key)) {
      const kept = other.defaultFor.filter((m) => !defaultFor.includes(m as GenerationMode));
      if (kept.length !== other.defaultFor.length) await tx.aiModel.update({ where: { key: other.key }, data: { defaultFor: kept } });
    }
    // Modes left without a default (this model switched off or let one go) go to the next enabled model.
    const lost = current.defaultFor.filter((m) => !defaultFor.includes(m));
    for (const mode of lost) {
      const heir = others.find((o) => o.endpoints[mode]);
      if (heir) {
        const fresh = await tx.aiModel.findUniqueOrThrow({ where: { key: heir.key }, select: { defaultFor: true } });
        if (!fresh.defaultFor.includes(mode)) await tx.aiModel.update({ where: { key: heir.key }, data: { defaultFor: [...fresh.defaultFor, mode] } });
      }
    }
  });

  const after = await db.aiModel.findUniqueOrThrow({ where: { key } });
  const changes: Record<string, string> = {};
  for (const k of Object.keys(before) as Array<keyof typeof before>) {
    const a = JSON.stringify(before[k]);
    const b = JSON.stringify(after[k]);
    if (a !== b) changes[k] = `${a} → ${b}`;
  }
  await audit({ organizationId: null, userId: principal.userId, action: "AI_MODEL_UPDATE", entity: "AiModel", entityId: key, changes, request });
  cache = null;
  return listModels({ force: true });
}
