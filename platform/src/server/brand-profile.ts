import "server-only";

import crypto from "node:crypto";
import path from "node:path";

import { ApiError } from "@/lib/api";
import { auditAs } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Principal } from "@/lib/rbac";
import { orgIdOf } from "@/lib/tenant";

import { removeStored, saveDocument, saveUpload, UploadError } from "./storage";

/**
 * A brand's profile beyond its name: a cover picture, a logo, and files kept with it
 * (a second picture, a style-guide PDF, a price list). Everything is stored under the
 * organisation and served only to it. The cover and logo are single slots: a new upload
 * replaces the old file. The slogan is a plain column on Brand (see brands.ts).
 */

export const MAX_BRAND_ATTACHMENTS = 12;
export type BrandImageKind = "cover" | "logo";

async function ownedBrand(principal: Principal, brandId: string) {
  const b = await db.brand.findFirst({
    where: { id: brandId, organizationId: orgIdOf(principal) },
    select: { id: true, organizationId: true, coverImageKey: true, logoKey: true },
  });
  if (!b) throw new ApiError(404, "NOT_FOUND", "Brand not found.");
  return b;
}

function asApi(e: unknown, file?: { name?: string }): never {
  if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", `${file?.name ? `${file.name}: ` : ""}${e.message}`);
  throw e;
}

/** Sets (replacing) the brand's cover or logo. */
export async function setBrandImage(principal: Principal, brandId: string, kind: BrandImageKind, file: File, request?: Request): Promise<void> {
  const b = await ownedBrand(principal, brandId);
  let saved;
  try {
    saved = await saveUpload(file, `brands/${b.organizationId}/${brandId}/${kind}-${crypto.randomUUID()}`);
  } catch (e) {
    asApi(e, file);
  }
  const previous = kind === "cover" ? b.coverImageKey : b.logoKey;
  await db.brand.update({
    where: { id: brandId },
    data: kind === "cover" ? { coverImageKey: saved.key, coverMimeType: saved.mimeType } : { logoKey: saved.key, logoMimeType: saved.mimeType },
  });
  if (previous) await removeStored(previous);
  await auditAs(principal, "BRAND_PROFILE_UPDATE", "Brand", brandId, { [kind]: "set" }, request);
}

export async function clearBrandImage(principal: Principal, brandId: string, kind: BrandImageKind, request?: Request): Promise<void> {
  const b = await ownedBrand(principal, brandId);
  const previous = kind === "cover" ? b.coverImageKey : b.logoKey;
  await db.brand.update({
    where: { id: brandId },
    data: kind === "cover" ? { coverImageKey: null, coverMimeType: null } : { logoKey: null, logoMimeType: null },
  });
  if (previous) await removeStored(previous);
  await auditAs(principal, "BRAND_PROFILE_UPDATE", "Brand", brandId, { [kind]: "removed" }, request);
}

/** The stored file of a brand's cover or logo, for the owning organisation only. */
export async function brandImageKey(principal: Principal, brandId: string, kind: BrandImageKind): Promise<string | null> {
  const b = await db.brand.findFirst({
    where: { id: brandId, organizationId: orgIdOf(principal) },
    select: { coverImageKey: true, logoKey: true },
  });
  return (kind === "cover" ? b?.coverImageKey : b?.logoKey) ?? null;
}

export interface AttachmentView {
  id: string;
  kind: "IMAGE" | "DOCUMENT";
  label: string;
  fileName: string;
  size: number;
  url: string;
}

const attachmentUrl = (brandId: string, id: string) => `/api/brands/${brandId}/attachments/${id}`;

export async function listAttachments(organizationId: string, brandId: string): Promise<AttachmentView[]> {
  const rows = await db.brandAttachment.findMany({ where: { brandId, organizationId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map((a) => ({ id: a.id, kind: a.kind as "IMAGE" | "DOCUMENT", label: a.label, fileName: a.fileName, size: a.fileSizeBytes, url: attachmentUrl(brandId, a.id) }));
}

/** Adds pictures or documents. A picture goes through the same size rules as every other picture. */
export async function addAttachments(principal: Principal, brandId: string, files: File[], request?: Request): Promise<string[]> {
  const b = await ownedBrand(principal, brandId);
  const have = await db.brandAttachment.count({ where: { brandId } });
  if (have + files.length > MAX_BRAND_ATTACHMENTS) {
    throw new ApiError(422, "VALIDATION_FAILED", `A brand keeps at most ${MAX_BRAND_ATTACHMENTS} files.`);
  }
  let order = have;
  const added: string[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const isDocument = /\.(pdf|docx|xlsx|pptx)$/i.test(file.name);
    try {
      const stem = `brands/${b.organizationId}/${brandId}/files/${id}`;
      const saved = isDocument ? await saveDocument(file, stem) : await saveUpload(file, stem);
      await db.brandAttachment.create({
        data: {
          id,
          brandId,
          organizationId: b.organizationId,
          kind: isDocument ? "DOCUMENT" : "IMAGE",
          label: path.basename(file.name, path.extname(file.name)).slice(0, 80) || "File",
          fileName: path.basename(file.name).slice(0, 120) || "file",
          storageKey: saved.key,
          mimeType: saved.mimeType,
          fileSizeBytes: saved.bytes,
          sortOrder: order++,
        },
      });
      added.push(id);
    } catch (e) {
      asApi(e, file);
    }
  }
  await auditAs(principal, "BRAND_PROFILE_UPDATE", "Brand", brandId, { attachmentsAdded: added.length }, request);
  return added;
}

export async function removeAttachment(principal: Principal, brandId: string, attachmentId: string, request?: Request): Promise<void> {
  await ownedBrand(principal, brandId);
  const a = await db.brandAttachment.findFirst({ where: { id: attachmentId, brandId } });
  if (!a) throw new ApiError(404, "NOT_FOUND", "File not found.");
  await db.brandAttachment.delete({ where: { id: attachmentId } });
  await removeStored(a.storageKey);
  await auditAs(principal, "BRAND_PROFILE_UPDATE", "Brand", brandId, { attachmentRemoved: attachmentId }, request);
}

export async function attachmentFile(principal: Principal, brandId: string, attachmentId: string) {
  const a = await db.brandAttachment.findFirst({
    where: { id: attachmentId, brandId, organizationId: orgIdOf(principal) },
    select: { storageKey: true, fileName: true, kind: true },
  });
  return a ?? null;
}

// ── how complete the profile is (used by the Autopilot readiness gate) ──

export interface ProfileState {
  hasSlogan: boolean;
  hasCover: boolean;
  hasLogo: boolean;
  complete: boolean;
}

export async function profileState(organizationId: string, brandId: string): Promise<ProfileState | null> {
  const b = await db.brand.findFirst({
    where: { id: brandId, organizationId },
    select: { slogan: true, coverImageKey: true, logoKey: true, avatarUrl: true },
  });
  if (!b) return null;
  const hasSlogan = Boolean(b.slogan?.trim());
  const hasCover = Boolean(b.coverImageKey);
  const hasLogo = Boolean(b.logoKey || b.avatarUrl);
  return { hasSlogan, hasCover, hasLogo, complete: hasSlogan && hasCover };
}
