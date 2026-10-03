import "server-only";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { slugify } from "@/lib/identity";
import { effectiveLimits, assertWithinLimit } from "@/lib/limits";
import { assertOwned, scope } from "@/lib/tenant";
import { nextNumber as nextDocumentNumber } from "@/lib/numbering";
import type { Principal } from "@/lib/rbac";
import type { Prisma } from "@prisma/client";

/**
 * Brand management.
 *
 * Each brand belongs to one organization and has its own catalogue,
 * content tasks, and social channels. Brand count is limited by plan.
 */

async function uniqueSlug(orgId: string, name: string): Promise<string> {
  const base = slugify(name) || "brand";
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await db.brand.findFirst({ where: { organizationId: orgId, slug: candidate }, select: { id: true } }))) {
      return candidate;
    }
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createBrand(input: {
  organizationId: string;
  name: string;
  guidelines?: Record<string, unknown>;
  avatarUrl?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  timezone?: string;
  defaultCurrency?: string;
  createdById: string;
  request?: Request;
}): Promise<{ id: string; slug: string; brandNumber: string }> {
  const name = input.name.trim();
  if (name.length < 2) throw new ApiError(422, "VALIDATION_FAILED", "Enter the brand name.");

  const limits = effectiveLimits(
    (await db.organization.findUnique({ where: { id: input.organizationId }, select: { plan: true } }))?.plan ?? "TRIAL",
    (await db.organization.findUnique({ where: { id: input.organizationId }, select: { limitsOverride: true } }))?.limitsOverride,
  );
  const currentCount = await db.brand.count({ where: { organizationId: input.organizationId, status: "ACTIVE" } });
  assertWithinLimit(limits, "brands", currentCount);

  const slug = await uniqueSlug(input.organizationId, name);
  const brandNumber = await nextDocumentNumber(input.organizationId, "BRAND");

  const brand = await db.brand.create({
    data: {
      organizationId: input.organizationId,
      name,
      slug,
      brandNumber,
      guidelines: input.guidelines !== undefined ? (input.guidelines as Prisma.InputJsonValue) : undefined,
      avatarUrl: input.avatarUrl ?? null,
      contactName: input.contactName ?? null,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      website: input.website ?? null,
      timezone: input.timezone ?? "Africa/Nairobi",
      defaultCurrency: input.defaultCurrency ?? "KES",
      createdById: input.createdById,
    },
    select: { id: true, slug: true, brandNumber: true },
  });

  await audit({
    organizationId: input.organizationId,
    userId: input.createdById,
    action: "CREATE",
    entity: "Brand",
    entityId: brand.id,
    changes: { name, slug },
    request: input.request,
  });

  return brand;
}

export async function listBrands(principal: Principal, includeArchived = false) {
  const where = scope(principal);
  if (!includeArchived) (where as Record<string, unknown>).status = "ACTIVE";
  return db.brand.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      brandNumber: true,
      avatarUrl: true,
      status: true,
      _count: { select: { catalogueItems: true, tasks: true, posts: true, channels: true } },
      creator: { select: { name: true } },
    },
  });
}

export async function getBrandById(principal: Principal, brandId: string) {
  const brand = await db.brand.findUnique({
    where: { id: brandId },
    include: {
      catalogueItems: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
      channels: { where: { status: "ACTIVE" } },
      creator: { select: { name: true, email: true } },
      _count: { select: { tasks: true, posts: true, campaigns: true, catalogueItems: true, channels: true } },
    },
  });
  if (!brand) throw new ApiError(404, "NOT_FOUND", "Brand not found.");
  // Ensure ownership
  if (brand.organizationId !== principal.organizationId) throw new ApiError(403, "FORBIDDEN", "Not your brand.");
  return brand;
}

export async function updateBrand(
  principal: Principal,
  brandId: string,
  updates: Partial<{
    name: string;
    avatarUrl: string | null;
    guidelines: Record<string, unknown>;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
    status: string;
    timezone: string;
    defaultCurrency: string;
  }>,
) {
  const existing = await db.brand.findUnique({ where: { id: brandId }, select: { id: true, organizationId: true } });
  if (!existing || existing.organizationId !== principal.organizationId) throw new ApiError(404, "NOT_FOUND", "Brand not found.");

  // Only the fields the caller sent change; an explicit null clears one.
  const brand = await db.brand.update({
    where: { id: brandId },
    data: {
      ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
      ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
      ...(updates.guidelines !== undefined ? { guidelines: updates.guidelines as Prisma.InputJsonValue } : {}),
      ...(updates.contactName !== undefined ? { contactName: updates.contactName } : {}),
      ...(updates.contactEmail !== undefined ? { contactEmail: updates.contactEmail } : {}),
      ...(updates.contactPhone !== undefined ? { contactPhone: updates.contactPhone } : {}),
      ...(updates.website !== undefined ? { website: updates.website } : {}),
      ...(updates.status !== undefined
        ? { status: updates.status, archivedAt: updates.status === "ARCHIVED" ? new Date() : null }
        : {}),
      ...(updates.timezone !== undefined ? { timezone: updates.timezone } : {}),
      ...(updates.defaultCurrency !== undefined ? { defaultCurrency: updates.defaultCurrency } : {}),
    },
  });

  await audit({
    organizationId: principal.organizationId!,
    userId: principal.userId,
    action: "UPDATE",
    entity: "Brand",
    entityId: brandId,
    changes: updates,
  });

  return brand;
}

export async function getBrandTeamMembers(principal: Principal, brandId: string) {
  const existing = await db.brand.findUnique({ where: { id: brandId }, select: { id: true, organizationId: true } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Brand not found.");
  if (existing.organizationId !== principal.organizationId) throw new ApiError(403, "FORBIDDEN", "Not your brand.");

  return db.membership.findMany({
    where: { organizationId: existing.organizationId, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
}

export async function getBrandAnalytics(principal: Principal, brandId: string) {
  const existing = await db.brand.findUnique({ where: { id: brandId }, select: { id: true, organizationId: true } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Brand not found.");
  if (existing.organizationId !== principal.organizationId) throw new ApiError(403, "FORBIDDEN", "Not your brand.");

  return brandAnalytics(brandId);
}

/** Post counts and the engagement figures stored in each post's `metrics` JSON. */
export async function brandAnalytics(brandId: string) {
  const [totalPosts, published, recentPosts, leads, clicks] = await Promise.all([
    db.socialPost.count({ where: { brandId, status: { not: "ARCHIVED" } } }),
    db.socialPost.findMany({ where: { brandId, status: "PUBLISHED" }, select: { metrics: true } }),
    db.socialPost.findMany({
      where: { brandId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { channel: { select: { platform: true, name: true } } },
    }),
    db.contact.count({ where: { brandId } }),
    db.trackedLink.aggregate({ where: { campaign: { brandId } }, _sum: { clickCount: true } }),
  ]);
  const sum = (key: string) =>
    published.reduce((total, p) => {
      const v = (p.metrics as Record<string, unknown> | null)?.[key];
      return total + (typeof v === "number" ? v : 0);
    }, 0);
  const engagement = { likes: sum("likes"), comments: sum("comments"), shares: sum("shares") };
  return {
    totalPosts,
    publishedPosts: published.length,
    engagement: { ...engagement, total: engagement.likes + engagement.comments + engagement.shares },
    leads,
    clicks: clicks._sum.clickCount ?? 0,
    recentPosts,
  };
}

export async function deleteBrand(principal: Principal, brandId: string) {
  const existing = await db.brand.findUnique({ where: { id: brandId }, select: { id: true, organizationId: true } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Brand not found.");
  if (existing.organizationId !== principal.organizationId) throw new ApiError(403, "FORBIDDEN", "Not your brand.");

  await db.brand.update({
    where: { id: brandId },
    data: { status: "ARCHIVED", archivedAt: new Date() } as any,
  });

  await audit({
    organizationId: principal.organizationId!,
    userId: principal.userId,
    action: "ARCHIVE",
    entity: "Brand",
    entityId: brandId,
  });
}
