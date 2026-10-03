import "server-only";

import crypto from "node:crypto";

import type { Principal } from "@/lib/rbac";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

import { removeStored, saveUpload, UploadError } from "./storage";

/**
 * Templates: a description and an image pack that a platform admin publishes
 * and every agency can browse and use in the Studio. They are global (no
 * organisation); agencies only ever see PUBLISHED ones.
 */

export const MAX_TEMPLATE_IMAGES = 24;

export const templateSchema = z.object({
  title: z.string().trim().min(3, "Give the template a title").max(120),
  description: z.string().trim().min(10, "Describe what the template is for").max(4000),
  category: z.string().trim().max(60).nullable().optional(),
  /** Put in front of the prompt when an agency uses the template */
  promptHint: z.string().trim().max(600).nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

function assertAdmin(principal: Principal) {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Platform admins only.");
}

function slugify(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "template";
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

const imageUrl = (id: string) => `/api/templates/images/${id}`;

export interface TemplateCard {
  id: string;
  title: string;
  description: string;
  category: string | null;
  status: string;
  imageCount: number;
  cover: string | null;
  updatedAt: Date;
}

function card(t: { id: string; title: string; description: string; category: string | null; status: string; updatedAt: Date; images: Array<{ id: string }>; _count: { images: number } }): TemplateCard {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    status: t.status,
    imageCount: t._count.images,
    cover: t.images[0] ? imageUrl(t.images[0].id) : null,
    updatedAt: t.updatedAt,
  };
}

const cardSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  status: true,
  updatedAt: true,
  images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }], take: 1, select: { id: true } },
  _count: { select: { images: true } },
};

/** What agencies browse: published templates only. */
export async function listPublished(): Promise<TemplateCard[]> {
  const rows = await db.template.findMany({ where: { status: "PUBLISHED" }, orderBy: { updatedAt: "desc" }, select: cardSelect });
  return rows.map(card);
}

/** Everything, drafts included, for the admin. */
export async function listAll(): Promise<TemplateCard[]> {
  const rows = await db.template.findMany({ orderBy: { updatedAt: "desc" }, select: cardSelect });
  return rows.map(card);
}

export async function getTemplate(id: string, opts: { includeDraft: boolean }) {
  const t = await db.template.findFirst({
    where: { id, ...(opts.includeDraft ? {} : { status: "PUBLISHED" }) },
    include: { images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  if (!t) throw new ApiError(404, "NOT_FOUND", "Template not found.");
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    promptHint: t.promptHint,
    status: t.status,
    updatedAt: t.updatedAt,
    images: t.images.map((i) => ({ id: i.id, url: imageUrl(i.id), caption: i.caption })),
  };
}

export async function createTemplate(principal: Principal, input: z.infer<typeof templateSchema>, request?: Request) {
  assertAdmin(principal);
  const t = await db.template.create({
    data: {
      title: input.title,
      slug: slugify(input.title),
      description: input.description,
      category: input.category || null,
      promptHint: input.promptHint || null,
      status: input.status,
      createdById: principal.userId,
    },
  });
  await audit({ userId: principal.userId, action: "TEMPLATE_CREATE", entity: "Template", entityId: t.id, changes: { title: t.title, status: t.status }, request });
  return t;
}

export async function updateTemplate(principal: Principal, id: string, input: Partial<z.infer<typeof templateSchema>>, request?: Request) {
  assertAdmin(principal);
  const existing = await db.template.findUnique({ where: { id }, select: { id: true, _count: { select: { images: true } } } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Template not found.");
  if (input.status === "PUBLISHED" && existing._count.images === 0) {
    throw new ApiError(422, "VALIDATION_FAILED", "Add at least one image to the pack before publishing.");
  }
  const t = await db.template.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description,
      category: input.category === undefined ? undefined : input.category || null,
      promptHint: input.promptHint === undefined ? undefined : input.promptHint || null,
      status: input.status,
    },
  });
  await audit({ userId: principal.userId, action: "TEMPLATE_UPDATE", entity: "Template", entityId: id, changes: { fields: Object.keys(input) }, request });
  return t;
}

export async function deleteTemplate(principal: Principal, id: string, request?: Request) {
  assertAdmin(principal);
  const t = await db.template.findUnique({ where: { id }, include: { images: { select: { storageKey: true } } } });
  if (!t) throw new ApiError(404, "NOT_FOUND", "Template not found.");
  await db.template.delete({ where: { id } });
  await Promise.all(t.images.map((i) => removeStored(i.storageKey)));
  await audit({ userId: principal.userId, action: "TEMPLATE_DELETE", entity: "Template", entityId: id, changes: { title: t.title }, request });
}

export async function addTemplateImages(principal: Principal, templateId: string, files: File[], caption: string | null, request?: Request) {
  assertAdmin(principal);
  const t = await db.template.findUnique({ where: { id: templateId }, select: { id: true, _count: { select: { images: true } } } });
  if (!t) throw new ApiError(404, "NOT_FOUND", "Template not found.");
  if (t._count.images + files.length > MAX_TEMPLATE_IMAGES) {
    throw new ApiError(422, "VALIDATION_FAILED", `A pack holds at most ${MAX_TEMPLATE_IMAGES} images.`);
  }
  const added: string[] = [];
  let order = t._count.images;
  for (const file of files) {
    const imageId = crypto.randomUUID();
    try {
      const saved = await saveUpload(file, `templates/${templateId}/${imageId}`);
      await db.templateImage.create({
        data: { id: imageId, templateId, storageKey: saved.key, mimeType: saved.mimeType, fileSizeBytes: saved.bytes, caption: caption || null, sortOrder: order++ },
      });
      added.push(imageId);
    } catch (e) {
      if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", `${file.name || "File"}: ${e.message}`);
      throw e;
    }
  }
  await db.template.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
  await audit({ userId: principal.userId, action: "TEMPLATE_UPDATE", entity: "Template", entityId: templateId, changes: { imagesAdded: added.length }, request });
  return added;
}

export async function removeTemplateImage(principal: Principal, templateId: string, imageId: string, request?: Request) {
  assertAdmin(principal);
  const img = await db.templateImage.findFirst({ where: { id: imageId, templateId } });
  if (!img) throw new ApiError(404, "NOT_FOUND", "Image not found.");
  const remaining = await db.templateImage.count({ where: { templateId } });
  const t = await db.template.findUnique({ where: { id: templateId }, select: { status: true } });
  if (t?.status === "PUBLISHED" && remaining <= 1) {
    throw new ApiError(409, "CONFLICT", "A published template needs at least one image. Unpublish it first, or add another image.");
  }
  await db.templateImage.delete({ where: { id: imageId } });
  await removeStored(img.storageKey);
  await db.template.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
  await audit({ userId: principal.userId, action: "TEMPLATE_UPDATE", entity: "Template", entityId: templateId, changes: { imageRemoved: imageId }, request });
}

/** The stored file of a template image the caller may see: published to everyone, drafts to admins. */
export async function templateImageFile(principal: Principal, imageId: string) {
  const img = await db.templateImage.findUnique({ where: { id: imageId }, include: { template: { select: { status: true } } } });
  if (!img) return null;
  if (img.template.status !== "PUBLISHED" && principal.role !== "SUPER_ADMIN") return null;
  return img.storageKey;
}

/** The text a used template adds in front of the prompt. */
export async function templateContext(templateId: string): Promise<{ id: string; title: string; text: string } | null> {
  const t = await db.template.findFirst({ where: { id: templateId, status: "PUBLISHED" }, select: { id: true, title: true, description: true, promptHint: true } });
  if (!t) return null;
  return { id: t.id, title: t.title, text: (t.promptHint?.trim() || t.description.trim()).slice(0, 600) };
}
