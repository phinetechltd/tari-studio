import "server-only";

import { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { slugify } from "@/lib/identity";
import { LIMIT_KEYS, isPlanKey, type PlanKey } from "@/lib/limits";
import {
  MODULE_CATALOG,
  dependentsOf,
  isModuleKey,
  missingPrerequisites,
  type ModuleKey,
} from "@/lib/modules";

/**
 * Organisation provisioning — what a platform admin does to a tenant.
 *
 * Modules and limits are set by hand in Release 1 (there is no automated
 * billing); these functions are where the rules about them live so the console
 * and the API cannot disagree.
 */

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "agency";
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await db.organization.findUnique({ where: { slug: candidate }, select: { id: true } }))) {
      return candidate;
    }
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createOrganization(input: {
  name: string;
  plan?: PlanKey;
  timezone?: string;
  createdById: string | null;
}): Promise<{ id: string; slug: string }> {
  const name = input.name.trim();
  if (name.length < 2) throw new ApiError(422, "VALIDATION_FAILED", "Enter the agency's name.");
  const plan = input.plan ?? "TRIAL";
  if (!isPlanKey(plan)) throw new ApiError(422, "VALIDATION_FAILED", "Unknown plan.");

  const org = await db.organization.create({
    data: { name, slug: await uniqueSlug(name), plan, timezone: input.timezone ?? "Africa/Nairobi" },
    select: { id: true, slug: true },
  });
  await audit({
    organizationId: org.id,
    userId: input.createdById,
    action: "CREATE",
    entity: "Organization",
    entityId: org.id,
    changes: { name, plan },
  });
  return org;
}

/**
 * Enables or disables a module for a tenant, enforcing the requirements graph:
 * a module cannot be enabled before what it needs, nor disabled while something
 * enabled still needs it. Modules that have not shipped cannot be enabled.
 */
export async function setModuleEnabled(input: {
  organizationId: string;
  moduleKey: string;
  enabled: boolean;
  byUserId: string | null;
}): Promise<void> {
  if (!isModuleKey(input.moduleKey)) {
    throw new ApiError(422, "VALIDATION_FAILED", `Unknown module "${input.moduleKey}".`);
  }
  const key: ModuleKey = input.moduleKey;
  const def = MODULE_CATALOG[key];

  const rows = await db.organizationModule.findMany({
    where: { organizationId: input.organizationId, enabled: true },
    select: { moduleKey: true },
  });
  const enabled = new Set(rows.map((r) => r.moduleKey));

  if (input.enabled) {
    if (def.comingSoon) {
      throw new ApiError(409, "MODULE_UNAVAILABLE", `${def.name} has not been released yet (${def.release}).`);
    }
    const missing = missingPrerequisites(key, enabled);
    if (missing.length > 0) {
      throw new ApiError(
        409,
        "MODULE_PREREQUISITE",
        `${def.name} needs ${missing.map((m) => MODULE_CATALOG[m].name).join(", ")} enabled first.`,
        { missing },
      );
    }
  } else {
    const dependents = dependentsOf(key, enabled);
    if (dependents.length > 0) {
      throw new ApiError(
        409,
        "MODULE_IN_USE",
        `${dependents.map((m) => MODULE_CATALOG[m].name).join(", ")} depends on ${def.name}. Disable that first.`,
        { dependents },
      );
    }
  }

  await db.organizationModule.upsert({
    where: { organizationId_moduleKey: { organizationId: input.organizationId, moduleKey: key } },
    create: {
      organizationId: input.organizationId,
      moduleKey: key,
      enabled: input.enabled,
      enabledById: input.byUserId,
    },
    update: { enabled: input.enabled, enabledAt: new Date(), enabledById: input.byUserId },
  });

  await audit({
    organizationId: input.organizationId,
    userId: input.byUserId,
    action: input.enabled ? "MODULE_ENABLE" : "MODULE_DISABLE",
    entity: "OrganizationModule",
    entityId: key,
  });
}

/** Stores per-organisation limit overrides. `null` for a key means unlimited. */
export async function updateLimits(input: {
  organizationId: string;
  overrides: Record<string, number | null>;
  byUserId: string | null;
}): Promise<void> {
  const clean: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(input.overrides)) {
    if (!(LIMIT_KEYS as readonly string[]).includes(k)) {
      throw new ApiError(422, "VALIDATION_FAILED", `Unknown limit "${k}".`);
    }
    if (v !== null && (!Number.isFinite(v) || v < 0)) {
      throw new ApiError(422, "VALIDATION_FAILED", `Limit "${k}" must be zero or more, or unlimited.`);
    }
    clean[k] = v === null ? null : Math.floor(v);
  }

  await db.organization.update({
    where: { id: input.organizationId },
    data: { limitsOverride: clean as Prisma.InputJsonValue },
  });
  await audit({
    organizationId: input.organizationId,
    userId: input.byUserId,
    action: "LIMITS_UPDATE",
    entity: "Organization",
    entityId: input.organizationId,
    changes: clean,
  });
}

export async function setOrganizationStatus(input: {
  organizationId: string;
  status: "ACTIVE" | "SUSPENDED";
  byUserId: string | null;
}): Promise<void> {
  await db.organization.update({ where: { id: input.organizationId }, data: { status: input.status } });
  await audit({
    organizationId: input.organizationId,
    userId: input.byUserId,
    action: input.status === "SUSPENDED" ? "SUSPEND" : "ACTIVATE",
    entity: "Organization",
    entityId: input.organizationId,
  });
}

export async function setPlan(input: {
  organizationId: string;
  plan: string;
  byUserId: string | null;
}): Promise<void> {
  if (!isPlanKey(input.plan)) throw new ApiError(422, "VALIDATION_FAILED", "Unknown plan.");
  await db.organization.update({ where: { id: input.organizationId }, data: { plan: input.plan } });
  await audit({
    organizationId: input.organizationId,
    userId: input.byUserId,
    action: "UPDATE",
    entity: "Organization",
    entityId: input.organizationId,
    changes: { plan: input.plan },
  });
}
