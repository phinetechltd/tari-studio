import assert from "node:assert/strict";
import { describe, it, after } from "node:test";

import { db } from "@/lib/db";
import { effectiveLimits } from "@/lib/limits";
import {
  createOrganization,
  setModuleEnabled,
  setOrganizationStatus,
  setPlan,
  updateLimits,
} from "@/server/organizations";

import { makeOrg, rejection, uid } from "./_helpers";

const codeOf = (e: unknown) => (e as { code?: string }).code;

const enabledKeys = async (organizationId: string) =>
  (await db.organizationModule.findMany({ where: { organizationId, enabled: true } })).map((m) => m.moduleKey).sort();

describe("organisation provisioning", () => {
  after(() => db.$disconnect());

  it("creates an organisation with a unique slug and audits it", async () => {
    const name = `Acme Digital ${uid()}`;
    const a = await createOrganization({ name, createdById: null });
    const b = await createOrganization({ name, createdById: null });
    assert.notEqual(a.slug, b.slug, "two agencies with the same name must not collide");
    assert.ok(b.slug.startsWith(a.slug), "the second slug should extend the first with a suffix");
    assert.equal(await db.auditLog.count({ where: { organizationId: a.id, action: "CREATE" } }), 1);
  });

  it("rejects a blank name and an unknown plan", async () => {
    assert.equal(codeOf(await rejection(() => createOrganization({ name: " ", createdById: null }))), "VALIDATION_FAILED");
    assert.equal(codeOf(await rejection(() => createOrganization({ name: "Valid Name", plan: "PLATINUM" as never, createdById: null }))), "VALIDATION_FAILED");
  });
});

describe("module licensing rules", () => {
  it("enables a module with no prerequisites", async () => {
    const org = await makeOrg();
    await setModuleEnabled({ organizationId: org.id, moduleKey: "CONTENT_STUDIO", enabled: true, byUserId: null });
    assert.deepEqual(await enabledKeys(org.id), ["CONTENT_STUDIO"]);
    assert.equal(await db.auditLog.count({ where: { organizationId: org.id, action: "MODULE_ENABLE" } }), 1);
  });

  it("will not enable a module before what it needs", async () => {
    const org = await makeOrg();
    const err = await rejection(() => setModuleEnabled({ organizationId: org.id, moduleKey: "SOCIAL_PUBLISHING", enabled: true, byUserId: null }));
    assert.equal(codeOf(err), "MODULE_PREREQUISITE");
    assert.deepEqual(await enabledKeys(org.id), []);

    await setModuleEnabled({ organizationId: org.id, moduleKey: "CONTENT_STUDIO", enabled: true, byUserId: null });
    await setModuleEnabled({ organizationId: org.id, moduleKey: "SOCIAL_PUBLISHING", enabled: true, byUserId: null });
    assert.deepEqual(await enabledKeys(org.id), ["CONTENT_STUDIO", "SOCIAL_PUBLISHING"]);
  });

  it("will not disable a module something enabled still depends on", async () => {
    const org = await makeOrg();
    await setModuleEnabled({ organizationId: org.id, moduleKey: "CONTENT_STUDIO", enabled: true, byUserId: null });
    await setModuleEnabled({ organizationId: org.id, moduleKey: "SOCIAL_PUBLISHING", enabled: true, byUserId: null });

    const err = await rejection(() => setModuleEnabled({ organizationId: org.id, moduleKey: "CONTENT_STUDIO", enabled: false, byUserId: null }));
    assert.equal(codeOf(err), "MODULE_IN_USE");

    await setModuleEnabled({ organizationId: org.id, moduleKey: "SOCIAL_PUBLISHING", enabled: false, byUserId: null });
    await setModuleEnabled({ organizationId: org.id, moduleKey: "CONTENT_STUDIO", enabled: false, byUserId: null });
    assert.deepEqual(await enabledKeys(org.id), []);
  });

  it("refuses modules that have not been released", async () => {
    const org = await makeOrg();
    for (const key of ["QUOTATIONS", "HARDWARE_INVENTORY", "INSTALLATIONS", "SUPPORT_DESK", "CUSTOMER_INSIGHTS"]) {
      const err = await rejection(() => setModuleEnabled({ organizationId: org.id, moduleKey: key, enabled: true, byUserId: null }));
      assert.equal(codeOf(err), "MODULE_UNAVAILABLE", key);
    }
    assert.deepEqual(await enabledKeys(org.id), []);
  });

  it("enables the WhatsApp inbox only after Leads, which it files every contact into", async () => {
    const org = await makeOrg();
    const err = await rejection(() => setModuleEnabled({ organizationId: org.id, moduleKey: "WHATSAPP_AI", enabled: true, byUserId: null }));
    assert.equal(codeOf(err), "MODULE_PREREQUISITE");
    await setModuleEnabled({ organizationId: org.id, moduleKey: "LEADS_CRM", enabled: true, byUserId: null });
    await setModuleEnabled({ organizationId: org.id, moduleKey: "WHATSAPP_AI", enabled: true, byUserId: null });
    assert.deepEqual((await enabledKeys(org.id)).sort(), ["LEADS_CRM", "WHATSAPP_AI"]);
  });

  it("rejects an unknown module key", async () => {
    const org = await makeOrg();
    const err = await rejection(() => setModuleEnabled({ organizationId: org.id, moduleKey: "NOPE", enabled: true, byUserId: null }));
    assert.equal(codeOf(err), "VALIDATION_FAILED");
  });

  it("is idempotent: enabling twice leaves one row", async () => {
    const org = await makeOrg();
    await setModuleEnabled({ organizationId: org.id, moduleKey: "AI_CONTENT", enabled: true, byUserId: null });
    await setModuleEnabled({ organizationId: org.id, moduleKey: "AI_CONTENT", enabled: true, byUserId: null });
    assert.equal(await db.organizationModule.count({ where: { organizationId: org.id, moduleKey: "AI_CONTENT" } }), 1);
  });
});

describe("limits, plan and status", () => {
  it("stores overrides that effectiveLimits then applies", async () => {
    const org = await makeOrg({ plan: "STARTER" });
    await updateLimits({ organizationId: org.id, overrides: { brands: 9, seats: null }, byUserId: null });
    const row = await db.organization.findUniqueOrThrow({ where: { id: org.id } });
    const limits = effectiveLimits(row.plan, row.limitsOverride);
    assert.equal(limits.brands, 9);
    assert.equal(limits.seats, null);
    assert.equal(await db.auditLog.count({ where: { organizationId: org.id, action: "LIMITS_UPDATE" } }), 1);
  });

  it("rejects unknown or negative limits without storing anything", async () => {
    const org = await makeOrg();
    assert.equal(codeOf(await rejection(() => updateLimits({ organizationId: org.id, overrides: { bogus: 1 }, byUserId: null }))), "VALIDATION_FAILED");
    assert.equal(codeOf(await rejection(() => updateLimits({ organizationId: org.id, overrides: { brands: -1 }, byUserId: null }))), "VALIDATION_FAILED");
    assert.equal((await db.organization.findUniqueOrThrow({ where: { id: org.id } })).limitsOverride, null);
  });

  it("changes plan and suspends/reactivates, auditing each", async () => {
    const org = await makeOrg();
    await setPlan({ organizationId: org.id, plan: "GROWTH", byUserId: null });
    assert.equal((await db.organization.findUniqueOrThrow({ where: { id: org.id } })).plan, "GROWTH");
    assert.equal(codeOf(await rejection(() => setPlan({ organizationId: org.id, plan: "PLATINUM", byUserId: null }))), "VALIDATION_FAILED");

    await setOrganizationStatus({ organizationId: org.id, status: "SUSPENDED", byUserId: null });
    assert.equal((await db.organization.findUniqueOrThrow({ where: { id: org.id } })).status, "SUSPENDED");
    await setOrganizationStatus({ organizationId: org.id, status: "ACTIVE", byUserId: null });
    assert.equal(await db.auditLog.count({ where: { organizationId: org.id, action: { in: ["SUSPEND", "ACTIVATE"] } } }), 2);
  });
});
