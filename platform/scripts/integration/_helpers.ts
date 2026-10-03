import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import type { ModuleKey } from "@/lib/modules";
import type { Principal, Role } from "@/lib/rbac";

/**
 * Fixtures for the database-backed suite.
 *
 * Every test builds its own organisations and users with unique names instead
 * of consuming seeded rows, so the suite is repeatable and one file cannot
 * disturb another's assumptions.
 */

let counter = 0;
export const uid = (): string =>
  `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function makeOrg(over: Partial<{ name: string; plan: string; status: string; limitsOverride: object }> = {}) {
  const id = uid();
  return db.organization.create({
    data: { name: over.name ?? `Org ${id}`, slug: `org-${id}`, plan: over.plan ?? "TRIAL", status: over.status ?? "ACTIVE", ...(over.limitsOverride ? { limitsOverride: over.limitsOverride } : {}) },
  });
}

export const DEFAULT_PASSWORD = "correct-horse-battery-staple";

export async function makeUser(over: Partial<{ email: string; password: string; status: string; isPlatformAdmin: boolean; name: string }> = {}) {
  const password = over.password ?? DEFAULT_PASSWORD;
  const user = await db.user.create({
    data: {
      email: over.email ?? `${uid()}@test.example`,
      name: over.name ?? "Test User",
      passwordHash: await hashPassword(password),
      status: over.status ?? "ACTIVE",
      isPlatformAdmin: over.isPlatformAdmin ?? false,
    },
  });
  return { user, password };
}

export async function addMember(userId: string, organizationId: string, role: Exclude<Role, "SUPER_ADMIN"> | string, extra: string[] = []) {
  return db.membership.create({ data: { userId, organizationId, role, extraPermissions: extra } });
}

/** Direct DB write: fixtures bypass the prerequisite rules on purpose. */
export async function enableModules(organizationId: string, keys: ModuleKey[]) {
  for (const moduleKey of keys) {
    await db.organizationModule.upsert({
      where: { organizationId_moduleKey: { organizationId, moduleKey } },
      create: { organizationId, moduleKey, enabled: true },
      update: { enabled: true },
    });
  }
}

export function principal(over: Partial<Principal> & { role: Role }): Principal {
  return {
    userId: "u",
    organizationId: "o",
    extraPermissions: [],
    enabledModules: new Set<string>(),
    mfa: false,
    ...over,
  };
}

/** Resolves once `fn` rejects, returning the error; fails the test if it does not. */
export async function rejection(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error("Expected the promise to reject, but it resolved");
}
