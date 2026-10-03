import "server-only";

import crypto from "node:crypto";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { auditAs } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Principal } from "@/lib/rbac";
import { orgIdOf } from "@/lib/tenant";

import { copyStored, removeStored, saveUpload, UploadError } from "./storage";

/**
 * Characters: a mascot, a model or a persona an agency keeps images of, so the
 * same figure can appear across campaigns. A character belongs to one
 * organisation (and optionally one brand); its images are served only to that
 * organisation. In the Studio a character's name and description go into the
 * prompt.
 */

export const MAX_CHARACTER_IMAGES = 6;
export const MAX_CHARACTERS_PER_PROMPT = 3;

export const characterSchema = z.object({
  name: z.string().trim().min(2, "Name the character").max(80),
  description: z.string().trim().max(600).default(""),
  brandId: z.string().max(40).nullable().optional(),
});

const imageUrl = (id: string) => `/api/characters/images/${id}`;

async function owned(principal: Principal, id: string) {
  const c = await db.character.findFirst({ where: { id, organizationId: orgIdOf(principal) }, include: { images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } });
  if (!c) throw new ApiError(404, "NOT_FOUND", "Character not found.");
  return c;
}

async function checkBrand(organizationId: string, brandId: string | null | undefined) {
  if (!brandId) return null;
  const b = await db.brand.findFirst({ where: { id: brandId, organizationId }, select: { id: true } });
  if (!b) throw new ApiError(422, "VALIDATION_FAILED", "Pick one of your own brands.");
  return b.id;
}

export interface CharacterView {
  id: string;
  name: string;
  description: string;
  brandId: string | null;
  brandName: string | null;
  source: string;
  archived: boolean;
  cover: string | null;
  images: Array<{ id: string; url: string }>;
  campaigns: Array<{ id: string; name: string }>;
}

function view(c: {
  id: string;
  name: string;
  description: string;
  brandId: string | null;
  source: string;
  archivedAt: Date | null;
  images: Array<{ id: string }>;
  brand?: { name: string } | null;
  campaigns?: Array<{ campaign: { id: string; name: string } }>;
}): CharacterView {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    brandId: c.brandId,
    brandName: c.brand?.name ?? null,
    source: c.source,
    archived: c.archivedAt !== null,
    cover: c.images[0] ? imageUrl(c.images[0].id) : null,
    images: c.images.map((i) => ({ id: i.id, url: imageUrl(i.id) })),
    campaigns: (c.campaigns ?? []).map((x) => ({ id: x.campaign.id, name: x.campaign.name })),
  };
}

export async function listCharacters(organizationId: string, opts: { brandId?: string; includeArchived?: boolean } = {}): Promise<CharacterView[]> {
  const rows = await db.character.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }), ...(opts.brandId ? { brandId: opts.brandId } : {}) },
    orderBy: { updatedAt: "desc" },
    include: { images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }, brand: { select: { name: true } } },
  });
  return rows.map(view);
}

export async function getCharacter(principal: Principal, id: string): Promise<CharacterView> {
  const c = await db.character.findFirst({
    where: { id, organizationId: orgIdOf(principal) },
    include: {
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      brand: { select: { name: true } },
      campaigns: { include: { campaign: { select: { id: true, name: true } } } },
    },
  });
  if (!c) throw new ApiError(404, "NOT_FOUND", "Character not found.");
  return view(c);
}

export async function createCharacter(principal: Principal, input: z.infer<typeof characterSchema>, request?: Request) {
  const organizationId = orgIdOf(principal);
  const brandId = await checkBrand(organizationId, input.brandId);
  const c = await db.character.create({
    data: { organizationId, brandId, name: input.name, description: input.description, createdById: principal.userId },
  });
  await auditAs(principal, "CHARACTER_CREATE", "Character", c.id, { name: c.name }, request);
  return c;
}

export async function updateCharacter(principal: Principal, id: string, input: Partial<z.infer<typeof characterSchema>> & { archived?: boolean }, request?: Request) {
  const existing = await owned(principal, id);
  const brandId = input.brandId === undefined ? undefined : await checkBrand(existing.organizationId, input.brandId);
  const c = await db.character.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      brandId,
      archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
    },
  });
  await auditAs(principal, input.archived ? "CHARACTER_ARCHIVE" : "CHARACTER_UPDATE", "Character", id, { fields: Object.keys(input) }, request);
  return c;
}

export async function addCharacterImages(principal: Principal, id: string, files: File[], request?: Request) {
  const c = await owned(principal, id);
  if (c.images.length + files.length > MAX_CHARACTER_IMAGES) {
    throw new ApiError(422, "VALIDATION_FAILED", `A character holds at most ${MAX_CHARACTER_IMAGES} images.`);
  }
  let order = c.images.length;
  const added: string[] = [];
  for (const file of files) {
    const imageId = crypto.randomUUID();
    try {
      const saved = await saveUpload(file, `characters/${c.organizationId}/${id}/${imageId}`);
      await db.characterImage.create({ data: { id: imageId, characterId: id, storageKey: saved.key, mimeType: saved.mimeType, fileSizeBytes: saved.bytes, sortOrder: order++ } });
      added.push(imageId);
    } catch (e) {
      if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", `${file.name || "File"}: ${e.message}`);
      throw e;
    }
  }
  await db.character.update({ where: { id }, data: { updatedAt: new Date() } });
  await auditAs(principal, "CHARACTER_UPDATE", "Character", id, { imagesAdded: added.length }, request);
  return added;
}

export async function removeCharacterImage(principal: Principal, id: string, imageId: string, request?: Request) {
  await owned(principal, id);
  const img = await db.characterImage.findFirst({ where: { id: imageId, characterId: id } });
  if (!img) throw new ApiError(404, "NOT_FOUND", "Image not found.");
  await db.characterImage.delete({ where: { id: imageId } });
  await removeStored(img.storageKey);
  await auditAs(principal, "CHARACTER_UPDATE", "Character", id, { imageRemoved: imageId }, request);
}

/** Keeps a finished generated image as a new character. */
export async function characterFromAsset(principal: Principal, assetId: string, input: z.infer<typeof characterSchema>, request?: Request) {
  const organizationId = orgIdOf(principal);
  const asset = await db.generatedAsset.findFirst({
    where: { id: assetId, organizationId, status: "READY", mediaType: "IMAGE", archivedAt: null },
    select: { id: true, storageKey: true, brandId: true },
  });
  if (!asset?.storageKey) throw new ApiError(404, "NOT_FOUND", "Only a finished image can become a character.");
  const brandId = await checkBrand(organizationId, input.brandId ?? asset.brandId);
  const c = await db.character.create({
    data: { organizationId, brandId, name: input.name, description: input.description, source: "GENERATED", createdById: principal.userId },
  });
  const imageId = crypto.randomUUID();
  try {
    const saved = await copyStored(asset.storageKey, `characters/${organizationId}/${c.id}/${imageId}`);
    await db.characterImage.create({ data: { id: imageId, characterId: c.id, storageKey: saved.key, mimeType: saved.mimeType, fileSizeBytes: saved.bytes, assetId: asset.id } });
  } catch (e) {
    await db.character.delete({ where: { id: c.id } });
    if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
    throw e;
  }
  await auditAs(principal, "CHARACTER_CREATE", "Character", c.id, { name: c.name, fromAsset: asset.id }, request);
  return c;
}

/** The stored file of a character image, only for the organisation that owns it. */
export async function characterImageFile(principal: Principal, imageId: string): Promise<string | null> {
  const img = await db.characterImage.findFirst({
    where: { id: imageId, character: { organizationId: orgIdOf(principal) } },
    select: { storageKey: true },
  });
  return img?.storageKey ?? null;
}

// ── campaigns ───────────────────────────────────────────────────────────

export async function setCampaignCharacter(principal: Principal, campaignId: string, characterId: string, attached: boolean, request?: Request) {
  const organizationId = orgIdOf(principal);
  const [campaign, character] = await Promise.all([
    db.campaign.findFirst({ where: { id: campaignId, organizationId }, select: { id: true } }),
    db.character.findFirst({ where: { id: characterId, organizationId, archivedAt: null }, select: { id: true } }),
  ]);
  if (!campaign) throw new ApiError(404, "NOT_FOUND", "Campaign not found.");
  if (!character) throw new ApiError(404, "NOT_FOUND", "Character not found.");
  if (attached) {
    await db.campaignCharacter.upsert({ where: { campaignId_characterId: { campaignId, characterId } }, create: { campaignId, characterId }, update: {} });
  } else {
    await db.campaignCharacter.deleteMany({ where: { campaignId, characterId } });
  }
  await auditAs(principal, "CHARACTER_UPDATE", "Campaign", campaignId, { characterId, attached }, request);
}

// ── in the Studio ───────────────────────────────────────────────────────

/** Characters the Studio can add to a prompt: the organisation's own, not archived. */
export async function promptCharacters(organizationId: string, ids: string[]) {
  const unique = [...new Set(ids)].slice(0, MAX_CHARACTERS_PER_PROMPT);
  if (unique.length === 0) return [];
  return db.character.findMany({
    where: { id: { in: unique }, organizationId, archivedAt: null },
    select: { id: true, name: true, description: true },
  });
}
