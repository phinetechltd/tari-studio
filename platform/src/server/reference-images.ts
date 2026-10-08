import "server-only";

import crypto from "node:crypto";

import { db } from "@/lib/db";
import type { StartImageRef } from "@/lib/studio-context";

import { GenerationProviderError, type GenerationProvider } from "./higgsfield";
import { bytesForProvider } from "./storage";
import { visibleWhere } from "./templates";

/**
 * The picture that starts a video: from a product, a character, the brand or a template.
 *
 * `storageKeyFor` only ever finds pictures the organisation may use (its own product, character
 * and brand pictures; published templates), so a request cannot point at someone else's file.
 * `providerUrlFor` scales the picture down if it is large, sends it to Higgsfield through its
 * upload flow, and remembers the returned URL by the picture's hash so the same picture is not
 * sent twice within the hour.
 */

export interface StartContext {
  brandId?: string | null;
  productId?: string | null;
  characterIds?: string[];
  templateId?: string | null;
}

/** How long a returned URL is reused. Higgsfield's upload link lasts an hour; we stay inside it. */
export const PROVIDER_FILE_TTL_MS = 50 * 60_000;

/** The stored file for a chosen picture, or null when it is not available to this organisation or context. */
export async function storageKeyFor(organizationId: string, ref: StartImageRef, ctx: StartContext): Promise<string | null> {
  if (ref.source === "product") {
    if (!ctx.productId) return null;
    const img = await db.productImage.findFirst({
      where: { id: ref.id, productId: ctx.productId, product: { organizationId, status: "ACTIVE" } },
      select: { storageKey: true },
    });
    return img?.storageKey ?? null;
  }
  if (ref.source === "character") {
    if (!ctx.characterIds || ctx.characterIds.length === 0) return null;
    const img = await db.characterImage.findFirst({
      where: { id: ref.id, characterId: { in: ctx.characterIds }, character: { organizationId, archivedAt: null } },
      select: { storageKey: true },
    });
    return img?.storageKey ?? null;
  }
  if (ref.source === "brand") {
    if (!ctx.brandId) return null;
    const b = await db.brand.findFirst({ where: { id: ctx.brandId, organizationId }, select: { coverImageKey: true, logoKey: true } });
    return (ref.id === "logo" ? b?.logoKey : b?.coverImageKey) ?? null;
  }
  if (ref.source === "template") {
    if (!ctx.templateId) return null;
    const img = await db.templateImage.findFirst({
      // A template this organisation may use, and never a picture from someone else's Pinterest pin
      // (those stay style references; animating them would copy another person's work).
      where: { id: ref.id, templateId: ctx.templateId, sourceOwned: true, template: visibleWhere(organizationId, { usable: true }) },
      select: { storageKey: true },
    });
    return img?.storageKey ?? null;
  }
  return null;
}

/** The picture used when the person did not choose one: the product's, else a character's. Brand and template pictures are opt-in. */
export async function defaultStartImage(organizationId: string, ctx: StartContext): Promise<StartImageRef | null> {
  const order = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];
  if (ctx.productId) {
    const img = await db.productImage.findFirst({ where: { productId: ctx.productId, product: { organizationId, status: "ACTIVE" } }, orderBy: order, select: { id: true } });
    if (img) return { source: "product", id: img.id };
  }
  for (const characterId of ctx.characterIds ?? []) {
    const img = await db.characterImage.findFirst({ where: { characterId, character: { organizationId, archivedAt: null } }, orderBy: order, select: { id: true } });
    if (img) return { source: "character", id: img.id };
  }
  // The brand's and the template's pictures are only used when the person picks them.
  return null;
}

/** Sends the picture to the provider (or reuses a recent upload) and returns the URL to pass as `image_url`. */
export async function providerUrlFor(organizationId: string, ref: StartImageRef, ctx: StartContext, provider: GenerationProvider): Promise<string> {
  const key = await storageKeyFor(organizationId, ref, ctx);
  if (!key) throw new GenerationProviderError("The starting picture is no longer available.", false);
  let prepared;
  try {
    prepared = await bytesForProvider(key);
  } catch (e) {
    throw new GenerationProviderError(`The starting picture could not be read (${(e as Error).message}).`, false);
  }
  const sha256 = crypto.createHash("sha256").update(prepared.bytes).digest("hex");
  const name = provider.name === "simulator" ? "SIMULATOR" : "HIGGSFIELD";
  const cached = await db.providerFile.findUnique({ where: { provider_sha256: { provider: name, sha256 } } });
  if (cached && cached.expiresAt.getTime() > Date.now()) return cached.url;

  const url = await provider.uploadImage(prepared.bytes, prepared.mimeType);
  const expiresAt = new Date(Date.now() + PROVIDER_FILE_TTL_MS);
  await db.providerFile.upsert({
    where: { provider_sha256: { provider: name, sha256 } },
    create: { provider: name, sha256, url, expiresAt },
    update: { url, expiresAt },
  });
  return url;
}
