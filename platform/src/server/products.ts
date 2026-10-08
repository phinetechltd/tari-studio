import "server-only";

import crypto from "node:crypto";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { auditAs } from "@/lib/audit";
import { db } from "@/lib/db";
import { INPUT_IMAGE_LIMITS } from "@/lib/generation-models";
import type { Principal } from "@/lib/rbac";
import { orgIdOf } from "@/lib/tenant";

import { notify } from "./notify";
import { removeStored, saveUpload, UploadError } from "./storage";

/**
 * Products (the table is still called CatalogueItem; it started as the brand catalogue).
 *
 * A product belongs to a brand. It has pictures, details, a price and, if the shop wants it,
 * a stock count with a history of every change. Pictures are served only to the organisation
 * that owns them. In the Studio and in Autopilot a product's name, description, price and
 * details go into the prompt and its first picture can start a video. Stock numbers never go
 * into a prompt, but a tracked product at zero is "out of stock" and is left out of Autopilot.
 */

export const MAX_PRODUCT_IMAGES = INPUT_IMAGE_LIMITS.perItem;
export const STOCK_REASONS = ["RESTOCK", "SALE", "ADJUSTMENT", "DAMAGED", "RETURN"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

const attributesSchema = z
  .record(z.string().trim().min(1).max(40), z.string().trim().max(200))
  .refine((o) => Object.keys(o).length <= 20, "Add at most 20 details");

/** Empty strings from a form mean "nothing"; the field is cleared. */
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === "" ? null : v));

export const productSchema = z.object({
  brandId: z.string().min(1).max(40),
  name: z.string().trim().min(1, "Enter the product name").max(200),
  sku: optionalText(80),
  description: optionalText(2000),
  priceCents: z.number().int().min(0).max(100_000_000_00).nullable().optional(),
  category: optionalText(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  unit: optionalText(30),
  url: z.union([z.string().trim().url().max(500), z.literal(""), z.null()]).optional().transform((v) => (v === "" ? null : v)),
  attributes: attributesSchema.optional(),
  trackStock: z.boolean().optional(),
  stockQty: z.number().int().min(0).max(10_000_000).optional(),
  lowStockAt: z.number().int().min(0).max(10_000_000).nullable().optional(),
  imageUrl: z.union([z.string().trim().url().max(500), z.literal(""), z.null()]).optional().transform((v) => (v === "" ? null : v)),
});
export type ProductInput = z.infer<typeof productSchema>;

export const productUpdateSchema = productSchema.partial().omit({ stockQty: true }).extend({ archived: z.boolean().optional() });

export const stockSchema = z
  .object({
    delta: z.number().int().min(-10_000_000).max(10_000_000).optional(),
    setTo: z.number().int().min(0).max(10_000_000).optional(),
    reason: z.enum(STOCK_REASONS).default("ADJUSTMENT"),
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => (v.delta === undefined) !== (v.setTo === undefined), "Send either a change (delta) or a new count (setTo)");

const imageUrl = (id: string) => `/api/products/images/${id}`;

export interface ProductView {
  id: string;
  brandId: string;
  brandName: string | null;
  name: string;
  sku: string | null;
  description: string | null;
  priceCents: number | null;
  category: string | null;
  tags: string[];
  unit: string | null;
  url: string | null;
  attributes: Record<string, string>;
  trackStock: boolean;
  stockQty: number | null;
  lowStockAt: number | null;
  lowStock: boolean;
  outOfStock: boolean;
  archived: boolean;
  cover: string | null;
  images: Array<{ id: string; url: string }>;
}

type Row = {
  id: string;
  brandId: string;
  name: string;
  sku: string | null;
  description: string | null;
  priceCents: number | null;
  category: string | null;
  tags: unknown;
  unit: string | null;
  url: string | null;
  attributes: unknown;
  trackStock: boolean;
  stockQty: number | null;
  lowStockAt: number | null;
  imageUrl: string | null;
  status: string;
  images: Array<{ id: string }>;
  brand?: { name: string } | null;
};

/** The two stock conditions every screen and Autopilot agree on. */
export function stockState(p: { trackStock: boolean; stockQty: number | null; lowStockAt: number | null }): { lowStock: boolean; outOfStock: boolean } {
  if (!p.trackStock) return { lowStock: false, outOfStock: false };
  const qty = p.stockQty ?? 0;
  return { outOfStock: qty <= 0, lowStock: qty > 0 && p.lowStockAt !== null && qty <= p.lowStockAt };
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function asRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string")) as Record<string, string>;
}

function view(p: Row): ProductView {
  const state = stockState(p);
  return {
    id: p.id,
    brandId: p.brandId,
    brandName: p.brand?.name ?? null,
    name: p.name,
    sku: p.sku,
    description: p.description,
    priceCents: p.priceCents,
    category: p.category,
    tags: asStrings(p.tags),
    unit: p.unit,
    url: p.url,
    attributes: asRecord(p.attributes),
    trackStock: p.trackStock,
    stockQty: p.trackStock ? (p.stockQty ?? 0) : null,
    lowStockAt: p.lowStockAt,
    ...state,
    archived: p.status === "ARCHIVED",
    cover: p.images[0] ? imageUrl(p.images[0].id) : p.imageUrl,
    images: p.images.map((i) => ({ id: i.id, url: imageUrl(i.id) })),
  };
}

const withImages = { images: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] }, brand: { select: { name: true } } };

async function ownedRow(principal: Principal, id: string) {
  const p = await db.catalogueItem.findFirst({ where: { id, organizationId: orgIdOf(principal) }, include: withImages });
  if (!p) throw new ApiError(404, "NOT_FOUND", "Product not found.");
  return p;
}

async function checkBrand(organizationId: string, brandId: string) {
  const b = await db.brand.findFirst({ where: { id: brandId, organizationId }, select: { id: true } });
  if (!b) throw new ApiError(422, "VALIDATION_FAILED", "Pick one of your own brands.");
}

export async function listProducts(
  organizationId: string,
  opts: { brandId?: string; includeArchived?: boolean; q?: string; onlyLowStock?: boolean } = {},
): Promise<ProductView[]> {
  const rows = await db.catalogueItem.findMany({
    where: {
      organizationId,
      ...(opts.includeArchived ? {} : { status: "ACTIVE" }),
      ...(opts.brandId ? { brandId: opts.brandId } : {}),
      ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { sku: { contains: opts.q, mode: "insensitive" } }, { category: { contains: opts.q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: withImages,
    take: 500,
  });
  const views = rows.map(view);
  return opts.onlyLowStock ? views.filter((v) => v.lowStock || v.outOfStock) : views;
}

export async function getProduct(principal: Principal, id: string): Promise<ProductView> {
  return view(await ownedRow(principal, id));
}

export async function createProduct(principal: Principal, input: ProductInput, request?: Request): Promise<ProductView> {
  const organizationId = orgIdOf(principal);
  await checkBrand(organizationId, input.brandId);
  const trackStock = input.trackStock ?? false;
  const stockQty = trackStock ? (input.stockQty ?? 0) : null;
  const created = await db.$transaction(async (tx) => {
    const p = await tx.catalogueItem.create({
      data: {
        organizationId,
        brandId: input.brandId,
        name: input.name,
        sku: input.sku ?? null,
        description: input.description ?? null,
        priceCents: input.priceCents ?? null,
        category: input.category ?? null,
        tags: input.tags ?? [],
        unit: input.unit ?? null,
        url: input.url ?? null,
        attributes: input.attributes ?? {},
        imageUrl: input.imageUrl ?? null,
        trackStock,
        stockQty,
        lowStockAt: trackStock ? (input.lowStockAt ?? null) : null,
        createdById: principal.userId,
      },
    });
    if (trackStock && stockQty && stockQty > 0) {
      await tx.stockMovement.create({
        data: { productId: p.id, organizationId, delta: stockQty, reason: "INITIAL", note: "Starting count", balanceAfter: stockQty, userId: principal.userId },
      });
    }
    return p;
  });
  await auditAs(principal, "PRODUCT_CREATE", "CatalogueItem", created.id, { name: created.name, brandId: created.brandId }, request);
  return getProduct(principal, created.id);
}

export async function updateProduct(
  principal: Principal,
  id: string,
  input: z.infer<typeof productUpdateSchema>,
  request?: Request,
): Promise<ProductView> {
  const existing = await ownedRow(principal, id);
  if (input.brandId && input.brandId !== existing.brandId) await checkBrand(existing.organizationId, input.brandId);
  const turningOn = input.trackStock === true && !existing.trackStock;
  await db.catalogueItem.update({
    where: { id },
    data: {
      brandId: input.brandId,
      name: input.name,
      sku: input.sku,
      description: input.description,
      priceCents: input.priceCents,
      category: input.category,
      tags: input.tags,
      unit: input.unit,
      url: input.url,
      attributes: input.attributes,
      imageUrl: input.imageUrl,
      trackStock: input.trackStock,
      // Switching tracking on starts the count at zero; switching it off keeps the history and the last count.
      stockQty: turningOn && existing.stockQty === null ? 0 : undefined,
      lowStockAt: input.lowStockAt,
      status: input.archived === undefined ? undefined : input.archived ? "ARCHIVED" : "ACTIVE",
      archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
    },
  });
  await auditAs(principal, input.archived ? "PRODUCT_ARCHIVE" : "PRODUCT_UPDATE", "CatalogueItem", id, { fields: Object.keys(input) }, request);
  return getProduct(principal, id);
}

/** Archiving hides a product from pickers and Autopilot; its pictures and history stay. */
export async function archiveProduct(principal: Principal, id: string, request?: Request): Promise<void> {
  await updateProduct(principal, id, { archived: true }, request);
}

// ── stock ───────────────────────────────────────────────────────────────

/**
 * Changes a tracked product's stock by `delta`, or sets the count to `setTo`. The row is locked
 * while the new count is worked out, so two people selling the last unit at once cannot both
 * succeed, and the count never goes below zero. Every change is written to the movement log.
 */
export async function adjustStock(principal: Principal, id: string, input: z.infer<typeof stockSchema>, request?: Request) {
  const organizationId = orgIdOf(principal);
  const result = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ trackStock: boolean; stockQty: number | null; lowStockAt: number | null; name: string }>>`
      SELECT "trackStock", "stockQty", "lowStockAt", "name" FROM "CatalogueItem"
      WHERE "id" = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "Product not found.");
    if (!row.trackStock) throw new ApiError(409, "STOCK_NOT_TRACKED", "Turn on stock tracking for this product first.");
    const before = row.stockQty ?? 0;
    const delta = input.setTo !== undefined ? input.setTo - before : input.delta!;
    const after = before + delta;
    if (after < 0) throw new ApiError(409, "INSUFFICIENT_STOCK", `Only ${before} in stock, so ${Math.abs(delta)} cannot be taken out.`, { inStock: before });
    await tx.catalogueItem.update({ where: { id }, data: { stockQty: after } });
    await tx.stockMovement.create({
      data: { productId: id, organizationId, delta, reason: input.reason, note: input.note ?? null, balanceAfter: after, userId: principal.userId },
    });
    return { before, after, lowStockAt: row.lowStockAt, name: row.name, delta };
  });
  await auditAs(principal, "PRODUCT_STOCK", "CatalogueItem", id, { delta: result.delta, reason: input.reason, after: result.after }, request);

  // Tell the team once, when the count crosses down through the warning level (or hits zero).
  const crossedLow = result.lowStockAt !== null && result.before > result.lowStockAt && result.after <= result.lowStockAt;
  const hitZero = result.before > 0 && result.after === 0;
  if (crossedLow || hitZero) {
    await notify({
      event: "product.low_stock",
      organizationId,
      title: result.after === 0 ? `${result.name} is out of stock` : `${result.name} is running low`,
      body: result.after === 0 ? "Autopilot will leave it out until you restock." : `${result.after} left. Restock soon.`,
      href: `/app/products/${id}`,
    }).catch((error) => console.error("[products] low-stock notice", error));
  }
  return { stockQty: result.after, delta: result.delta };
}

export async function listMovements(principal: Principal, id: string, take = 50) {
  await ownedRow(principal, id);
  const rows = await db.stockMovement.findMany({ where: { productId: id }, orderBy: { createdAt: "desc" }, take });
  return rows.map((m) => ({ id: m.id, delta: m.delta, reason: m.reason, note: m.note, balanceAfter: m.balanceAfter, createdAt: m.createdAt.toISOString() }));
}

// ── pictures ────────────────────────────────────────────────────────────

export async function addProductImages(principal: Principal, id: string, files: File[], request?: Request): Promise<string[]> {
  const p = await ownedRow(principal, id);
  if (p.images.length + files.length > MAX_PRODUCT_IMAGES) {
    throw new ApiError(422, "VALIDATION_FAILED", `A product holds at most ${MAX_PRODUCT_IMAGES} pictures.`);
  }
  let order = p.images.length;
  const added: string[] = [];
  for (const file of files) {
    const imageId = crypto.randomUUID();
    try {
      const saved = await saveUpload(file, `products/${p.organizationId}/${id}/${imageId}`);
      await db.productImage.create({
        data: { id: imageId, productId: id, storageKey: saved.key, mimeType: saved.mimeType, fileSizeBytes: saved.bytes, sortOrder: order++ },
      });
      added.push(imageId);
    } catch (e) {
      if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", `${file.name || "File"}: ${e.message}`);
      throw e;
    }
  }
  await db.catalogueItem.update({ where: { id }, data: { updatedAt: new Date() } });
  await auditAs(principal, "PRODUCT_UPDATE", "CatalogueItem", id, { imagesAdded: added.length }, request);
  return added;
}

export async function removeProductImage(principal: Principal, id: string, imageId: string, request?: Request): Promise<void> {
  await ownedRow(principal, id);
  const img = await db.productImage.findFirst({ where: { id: imageId, productId: id } });
  if (!img) throw new ApiError(404, "NOT_FOUND", "Picture not found.");
  await db.productImage.delete({ where: { id: imageId } });
  await removeStored(img.storageKey);
  await auditAs(principal, "PRODUCT_UPDATE", "CatalogueItem", id, { imageRemoved: imageId }, request);
}

/** The stored file of a product picture, only for the organisation that owns it. */
export async function productImageFile(principal: Principal, imageId: string): Promise<string | null> {
  const img = await db.productImage.findFirst({
    where: { id: imageId, product: { organizationId: orgIdOf(principal) } },
    select: { storageKey: true },
  });
  return img?.storageKey ?? null;
}

// ── in the Studio and Autopilot ─────────────────────────────────────────

export interface PromptProduct {
  id: string;
  brandId: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  unit: string | null;
  category: string | null;
  attributes: Record<string, string>;
  outOfStock: boolean;
  /** Stored picture keys, first picture first */
  imageKeys: string[];
}

/** A product the Studio may use: the organisation's own and not archived. No stock numbers leave this function. */
export async function promptProduct(organizationId: string, id: string): Promise<PromptProduct | null> {
  const p = await db.catalogueItem.findFirst({
    where: { id, organizationId, status: "ACTIVE" },
    include: { images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { storageKey: true } } },
  });
  if (!p) return null;
  return {
    id: p.id,
    brandId: p.brandId,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    unit: p.unit,
    category: p.category,
    attributes: asRecord(p.attributes),
    outOfStock: stockState(p).outOfStock,
    imageKeys: p.images.map((i) => i.storageKey),
  };
}
