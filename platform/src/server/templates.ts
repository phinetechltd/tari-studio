import "server-only";

import crypto from "node:crypto";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isPinterestImageUrl, pinPromptHint, type PinResult } from "@/lib/pinterest";
import type { Principal } from "@/lib/rbac";

import { accessTokenOf, activeAccount } from "./external-accounts";
import { pinFromLink, pinterest, pinterestFeatures } from "./pinterest";
import { removeStored, saveUpload, UploadError } from "./storage";

/**
 * Templates: a description and an image pack that shapes what the Studio makes.
 *
 *   platform templates   made by platform admins (organizationId null); every
 *                        organisation sees them once PUBLISHED
 *   organisation ones    made by an organisation; PRIVATE (its own team only)
 *                        or PUBLIC (every organisation, once PUBLISHED)
 *
 * A platform admin can hide a public template from everyone else (it stays
 * usable by the organisation that made it). Images can be uploaded or imported
 * from Pinterest with a credit link; an image from someone else's pin keeps its
 * template private, so other people's pictures are never shared platform-wide.
 */

export const MAX_TEMPLATE_IMAGES = 24;
const MAX_PIN_IMPORT = 12;

export const templateSchema = z.object({
  title: z.string().trim().min(3, "Give the template a title").max(120),
  description: z.string().trim().min(10, "Describe what the template is for").max(4000),
  category: z.string().trim().max(60).nullable().optional(),
  /** Put in front of the prompt when an agency uses the template */
  promptHint: z.string().trim().max(600).nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

export const orgTemplateSchema = templateSchema.extend({
  visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
});
export type OrgTemplateInput = z.infer<typeof orgTemplateSchema>;

function assertAdmin(principal: Principal) {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Platform admins only.");
}

function slugify(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "template";
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

const imageUrl = (id: string) => `/api/templates/images/${id}`;

/**
 * The templates an organisation may see and use: the platform's published
 * ones, its own (any state), and other organisations' published public ones
 * that no admin has hidden. `usable` drops drafts, for the Studio.
 */
export function visibleWhere(organizationId: string, opts: { usable?: boolean } = {}): Prisma.TemplateWhereInput {
  return {
    OR: [
      { organizationId: null, status: "PUBLISHED" },
      { organizationId, ...(opts.usable ? { status: "PUBLISHED" } : {}) },
      { organizationId: { not: organizationId }, visibility: "PUBLIC", status: "PUBLISHED", hiddenAt: null },
    ],
  };
}

export type TemplateScope = "platform" | "mine" | "shared";

export interface TemplateCard {
  id: string;
  title: string;
  description: string;
  category: string | null;
  status: string;
  visibility: string;
  scope: TemplateScope;
  hidden: boolean;
  fromPinterest: boolean;
  organizationName: string | null;
  imageCount: number;
  cover: string | null;
  /** False when the cover is someone else's Pinterest pin: never offered as a video's first frame */
  coverOwned: boolean;
  updatedAt: Date;
}

const cardSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  status: true,
  visibility: true,
  hiddenAt: true,
  organizationId: true,
  organization: { select: { name: true } },
  updatedAt: true,
  images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }], take: 1, select: { id: true, sourceOwned: true } },
  _count: { select: { images: true } },
} satisfies Prisma.TemplateSelect;

type CardRow = Prisma.TemplateGetPayload<{ select: typeof cardSelect }>;

async function cards(rows: CardRow[], viewerOrg: string | null): Promise<TemplateCard[]> {
  const pinterestIds = new Set(
    (
      await db.templateImage.groupBy({ by: ["templateId"], where: { templateId: { in: rows.map((r) => r.id) }, sourceProvider: "PINTEREST" } })
    ).map((g) => g.templateId),
  );
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    status: t.status,
    visibility: t.organizationId ? t.visibility : "PUBLIC",
    scope: t.organizationId === null ? "platform" : t.organizationId === viewerOrg ? "mine" : "shared",
    hidden: t.hiddenAt !== null,
    fromPinterest: pinterestIds.has(t.id),
    organizationName: t.organization?.name ?? null,
    imageCount: t._count.images,
    cover: t.images[0] ? imageUrl(t.images[0].id) : null,
    coverOwned: t.images[0]?.sourceOwned ?? true,
    updatedAt: t.updatedAt,
  }));
}

/** What an organisation browses (and, with `usable`, what the Studio offers). */
export async function listForOrganization(organizationId: string, opts: { usable?: boolean } = {}): Promise<TemplateCard[]> {
  const rows = await db.template.findMany({ where: visibleWhere(organizationId, opts), orderBy: { updatedAt: "desc" }, take: 300, select: cardSelect });
  return cards(rows, organizationId);
}

/** The platform's own published templates. */
export async function listPublished(): Promise<TemplateCard[]> {
  const rows = await db.template.findMany({ where: { organizationId: null, status: "PUBLISHED" }, orderBy: { updatedAt: "desc" }, select: cardSelect });
  return cards(rows, null);
}

/** The platform's own templates, drafts included, for the admin. */
export async function listAll(): Promise<TemplateCard[]> {
  const rows = await db.template.findMany({ where: { organizationId: null }, orderBy: { updatedAt: "desc" }, select: cardSelect });
  return cards(rows, null);
}

/** Organisations' public templates, hidden ones included, for the admin to moderate. */
export async function listShared(): Promise<TemplateCard[]> {
  const rows = await db.template.findMany({
    where: { organizationId: { not: null }, visibility: "PUBLIC", status: "PUBLISHED" },
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: cardSelect,
  });
  return cards(rows, null);
}

function detail(t: Prisma.TemplateGetPayload<{ include: { images: true; organization: { select: { name: true } } } }>) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    promptHint: t.promptHint,
    status: t.status,
    visibility: t.organizationId ? t.visibility : "PUBLIC",
    organizationId: t.organizationId,
    organizationName: t.organization?.name ?? null,
    hidden: t.hiddenAt !== null,
    hiddenReason: t.hiddenReason,
    updatedAt: t.updatedAt,
    images: t.images.map((i) => ({
      id: i.id,
      url: imageUrl(i.id),
      caption: i.caption,
      source: i.sourceProvider === "PINTEREST" ? { provider: "PINTEREST" as const, url: i.sourceUrl, author: i.sourceAuthor, authorUrl: i.sourceAuthorUrl, owned: i.sourceOwned } : null,
    })),
  };
}
export type TemplateDetail = ReturnType<typeof detail>;

const detailInclude = { images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] }, organization: { select: { name: true } } };

/** Any template, for platform admins (and drafts when asked). */
export async function getTemplate(id: string, opts: { includeDraft: boolean }) {
  const t = await db.template.findFirst({ where: { id, ...(opts.includeDraft ? {} : { status: "PUBLISHED" }) }, include: detailInclude });
  if (!t) throw new ApiError(404, "NOT_FOUND", "Template not found.");
  return detail(t);
}

/** A template as an organisation may see it. */
export async function getTemplateFor(organizationId: string, id: string) {
  const t = await db.template.findFirst({ where: { id, ...visibleWhere(organizationId) }, include: detailInclude });
  if (!t) throw new ApiError(404, "NOT_FOUND", "Template not found.");
  return detail(t);
}

/** Who may change a template: platform admins change platform templates; an organisation changes its own. */
async function editable(principal: Principal, id: string) {
  const t = await db.template.findUnique({ where: { id }, include: { images: { select: { id: true, sourceOwned: true, storageKey: true } } } });
  if (!t) throw new ApiError(404, "NOT_FOUND", "Template not found.");
  if (t.organizationId === null ? principal.role !== "SUPER_ADMIN" : t.organizationId !== principal.organizationId) {
    throw new ApiError(404, "NOT_FOUND", "Template not found.");
  }
  return t;
}

/** A public (or platform) published template must have images, all of them the organisation's to share. */
function assertShareable(t: { organizationId: string | null; images: Array<{ sourceOwned: boolean }> }, next: { status: string; visibility: string }) {
  const shared = next.status === "PUBLISHED" && (t.organizationId === null || next.visibility === "PUBLIC");
  if (next.status === "PUBLISHED" && t.images.length === 0) {
    throw new ApiError(422, "VALIDATION_FAILED", "Add at least one image to the pack before publishing.");
  }
  if (shared && t.images.some((i) => !i.sourceOwned)) {
    throw new ApiError(
      422,
      "NOT_YOURS_TO_SHARE",
      "This pack has images from other people's Pinterest pins. Keep it private, or remove those images before making it public.",
    );
  }
}

// ── platform admin: platform templates ──────────────────────────────────

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
      visibility: "PUBLIC",
      createdById: principal.userId,
    },
  });
  await audit({ userId: principal.userId, action: "TEMPLATE_CREATE", entity: "Template", entityId: t.id, changes: { title: t.title, status: t.status }, request });
  return t;
}

export async function updateTemplate(principal: Principal, id: string, input: Partial<z.infer<typeof templateSchema>>, request?: Request) {
  assertAdmin(principal);
  const existing = await editable(principal, id);
  if (input.status === "PUBLISHED") assertShareable(existing, { status: "PUBLISHED", visibility: "PUBLIC" });
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
  const t = await editable(principal, id);
  await db.template.delete({ where: { id } });
  await Promise.all(t.images.map((i) => removeStored(i.storageKey)));
  await audit({ organizationId: t.organizationId, userId: principal.userId, action: "TEMPLATE_DELETE", entity: "Template", entityId: id, changes: { title: t.title }, request });
}

/** Takes a public template out of (or back into) the shared list. The organisation keeps using it. */
export async function moderateTemplate(principal: Principal, id: string, input: { hidden: boolean; reason?: string | null }, request?: Request) {
  assertAdmin(principal);
  const t = await db.template.findUnique({ where: { id }, select: { id: true, organizationId: true, title: true } });
  if (!t || t.organizationId === null) throw new ApiError(404, "NOT_FOUND", "Organisation template not found.");
  const reason = input.reason?.trim().slice(0, 300) || null;
  if (input.hidden && !reason) throw new ApiError(422, "VALIDATION_FAILED", "Say why it is hidden; the organisation sees the reason.");
  await db.template.update({
    where: { id },
    data: input.hidden ? { hiddenAt: new Date(), hiddenReason: reason, hiddenById: principal.userId } : { hiddenAt: null, hiddenReason: null, hiddenById: null },
  });
  await audit({ organizationId: t.organizationId, userId: principal.userId, action: "TEMPLATE_UPDATE", entity: "Template", entityId: id, changes: { hidden: input.hidden, reason }, request });
}

// ── organisations: their own templates ──────────────────────────────────

export async function createOrgTemplate(principal: Principal, input: OrgTemplateInput, request?: Request) {
  const organizationId = principal.organizationId;
  if (!organizationId) throw new ApiError(403, "TENANT_REQUIRED", "Templates are made inside an organisation.");
  const count = await db.template.count({ where: { organizationId } });
  if (count >= 500) throw new ApiError(409, "LIMIT_REACHED", "This organisation has 500 templates. Delete some before adding more.");
  const t = await db.template.create({
    data: {
      title: input.title,
      slug: slugify(input.title),
      description: input.description,
      category: input.category || null,
      promptHint: input.promptHint || null,
      status: "DRAFT",
      visibility: input.visibility,
      organizationId,
      createdById: principal.userId,
    },
  });
  await audit({ organizationId, userId: principal.userId, action: "TEMPLATE_CREATE", entity: "Template", entityId: t.id, changes: { title: t.title, visibility: t.visibility }, request });
  return t;
}

export async function updateOrgTemplate(principal: Principal, id: string, input: Partial<OrgTemplateInput>, request?: Request) {
  const existing = await editable(principal, id);
  if (existing.organizationId === null) throw new ApiError(404, "NOT_FOUND", "Template not found.");
  const next = { status: input.status ?? existing.status, visibility: input.visibility ?? existing.visibility };
  assertShareable(existing, next);
  const t = await db.template.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description,
      category: input.category === undefined ? undefined : input.category || null,
      promptHint: input.promptHint === undefined ? undefined : input.promptHint || null,
      status: input.status,
      visibility: input.visibility,
    },
  });
  await audit({ organizationId: existing.organizationId, userId: principal.userId, action: "TEMPLATE_UPDATE", entity: "Template", entityId: id, changes: { fields: Object.keys(input), ...next }, request });
  return t;
}

// ── images ──────────────────────────────────────────────────────────────

export async function addTemplateImages(principal: Principal, templateId: string, files: File[], caption: string | null, request?: Request) {
  const t = await editable(principal, templateId);
  if (t.images.length + files.length > MAX_TEMPLATE_IMAGES) {
    throw new ApiError(422, "VALIDATION_FAILED", `A pack holds at most ${MAX_TEMPLATE_IMAGES} images.`);
  }
  const added: string[] = [];
  let order = t.images.length;
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
  await audit({ organizationId: t.organizationId, userId: principal.userId, action: "TEMPLATE_UPDATE", entity: "Template", entityId: templateId, changes: { imagesAdded: added.length }, request });
  return added;
}

export async function removeTemplateImage(principal: Principal, templateId: string, imageId: string, request?: Request) {
  const t = await editable(principal, templateId);
  const img = await db.templateImage.findFirst({ where: { id: imageId, templateId } });
  if (!img) throw new ApiError(404, "NOT_FOUND", "Image not found.");
  if (t.status === "PUBLISHED" && t.images.length <= 1) {
    throw new ApiError(409, "CONFLICT", "A published template needs at least one image. Unpublish it first, or add another image.");
  }
  await db.templateImage.delete({ where: { id: imageId } });
  await removeStored(img.storageKey);
  await db.template.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
  await audit({ organizationId: t.organizationId, userId: principal.userId, action: "TEMPLATE_UPDATE", entity: "Template", entityId: templateId, changes: { imageRemoved: imageId }, request });
}

/** The stored file of a template image the caller may see. */
export async function templateImageFile(principal: Principal, imageId: string) {
  const img = await db.templateImage.findUnique({
    where: { id: imageId },
    include: { template: { select: { status: true, organizationId: true, visibility: true, hiddenAt: true } } },
  });
  if (!img) return null;
  const t = img.template;
  if (principal.role === "SUPER_ADMIN" && principal.organizationId === null) return img.storageKey;
  if (t.organizationId === null) return t.status === "PUBLISHED" ? img.storageKey : null;
  if (t.organizationId === principal.organizationId) return img.storageKey;
  return t.visibility === "PUBLIC" && t.status === "PUBLISHED" && t.hiddenAt === null ? img.storageKey : null;
}

/** The text a used template adds in front of the prompt, when the organisation may use it. */
export async function templateContext(templateId: string, organizationId?: string): Promise<{ id: string; title: string; text: string } | null> {
  const t = await db.template.findFirst({
    where: { id: templateId, ...(organizationId ? visibleWhere(organizationId, { usable: true }) : { organizationId: null, status: "PUBLISHED" }) },
    select: { id: true, title: true, description: true, promptHint: true },
  });
  if (!t) return null;
  return { id: t.id, title: t.title, text: (t.promptHint?.trim() || t.description.trim()).slice(0, 600) };
}

// ── Pinterest ───────────────────────────────────────────────────────────

/** What the picker sends: a pin by id and where it was found. Only link and partner pins carry their own details. */
export const pinChoiceSchema = z.object({
  id: z.string().regex(/^\d{1,25}$/),
  source: z.enum(["own", "board", "partner", "link"]),
  link: z.string().url().max(500).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(1000).nullable().optional(),
  imageUrl: z.string().max(1000).optional(),
  author: z.string().max(120).nullable().optional(),
  authorUrl: z.string().url().max(500).nullable().optional(),
});
export type PinChoice = z.infer<typeof pinChoiceSchema>;

/**
 * Turns the picker's choices into pins we trust: own and board pins are looked
 * up again with the organisation's Pinterest sign-in (so "owned" is never the
 * browser's word), pasted links are read again from Pinterest, and partner
 * results are taken as someone else's.
 */
async function trustedPins(organizationId: string, choices: PinChoice[]): Promise<PinResult[]> {
  const needAccount = choices.some((c) => c.source === "own" || c.source === "board");
  const account = needAccount ? await activeAccount(organizationId, "PINTEREST") : null;
  if (needAccount && !account) throw new ApiError(409, "PINTEREST_NOT_CONNECTED", "Connect Pinterest to import your own pins.");
  const token = account ? accessTokenOf(account) : null;
  const out: PinResult[] = [];
  for (const c of choices) {
    if (c.source === "link") {
      out.push(await pinFromLink(c.link ?? `https://www.pinterest.com/pin/${c.id}/`));
      continue;
    }
    if (c.source === "partner") {
      if (!pinterestFeatures().partnerSearch) throw new ApiError(403, "FORBIDDEN", "Searching all of Pinterest is not switched on.");
      const sim = pinterestFeatures().simulated && c.imageUrl?.startsWith("/showcase/samples/");
      if (!c.imageUrl || (!isPinterestImageUrl(c.imageUrl) && !sim)) throw new ApiError(422, "VALIDATION_FAILED", "That pin's picture is not on Pinterest.");
      out.push({
        id: c.id,
        title: c.title?.trim() || "Pinterest pin",
        description: c.description ?? null,
        imageUrl: c.imageUrl,
        link: `https://www.pinterest.com/pin/${c.id}/`,
        author: c.author ?? null,
        authorUrl: c.authorUrl ?? null,
        owned: false,
        source: "partner",
      });
      continue;
    }
    if (!token || !account) throw new ApiError(409, "PINTEREST_NOT_CONNECTED", "Connect Pinterest again.");
    const pin = await pinterest().getPin({ token, pinId: c.id, username: account.handle ?? account.name });
    if (!pin) throw new ApiError(404, "PIN_NOT_FOUND", "One of the pins is no longer available on your Pinterest account.");
    out.push(pin);
  }
  return out;
}

/** Downloads a pin's picture (Pinterest's image CDN only; bundled samples on the simulator). */
async function pinImageBytes(pin: PinResult): Promise<Blob> {
  if (pin.imageUrl.startsWith("/showcase/samples/") && pinterestFeatures().simulated) {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.resolve(process.cwd(), "public", pin.imageUrl.slice(1));
    if (!file.startsWith(path.resolve(process.cwd(), "public") + path.sep)) throw new ApiError(422, "VALIDATION_FAILED", "Bad sample path.");
    return new Blob([await readFile(file)]);
  }
  if (!isPinterestImageUrl(pin.imageUrl)) throw new ApiError(422, "VALIDATION_FAILED", "That pin's picture is not on Pinterest.");
  let res: Response;
  try {
    res = await fetch(pin.imageUrl, { signal: AbortSignal.timeout(20_000), redirect: "error" });
  } catch {
    throw new ApiError(502, "PINTEREST_UNREACHABLE", "Could not download a pin's picture. Try again.");
  }
  if (!res.ok) throw new ApiError(502, "PINTEREST_UNREACHABLE", `Pinterest returned ${res.status} for a pin's picture.`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > 15 * 1024 * 1024) throw new ApiError(422, "VALIDATION_FAILED", "A pin's picture is too large.");
  return new Blob([await res.arrayBuffer()]);
}

/** Adds pins to a template's pack, each with its credit link. */
export async function importPins(principal: Principal, templateId: string, raw: unknown, request?: Request) {
  const choices = z.array(pinChoiceSchema).min(1, "Choose at least one pin.").max(MAX_PIN_IMPORT, `Import up to ${MAX_PIN_IMPORT} pins at a time.`).parse(raw);
  const t = await editable(principal, templateId);
  const organizationId = t.organizationId ?? principal.organizationId;
  if (!organizationId) throw new ApiError(422, "VALIDATION_FAILED", "Pinterest import works inside an organisation.");
  if (t.images.length + choices.length > MAX_TEMPLATE_IMAGES) throw new ApiError(422, "VALIDATION_FAILED", `A pack holds at most ${MAX_TEMPLATE_IMAGES} images.`);
  const shared = t.status === "PUBLISHED" && (t.organizationId === null || t.visibility === "PUBLIC");

  const pins = await trustedPins(organizationId, choices);
  if (shared && pins.some((p) => !p.owned)) {
    throw new ApiError(422, "NOT_YOURS_TO_SHARE", "This template is public, so only pins from your own Pinterest account can be added. Make it private first to use other people's pins.");
  }

  const added: string[] = [];
  let order = t.images.length;
  for (const pin of pins) {
    const imageId = crypto.randomUUID();
    let saved;
    try {
      saved = await saveUpload(await pinImageBytes(pin), `templates/${templateId}/${imageId}`);
    } catch (e) {
      if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", `"${pin.title}": ${e.message}`);
      throw e;
    }
    await db.templateImage.create({
      data: {
        id: imageId,
        templateId,
        storageKey: saved.key,
        mimeType: saved.mimeType,
        fileSizeBytes: saved.bytes,
        caption: pin.title.slice(0, 200),
        sortOrder: order++,
        sourceProvider: "PINTEREST",
        sourceUrl: pin.link,
        sourceExternalId: pin.id,
        sourceAuthor: pin.author,
        sourceAuthorUrl: pin.authorUrl,
        sourceOwned: pin.owned,
      },
    });
    added.push(imageId);
  }
  const hint = pinPromptHint(pins);
  await db.template.update({ where: { id: templateId }, data: { updatedAt: new Date(), ...(hint && !t.promptHint ? { promptHint: hint } : {}) } });
  await audit({
    organizationId: t.organizationId,
    userId: principal.userId,
    action: "TEMPLATE_UPDATE",
    entity: "Template",
    entityId: templateId,
    changes: { pinterestImported: pins.map((p) => ({ id: p.id, owned: p.owned })) },
    request,
  });
  return { added, owned: pins.filter((p) => p.owned).length, others: pins.filter((p) => !p.owned).length };
}

/**
 * The Studio's "From Pinterest": a new private template made from the chosen
 * pins, ready to use straight away.
 */
export async function templateFromPins(principal: Principal, raw: unknown, request?: Request) {
  const input = z.object({ pins: z.array(pinChoiceSchema).min(1).max(MAX_PIN_IMPORT), title: z.string().trim().max(120).optional() }).parse(raw);
  const organizationId = principal.organizationId;
  if (!organizationId) throw new ApiError(403, "TENANT_REQUIRED", "Templates are made inside an organisation.");
  const pins = await trustedPins(organizationId, input.pins);
  const title = (input.title || `Pinterest: ${pins[0]!.title}`).slice(0, 120);
  const t = await db.template.create({
    data: {
      title: title.length >= 3 ? title : `Pinterest ideas`,
      slug: slugify(title),
      description: `Made in the Studio from ${pins.length} Pinterest pin${pins.length === 1 ? "" : "s"}.`,
      promptHint: pinPromptHint(pins),
      status: "DRAFT",
      visibility: "PRIVATE",
      organizationId,
      createdById: principal.userId,
    },
  });
  await audit({ organizationId, userId: principal.userId, action: "TEMPLATE_CREATE", entity: "Template", entityId: t.id, changes: { title: t.title, from: "pinterest" }, request });
  try {
    await importPins(principal, t.id, input.pins, request);
  } catch (e) {
    await db.template.delete({ where: { id: t.id } }).catch(() => undefined);
    throw e;
  }
  const ready = await db.template.update({ where: { id: t.id }, data: { status: "PUBLISHED" }, include: { images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } } } });
  return { id: ready.id, title: ready.title, coverId: ready.images[0]?.id ?? null, coverUrl: ready.images[0] ? imageUrl(ready.images[0].id) : null };
}
