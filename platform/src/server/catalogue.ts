import "server-only";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { scope } from "@/lib/tenant";
import type { Principal } from "@/lib/rbac";

/**
 * Catalogue (product/service) management.
 *
 * Catalogue items belong to a brand and are used for content generation,
 * WhatsApp AI responses, and tracked link destinations.
 */

export async function createCatalogueItem(input: {
  organizationId: string;
  brandId: string;
  name: string;
  sku?: string;
  description?: string;
  priceCents?: number;
  imageUrl?: string;
  category?: string;
  tags?: string[];
  createdById: string;
  request?: Request;
}) {
  const name = input.name.trim();
  if (name.length < 1) throw new ApiError(422, "VALIDATION_FAILED", "Enter the product name.");

  // Verify brand ownership
  const brand = await db.brand.findUnique({ where: { id: input.brandId }, select: { id: true, organizationId: true } });
  if (!brand || brand.organizationId !== input.organizationId) {
    throw new ApiError(403, "FORBIDDEN", "Not your brand.");
  }

  const item = await db.catalogueItem.create({
    data: {
      brandId: input.brandId,
      organizationId: input.organizationId,
      name,
      sku: input.sku ?? null,
      description: input.description ?? null,
      priceCents: input.priceCents ?? null,
      imageUrl: input.imageUrl ?? null,
      category: input.category ?? null,
      tags: input.tags ?? [],
      createdById: input.createdById,
    },
  });

  await audit({
    organizationId: input.organizationId,
    userId: input.createdById,
    action: "CREATE",
    entity: "CatalogueItem",
    entityId: item.id,
    changes: { name, brandId: input.brandId },
    request: input.request,
  });

  return item;
}

export async function listCatalogueItems(principal: Principal, brandId?: string) {
  const where: Record<string, unknown> = scope(principal);
  if (brandId) where.brandId = brandId;
  return db.catalogueItem.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { brand: { select: { name: true } } },
  });
}

export async function updateCatalogueItem(
  principal: Principal,
  itemId: string,
  updates: Partial<{ name: string; sku: string; description: string; priceCents: number | null; imageUrl: string; category: string; tags: string[]; status: string }>,
) {
  const existing = await db.catalogueItem.findUnique({ where: { id: itemId }, select: { id: true, organizationId: true } });
  if (!existing || existing.organizationId !== principal.organizationId) throw new ApiError(404, "NOT_FOUND", "Product not found.");

  return db.catalogueItem.update({
    where: { id: itemId },
    data: {
      name: updates.name?.trim(),
      sku: updates.sku ?? undefined,
      description: updates.description ?? undefined,
      // null means "price on request"; leaving it out leaves the price alone.
      priceCents: updates.priceCents === undefined ? undefined : updates.priceCents,
      imageUrl: updates.imageUrl ?? undefined,
      category: updates.category ?? undefined,
      tags: updates.tags ?? undefined,
      status: updates.status ?? undefined,
    },
  });
}

export async function deleteCatalogueItem(principal: Principal, itemId: string) {
  const existing = await db.catalogueItem.findUnique({ where: { id: itemId }, select: { id: true, organizationId: true } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Product not found.");
  if (existing.organizationId !== principal.organizationId) throw new ApiError(403, "FORBIDDEN", "Not your product.");

  await db.catalogueItem.update({ where: { id: itemId }, data: { status: "ARCHIVED" } });
}
