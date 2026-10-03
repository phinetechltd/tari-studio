import assert from "node:assert/strict";
import { describe, it, after } from "node:test";

import { claimsFor, principalFromClaims, revokeAllSessions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { TenantError, assertOwned, crossTenantScope, orgIdOf, scope } from "@/lib/tenant";

import { addMember, enableModules, makeOrg, makeUser, principal } from "./_helpers";

const asClaims = (user: { id: string; name: string; email: string; tokenVersion: number }, org: string | null) =>
  claimsFor({ ...user, activeOrganizationId: org, isPlatformAdmin: false }, org);

describe("tenant scoping", () => {
  after(() => db.$disconnect());

  it("scope() pins queries to the principal's organisation", () => {
    const p = principal({ role: "OWNER", organizationId: "org_a" });
    assert.deepEqual(scope(p), { organizationId: "org_a" });
  });

  it("scope() refuses a principal with no organisation instead of returning an open filter", () => {
    const platform = principal({ role: "SUPER_ADMIN", organizationId: null });
    assert.throws(() => scope(platform), TenantError);
    assert.throws(() => orgIdOf(platform), TenantError);
  });

  it("narrows a designer to their own records, and only a designer", () => {
    const designer = principal({ role: "DESIGNER", organizationId: "o", userId: "u_d" });
    const manager = principal({ role: "BRAND_MANAGER", organizationId: "o", userId: "u_m" });
    assert.deepEqual(scope(designer, { selfField: "assigneeId" }), { organizationId: "o", assigneeId: "u_d" });
    assert.deepEqual(scope(manager, { selfField: "assigneeId" }), { organizationId: "o" });
    assert.deepEqual(scope(designer, { selfField: "assigneeId", ignoreSelfScope: true }), { organizationId: "o" });
  });

  it("assertOwned hides another tenant's record as if it did not exist", () => {
    const p = principal({ role: "OWNER", organizationId: "org_a" });
    assert.equal(assertOwned(p, { organizationId: "org_b", id: "x" }), null);
    assert.equal(assertOwned(p, null), null);
    assert.deepEqual(assertOwned(p, { organizationId: "org_a", id: "x" }), { organizationId: "org_a", id: "x" });
  });

  it("only a platform admin may cross a tenant boundary, and must name it", () => {
    const admin = principal({ role: "SUPER_ADMIN", organizationId: null });
    assert.deepEqual(crossTenantScope(admin, "org_x"), { organizationId: "org_x" });
    assert.throws(() => crossTenantScope(principal({ role: "OWNER", organizationId: "org_a" }), "org_b"), TenantError);
  });

  it("a scoped query returns this tenant's rows and never another's", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const { user } = await makeUser();
    await db.notification.createMany({
      data: [
        { organizationId: a.id, userId: user.id, kind: "t", title: "A1" },
        { organizationId: a.id, userId: user.id, kind: "t", title: "A2" },
        { organizationId: b.id, userId: user.id, kind: "t", title: "B1" },
      ],
    });

    const seenByA = await db.notification.findMany({ where: scope(principal({ role: "OWNER", organizationId: a.id })) });
    assert.deepEqual(seenByA.map((n) => n.title).sort(), ["A1", "A2"]);
    const seenByB = await db.notification.findMany({ where: scope(principal({ role: "OWNER", organizationId: b.id })) });
    assert.deepEqual(seenByB.map((n) => n.title), ["B1"]);
  });
});

describe("principal resolution reads live state", () => {
  it("takes the role from the membership in the active organisation", async () => {
    const org = await makeOrg();
    const { user } = await makeUser();
    await addMember(user.id, org.id, "APPROVER");
    await enableModules(org.id, ["CONTENT_STUDIO"]);

    const p = await principalFromClaims(asClaims(user, org.id));
    assert.ok(p);
    assert.equal(p.role, "APPROVER");
    assert.equal(p.organizationId, org.id);
    assert.equal(p.mfa, false);
    assert.equal(can(p, "content:approve"), true);
  });

  it("one person holds different roles in different organisations", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const { user } = await makeUser();
    await addMember(user.id, orgA.id, "DESIGNER");
    await addMember(user.id, orgB.id, "OWNER");

    assert.equal((await principalFromClaims(asClaims(user, orgA.id)))?.role, "DESIGNER");
    assert.equal((await principalFromClaims(asClaims(user, orgB.id)))?.role, "OWNER");
  });

  it("a claim naming an organisation the user does not belong to resolves to nothing", async () => {
    const mine = await makeOrg();
    const theirs = await makeOrg();
    const { user } = await makeUser();
    await addMember(user.id, mine.id, "OWNER");
    assert.equal(await principalFromClaims(asClaims(user, theirs.id)), null);
  });

  it("reflects module changes immediately, without a new sign-in", async () => {
    const org = await makeOrg();
    const { user } = await makeUser();
    await addMember(user.id, org.id, "OWNER");

    assert.equal(can((await principalFromClaims(asClaims(user, org.id)))!, "content:read"), false);
    await enableModules(org.id, ["CONTENT_STUDIO"]);
    assert.equal(can((await principalFromClaims(asClaims(user, org.id)))!, "content:read"), true);
    await db.organizationModule.update({
      where: { organizationId_moduleKey: { organizationId: org.id, moduleKey: "CONTENT_STUDIO" } },
      data: { enabled: false },
    });
    assert.equal(can((await principalFromClaims(asClaims(user, org.id)))!, "content:read"), false);
  });

  it("removing or suspending a membership takes effect on the next request", async () => {
    const org = await makeOrg();
    const { user } = await makeUser();
    const m = await addMember(user.id, org.id, "OWNER");
    assert.ok(await principalFromClaims(asClaims(user, org.id)));

    await db.membership.update({ where: { id: m.id }, data: { status: "SUSPENDED" } });
    assert.equal(await principalFromClaims(asClaims(user, org.id)), null);
  });

  it("a suspended organisation loses access even to a valid session", async () => {
    const org = await makeOrg();
    const { user } = await makeUser();
    await addMember(user.id, org.id, "OWNER");
    assert.ok(await principalFromClaims(asClaims(user, org.id)));

    await db.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED" } });
    assert.equal(await principalFromClaims(asClaims(user, org.id)), null);
  });

  it("a suspended user, or a bumped token version, revokes the session", async () => {
    const org = await makeOrg();
    const { user } = await makeUser();
    await addMember(user.id, org.id, "OWNER");
    const claims = asClaims(user, org.id);
    assert.ok(await principalFromClaims(claims));

    await revokeAllSessions(user.id);
    assert.equal(await principalFromClaims(claims), null, "old token must stop working after 'sign out everywhere'");

    const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(await principalFromClaims(asClaims(fresh, org.id)), "a newly issued token works");

    await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    assert.equal(await principalFromClaims(asClaims(fresh, org.id)), null);
  });

  it("platform mode is only for platform admins", async () => {
    const { user: ordinary } = await makeUser();
    assert.equal(await principalFromClaims(asClaims(ordinary, null)), null);

    const { user: admin } = await makeUser({ isPlatformAdmin: true });
    const p = await principalFromClaims(asClaims(admin, null));
    assert.ok(p);
    assert.equal(p.role, "SUPER_ADMIN");
    assert.equal(p.organizationId, null);
  });

  it("refuses a membership whose role is corrupt or tries to be SUPER_ADMIN", async () => {
    const org = await makeOrg();
    const { user: a } = await makeUser();
    const { user: b } = await makeUser();
    await addMember(a.id, org.id, "SUPER_ADMIN");
    await addMember(b.id, org.id, "GOD_MODE");
    assert.equal(await principalFromClaims(asClaims(a, org.id)), null, "SUPER_ADMIN is a platform flag, never a membership role");
    assert.equal(await principalFromClaims(asClaims(b, org.id)), null);
  });

  it("drops unknown permission grants instead of trusting them", async () => {
    const org = await makeOrg();
    const { user } = await makeUser();
    await addMember(user.id, org.id, "ANALYST", ["campaign:write", "platform:manage", "made:up"]);
    await enableModules(org.id, ["CAMPAIGN_TRACKING"]);
    const p = (await principalFromClaims(asClaims(user, org.id)))!;
    assert.ok(!p.extraPermissions.includes("made:up" as never));
    assert.equal(can(p, "campaign:write"), true);
  });
});
