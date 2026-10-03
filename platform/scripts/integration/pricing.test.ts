import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { DEFAULT_PRICING, defaultPricingInput, planPriceCents, type PricingInput } from "@/lib/pricing";
import type { Principal } from "@/lib/rbac";
import { wallet } from "@/server/credits";
import { settleIntent } from "@/server/payments";
import { forgetPricingCache, getPricing, pricingStatus, resetPricing, savePricing } from "@/server/pricing-store";
import { payForCredits, payForPlan, renewDuePlans } from "@/server/subscriptions";
import { simulateCheckout } from "@/lib/payments/paystack";

import { addMember, makeOrg, makeUser, rejection } from "./_helpers";

const KES = (n: number) => n * 100;

function custom(): PricingInput {
  const input = defaultPricingInput();
  input.plans.PRO = { ...input.plans.PRO, monthlyCents: KES(6000), annualPerMonthCents: KES(5000), creditsPerMonth: 800 };
  input.imageCredits = 3;
  input.packs = [{ credits: 50, cents: KES(800) }, { credits: 300, cents: KES(4000) }];
  return input;
}

async function tenant() {
  const org = await makeOrg({ plan: "TRIAL" });
  const { user } = await makeUser();
  await addMember(user.id, org.id, "OWNER");
  return { organizationId: org.id, userId: user.id };
}

describe("admin pricing", () => {
  let admin: Principal;

  before(async () => {
    process.env.SIMULATOR_PIN_MS = "0";
    resetEnvCache();
    await db.platformSetting.deleteMany({ where: { key: "pricing" } });
    forgetPricingCache();
    const { user } = await makeUser({ isPlatformAdmin: true });
    admin = { userId: user.id, organizationId: null, role: "SUPER_ADMIN", extraPermissions: [], enabledModules: new Set(), mfa: true };
  });
  after(async () => {
    await db.platformSetting.deleteMany({ where: { key: "pricing" } });
    forgetPricingCache();
    await db.$disconnect();
  });

  it("serves the defaults until an admin saves a price list", async () => {
    const status = await pricingStatus();
    assert.equal(status.custom, false);
    assert.deepEqual(await getPricing(), DEFAULT_PRICING);
  });

  it("refuses prices that make no sense, and anyone but a platform admin", async () => {
    const yearlyAboveMonthly = custom();
    yearlyAboveMonthly.plans.BASIC.annualPerMonthCents = yearlyAboveMonthly.plans.BASIC.monthlyCents + KES(100);
    const e1 = await rejection(() => savePricing(admin, yearlyAboveMonthly));
    assert.ok(e1 instanceof ApiError);
    assert.match(e1.message, /yearly price per month cannot be higher/);

    const halfShilling = custom();
    halfShilling.packs[0]!.cents = 80_050;
    assert.match(String(((await rejection(() => savePricing(admin, halfShilling))) as Error).message), /whole shillings/);

    const samePacks = custom();
    samePacks.packs = [{ credits: 50, cents: KES(800) }, { credits: 50, cents: KES(900) }];
    assert.match(String(((await rejection(() => savePricing(admin, samePacks))) as Error).message), /same number of credits/);

    const owner = { ...admin, role: "OWNER" as const, organizationId: "org" };
    const denied = await rejection(() => savePricing(owner, custom()));
    assert.ok(denied instanceof ApiError);
    assert.equal(denied.status, 403);
    assert.equal((await pricingStatus()).custom, false, "nothing was saved");
  });

  it("applies a saved price list to new purchases, and audits it", async () => {
    await savePricing(admin, custom());
    const pricing = await getPricing();
    assert.equal(pricing.plans.PRO.monthlyCents, KES(6000));
    assert.equal(pricing.imageCredits, 3);
    assert.equal(pricing.creditValueCents, 1600, "the smallest pack (50 for KES 800) sets KES 16 a credit");

    const t = await tenant();
    const plan = await payForPlan(t, "PRO", "MONTHLY", { method: "MPESA", phone: "0712345678" });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: plan.intentId } });
    assert.equal(intent.amountCents, KES(6000));
    assert.equal(intent.credits, 800);

    const pack = await payForCredits(t, "PACK_300", { method: "MPESA", phone: "0712345678" });
    assert.equal((await db.paymentIntent.findUniqueOrThrow({ where: { id: pack.intentId } })).amountCents, KES(4000));
    const gone = await rejection(() => payForCredits(t, "PACK_40", { method: "MPESA", phone: "0712345678" }));
    assert.ok(gone instanceof ApiError, "a pack that is no longer on the list cannot be bought");

    const log = await db.auditLog.findFirst({ where: { action: "PRICING_UPDATE", userId: admin.userId }, orderBy: { createdAt: "desc" } });
    assert.ok(log, "the change is audited");
    assert.match(JSON.stringify(log!.changes), /PRO\.monthly/);
  });

  it("renews an existing subscription at the price it was bought at, not the new list", async () => {
    await resetPricing(admin);
    const t = await tenant();
    const pay = await payForPlan(t, "PRO", "MONTHLY", { method: "PAYSTACK", email: "keep@example.test" });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: pay.intentId } });
    simulateCheckout(intent.providerRef!, "success");
    await settleIntent(intent.id);
    const bought = await db.subscription.findUniqueOrThrow({ where: { organizationId: t.organizationId } });
    assert.equal(bought.priceCents, planPriceCents(DEFAULT_PRICING, "PRO", "MONTHLY"));
    assert.equal(bought.creditsPerMonth, 600);

    // The admin raises Pro; then the period ends and the card renews.
    await savePricing(admin, custom());
    await db.subscription.update({ where: { organizationId: t.organizationId }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await renewDuePlans();

    const renewal = await db.paymentIntent.findFirstOrThrow({ where: { organizationId: t.organizationId, automatic: true } });
    assert.equal(renewal.amountCents, planPriceCents(DEFAULT_PRICING, "PRO", "MONTHLY"), "charged the old price");
    assert.equal(renewal.status, "SUCCEEDED");
    assert.equal((await wallet(t.organizationId)).credits, 1200, "two months of the 600 credits bought");
  });

  it("goes back to the defaults on reset", async () => {
    await resetPricing(admin);
    assert.equal((await pricingStatus()).custom, false);
    assert.deepEqual(await getPricing(), DEFAULT_PRICING);
  });
});
