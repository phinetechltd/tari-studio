import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import type { Principal } from "@/lib/rbac";
import { wallet } from "@/server/credits";
import { settleIntent, startPayment } from "@/server/payments";
import {
  adminAdjustCredits,
  adminManageSubscription,
  adminUpdateMember,
  listPayments,
  listSubscriptions,
  paymentsCsv,
  recheckPayment,
  revenueSummary,
} from "@/server/platform-admin";
import { renewDuePlans } from "@/server/subscriptions";

import { addMember, makeOrg, makeUser, rejection, uid } from "./_helpers";

async function tenant(name?: string) {
  const org = await makeOrg({ plan: "TRIAL", ...(name ? { name } : {}) });
  const { user } = await makeUser();
  const owner = await addMember(user.id, org.id, "OWNER");
  return { orgId: org.id, ownerId: user.id, ownerMembershipId: (owner as { id: string }).id };
}

async function paid(orgId: string, amountCents = 155_000) {
  const { intent } = await startPayment({
    organizationId: orgId,
    purpose: "CREDITS",
    credits: 10,
    phone: "254712345678",
    amountCents,
    reference: "TARI",
    description: "credits",
  });
  return settleIntent(intent.id);
}

describe("platform admin: billing and organisations", () => {
  let admin: Principal;

  before(async () => {
    process.env.SIMULATOR_PIN_MS = "0";
    resetEnvCache();
    const { user } = await makeUser({ isPlatformAdmin: true });
    admin = { userId: user.id, organizationId: null, role: "SUPER_ADMIN", extraPermissions: [], enabledModules: new Set(), mfa: true };
  });
  after(() => db.$disconnect());

  it("adds and removes credits with a reason, never below zero, and audits it", async () => {
    const t = await tenant();
    assert.equal((await adminAdjustCredits(admin, t.orgId, 50, "launch goodwill")).balance, 50);
    assert.equal((await adminAdjustCredits(admin, t.orgId, -20, "correction")).balance, 30);
    const tooMuch = await rejection(() => adminAdjustCredits(admin, t.orgId, -31, "too much"));
    assert.ok(tooMuch instanceof ApiError);
    assert.equal(tooMuch.status, 409);
    const noReason = await rejection(() => adminAdjustCredits(admin, t.orgId, 5, " "));
    assert.ok(noReason instanceof ApiError);
    assert.equal((await wallet(t.orgId)).credits, 30);
    assert.equal(await db.tokenLedger.count({ where: { organizationId: t.orgId, reason: "ADJUST" } }), 2);
    assert.equal(await db.auditLog.count({ where: { organizationId: t.orgId, action: "CREDITS_ADJUST" } }), 2);

    const owner = { ...admin, role: "OWNER" as const, organizationId: t.orgId };
    const denied = await rejection(() => adminAdjustCredits(owner, t.orgId, 1000, "free credits please"));
    assert.ok(denied instanceof ApiError);
    assert.equal(denied.status, 403);
  });

  it("gives a complimentary plan that grants credits, raises limits, charges nothing and ends by itself", async () => {
    const t = await tenant();
    const view = await adminManageSubscription(admin, t.orgId, { action: "grant", plan: "PRO", cycle: "MONTHLY", reason: "launch partner" });
    assert.equal(view.plan, "PRO");
    assert.equal(view.paymentMethod, "COMP");
    assert.equal(view.autoRenew, false);
    assert.equal((await wallet(t.orgId)).credits, 600);
    assert.equal((await db.organization.findUniqueOrThrow({ where: { id: t.orgId } })).plan, "GROWTH");

    await db.subscription.update({ where: { organizationId: t.orgId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await renewDuePlans();
    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: t.orgId } });
    assert.equal(sub.status, "EXPIRED");
    assert.equal(await db.paymentIntent.count({ where: { organizationId: t.orgId } }), 0, "nothing was charged");
    assert.equal((await db.organization.findUniqueOrThrow({ where: { id: t.orgId } })).plan, "TRIAL", "limits went back");
    assert.equal((await wallet(t.orgId)).credits, 600, "credits stay");
  });

  it("extends a plan (clearing a failed renewal) and ends one now", async () => {
    const t = await tenant();
    await adminManageSubscription(admin, t.orgId, { action: "grant", plan: "BASIC", cycle: "MONTHLY", reason: "pilot" });
    const before = await db.subscription.findUniqueOrThrow({ where: { organizationId: t.orgId } });
    await db.subscription.update({ where: { id: before.id }, data: { status: "PAST_DUE", renewalAttempts: 2 } });

    await adminManageSubscription(admin, t.orgId, { action: "extend", days: 10, reason: "outage" });
    const extended = await db.subscription.findUniqueOrThrow({ where: { id: before.id } });
    assert.equal(extended.currentPeriodEnd.getTime() - before.currentPeriodEnd.getTime(), 10 * 86_400_000);
    assert.equal(extended.status, "ACTIVE");
    assert.equal(extended.renewalAttempts, 0);

    await adminManageSubscription(admin, t.orgId, { action: "end", reason: "asked to stop" });
    assert.equal((await db.subscription.findUniqueOrThrow({ where: { id: before.id } })).status, "EXPIRED");
    const again = await rejection(() => adminManageSubscription(admin, t.orgId, { action: "extend", days: 5, reason: "too late" }));
    assert.ok(again instanceof ApiError);
    assert.equal(again.status, 409);
  });

  it("never leaves an organisation without an active Owner", async () => {
    const t = await tenant();
    const demote = await rejection(() => adminUpdateMember(admin, t.orgId, t.ownerMembershipId, { role: "ANALYST" }));
    assert.ok(demote instanceof ApiError);
    assert.equal(demote.code, "LAST_OWNER");
    const suspend = await rejection(() => adminUpdateMember(admin, t.orgId, t.ownerMembershipId, { status: "SUSPENDED" }));
    assert.equal((suspend as ApiError).code, "LAST_OWNER");

    const { user } = await makeUser();
    const second = (await addMember(user.id, t.orgId, "MARKETER")) as { id: string };
    await adminUpdateMember(admin, t.orgId, second.id, { role: "OWNER" });
    await adminUpdateMember(admin, t.orgId, t.ownerMembershipId, { role: "ANALYST" });
    assert.equal((await db.membership.findUniqueOrThrow({ where: { id: t.ownerMembershipId } })).role, "ANALYST");
    const bad = await rejection(() => adminUpdateMember(admin, t.orgId, second.id, { role: "SUPER_ADMIN" }));
    assert.ok(bad instanceof ApiError);
    assert.equal(await db.auditLog.count({ where: { organizationId: t.orgId, action: "MEMBER_UPDATE" } }), 2);
  });

  it("lists, totals and exports payments across organisations, with filters", async () => {
    const name = `=Formula Agency ${uid()}`;
    const t = await tenant(name);
    await paid(t.orgId, 155_000);
    await paid(t.orgId, 55_000);
    const { intent: failed } = await startPayment({
      organizationId: t.orgId,
      purpose: "CREDITS",
      credits: 1,
      phone: "254700000101", // the simulator's "customer cancelled"
      amountCents: 55_000,
      reference: "TARI",
      description: "credits",
    });
    await settleIntent(failed.id);

    const all = await listPayments({ org: t.orgId });
    assert.equal(all.total, 3);
    assert.equal(all.collectedCents, 210_000);
    assert.equal(all.rows[0]!.organizationName, name);
    assert.equal((await listPayments({ org: t.orgId, status: "FAILED" })).total, 1);
    assert.equal((await listPayments({ org: t.orgId, method: "PAYSTACK" })).total, 0);
    assert.equal((await listPayments({ q: name.slice(1, 20) })).total >= 3, true, "search by organisation name");

    const csv = await paymentsCsv({ org: t.orgId });
    assert.match(csv, /"Created \(EAT\)"/);
    assert.ok(csv.includes(`"'${name}"`), "a cell starting with = is neutralised for spreadsheets");
    assert.equal(csv.trim().split("\r\n").length, 4, "header + three payments");

    const summary = await revenueSummary();
    assert.ok(summary.monthCents >= 210_000);
    assert.ok(summary.byMethod.some((m) => m.method === "M-Pesa"));
  });

  it("re-checks a payment with the provider and lists subscriptions", async () => {
    const t = await tenant();
    const { intent } = await startPayment({
      organizationId: t.orgId,
      purpose: "CREDITS",
      credits: 5,
      phone: "254712345678",
      amountCents: 55_000,
      reference: "TARI",
      description: "credits",
    });
    assert.equal(intent.status, "PROCESSING");
    const r = await recheckPayment(admin, intent.id);
    assert.equal(r.status, "SUCCEEDED");
    assert.equal(r.changed, true);
    assert.equal(await db.auditLog.count({ where: { action: "PAYMENT_RECHECK", entityId: intent.id } }), 1);

    await adminManageSubscription(admin, t.orgId, { action: "grant", plan: "MAX", cycle: "ANNUAL", reason: "enterprise trial" });
    const subs = await listSubscriptions({ plan: "MAX", status: "ACTIVE" });
    const mine = subs.find((s) => s.organizationId === t.orgId);
    assert.ok(mine);
    assert.equal(mine!.source, "Complimentary");
    assert.equal(mine!.cycle, "Yearly");
  });
});
