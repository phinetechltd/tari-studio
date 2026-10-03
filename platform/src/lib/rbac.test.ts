import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MODULE_KEYS, MODULE_LIST, type ModuleKey } from "./modules";
import {
  ALL_PERMISSIONS,
  MFA_PERMISSIONS,
  PERMISSION_MODULE,
  ROLES,
  can,
  denialReason,
  isSelfScoped,
  permissionsOf,
  type Permission,
  type Principal,
  type Role,
} from "./rbac";

const R1_MODULES: ModuleKey[] = ["CONTENT_STUDIO", "SOCIAL_PUBLISHING", "CAMPAIGN_TRACKING", "AI_CONTENT"];

function principal(role: Role, over: Partial<Principal> = {}): Principal {
  return {
    userId: "u1",
    organizationId: role === "SUPER_ADMIN" ? null : "org1",
    role,
    extraPermissions: [],
    enabledModules: new Set<string>(R1_MODULES),
    mfa: true,
    ...over,
  };
}

describe("rbac", () => {
  it("an unlicensed module denies the permission even to an Owner", () => {
    const owner = principal("OWNER", { enabledModules: new Set() });
    assert.equal(can(owner, "content:read"), false);
    assert.equal(denialReason(owner, "content:read"), "module");
    // Core permissions are never module-gated.
    assert.equal(can(owner, "brand:write"), true);
  });

  it("licensing alone does not grant a role a permission", () => {
    const designer = principal("DESIGNER");
    assert.equal(can(designer, "content:approve"), false);
    assert.equal(denialReason(designer, "content:approve"), "role");
  });

  it("role is checked before module, so a Designer is told 'role', not 'buy a module'", () => {
    const designer = principal("DESIGNER", { enabledModules: new Set() });
    assert.equal(denialReason(designer, "content:approve"), "role");
  });

  it("permissions that can publish under a client's accounts need MFA", () => {
    const approverNoMfa = principal("APPROVER", { mfa: false });
    assert.equal(denialReason(approverNoMfa, "content:approve"), "mfa");
    assert.equal(denialReason(principal("APPROVER"), "content:approve"), null);

    const ownerNoMfa = principal("OWNER", { mfa: false });
    for (const p of MFA_PERMISSIONS) assert.equal(denialReason(ownerNoMfa, p), "mfa", p);
    // ...but ordinary reads do not.
    assert.equal(denialReason(ownerNoMfa, "brand:read"), null);
  });

  it("per-member grants extend a role, and still respect the module gate", () => {
    const analyst = principal("ANALYST", { extraPermissions: ["campaign:write"] });
    assert.equal(can(analyst, "campaign:write"), true);

    const noModule = principal("ANALYST", {
      extraPermissions: ["campaign:write"],
      enabledModules: new Set(),
    });
    assert.equal(can(noModule, "campaign:write"), false);
  });

  it("a platform admin passes every check and is never asked for a module", () => {
    const admin = principal("SUPER_ADMIN", { enabledModules: new Set() });
    for (const p of ALL_PERMISSIONS) assert.equal(can(admin, p), true, p);
    assert.equal(denialReason(admin, "channel:connect"), null);
  });

  it("only a platform admin holds platform:manage", () => {
    for (const role of ROLES) {
      assert.equal(permissionsOf(role).includes("platform:manage"), role === "SUPER_ADMIN", role);
    }
  });

  it("only a Designer is self-scoped", () => {
    for (const role of ROLES) assert.equal(isSelfScoped(principal(role)), role === "DESIGNER", role);
  });

  it("a Designer holds the narrowest set and cannot see money-adjacent or admin surfaces", () => {
    const perms = permissionsOf("DESIGNER");
    assert.deepEqual([...perms].sort(), ["brand:read", "catalogue:read", "task:work"]);
  });

  it("nobody but Owners can connect channels, and Marketers cannot approve their own work", () => {
    for (const role of ROLES) {
      if (role === "SUPER_ADMIN") continue;
      assert.equal(permissionsOf(role).includes("channel:connect"), role === "OWNER", role);
    }
    assert.equal(permissionsOf("MARKETER").includes("content:approve"), false);
    assert.equal(permissionsOf("BRAND_MANAGER").includes("content:approve"), false);
  });

  it("the permission→module map only names real modules and real permissions", () => {
    const all = new Set<string>(ALL_PERMISSIONS);
    for (const [perm, mod] of Object.entries(PERMISSION_MODULE)) {
      assert.ok(all.has(perm), `${perm} is in PERMISSION_MODULE but no role carries it`);
      assert.ok((MODULE_KEYS as readonly string[]).includes(mod as string), `${perm} → unknown module ${mod}`);
    }
  });

  it("every gated permission maps to a module that has actually shipped", () => {
    const shipped = new Set(MODULE_LIST.filter((m) => !m.comingSoon).map((m) => m.key));
    for (const [perm, mod] of Object.entries(PERMISSION_MODULE) as Array<[Permission, ModuleKey]>) {
      assert.ok(shipped.has(mod), `${perm} is gated on ${mod}, which cannot be enabled yet`);
    }
  });
});
