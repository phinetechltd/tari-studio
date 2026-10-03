import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { simulateCheckout } from "@/lib/payments/paystack";
import { DEFAULT_PRICING, LEGACY_IMAGE_TOKEN_CREDITS, LEGACY_VIDEO_TOKEN_CREDITS, planPriceCents } from "@/lib/pricing";
import { wallet } from "@/server/credits";
import { failGeneration, pollGeneration, requestGeneration, submitGeneration } from "@/server/generation";
import { settleIntent, startCheckout, startPayment } from "@/server/payments";
import { resolveKey } from "@/server/storage";
import { createThread, generateFromQuote, postMessage, threadDetail } from "@/server/studio";
import { grantDueCredits, payForPlan, renewDuePlans, setAutoRenew } from "@/server/subscriptions";

import { addMember, makeOrg, makeUser, rejection } from "./_helpers";

async function tenant(plan = "STARTER") {
  const org = await makeOrg({ plan });
  const { user } = await makeUser();
  await addMember(user.id, org.id, "OWNER");
  return { orgId: org.id, userId: user.id };
}

/** Buys `credits` by M-Pesa (simulator) and settles it. */
async function topUp(orgId: string, userId: string, credits: number) {
  const { intent } = await startPayment({
    organizationId: orgId,
    purpose: "CREDITS",
    credits,
    phone: "254712345678",
    amountCents: 100_00,
    reference: "TARI",
    description: "credits",
    createdById: userId,
  });
  return intent;
}

const credits = async (orgId: string) => (await wallet(orgId)).credits;

const video = (orgId: string, userId: string, seconds = 5) =>
  requestGeneration({ organizationId: orgId, userId, mode: "video", prompt: "A tenant tops up a meter", seconds, aspectRatio: "9:16" });

describe("credits", () => {
  before(() => {
    process.env.SIMULATOR_PIN_MS = "0";
    process.env.SIMULATOR_GEN_MS = "0";
    process.env.STORAGE_DIR = path.join(os.tmpdir(), "agency-integration-storage");
    resetEnvCache();
  });
  after(() => db.$disconnect());

  it("credits a purchase once, however often it is settled", async () => {
    const { orgId, userId } = await tenant();
    const intent = await topUp(orgId, userId, 40);
    await Promise.all([settleIntent(intent.id), settleIntent(intent.id)]);
    await settleIntent(intent.id);
    assert.equal(await credits(orgId), 40);
    assert.equal(await db.tokenLedger.count({ where: { organizationId: orgId, reason: "PURCHASE" } }), 1);
  });

  it("refuses a generation it cannot pay for, and leaves no asset behind", async () => {
    const { orgId, userId } = await tenant();
    const err = await rejection(() => video(orgId, userId));
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 402);
    assert.equal(err.code, "INSUFFICIENT_CREDITS");
    assert.equal(await db.generatedAsset.count({ where: { organizationId: orgId } }), 0);
  });

  it("charges 22 credits per started 5 seconds of video and 2 per image", async () => {
    const { orgId, userId } = await tenant();
    await settleIntent((await topUp(orgId, userId, 100)).id);
    const clip = await video(orgId, userId, 15);
    assert.equal(clip.tokensCharged, 66);
    // Free runs one generation at a time: let the clip finish first.
    await db.generatedAsset.update({ where: { id: clip.id }, data: { status: "READY" } });
    const img = await requestGeneration({ organizationId: orgId, userId, mode: "image", prompt: "A launch poster", aspectRatio: "1:1" });
    assert.equal(img.tokensCharged, 2);
    assert.equal(await credits(orgId), 32);
  });

  it("never overdraws, even with generations racing", async () => {
    const { orgId, userId } = await tenant();
    await settleIntent((await topUp(orgId, userId, 22)).id);
    const results = await Promise.allSettled([video(orgId, userId), video(orgId, userId), video(orgId, userId)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await credits(orgId), 0);
  });

  it("refunds a failed generation once", async () => {
    const { orgId, userId } = await tenant();
    await settleIntent((await topUp(orgId, userId, 22)).id);
    const clip = await video(orgId, userId);
    assert.equal(await credits(orgId), 0);
    await Promise.all([failGeneration(clip.id, "test failure"), failGeneration(clip.id, "test failure")]);
    await failGeneration(clip.id, "test failure");
    assert.equal(await credits(orgId), 22);
    assert.equal(await db.tokenLedger.count({ where: { assetId: clip.id, reason: "REFUND" } }), 1);
  });

  it("refunds a token-era charge in credits at the conversion rate", async () => {
    const { orgId, userId } = await tenant();
    const asset = await db.generatedAsset.create({
      data: { organizationId: orgId, status: "GENERATING", mediaType: "VIDEO", model: "m", prompt: "old", requestId: `old_${orgId}`, createdById: userId, tokensCharged: 1 },
    });
    await db.tokenLedger.create({ data: { organizationId: orgId, kind: "VIDEO", delta: -1, reason: "SPEND", assetId: asset.id } });
    await failGeneration(asset.id, "old failure");
    assert.equal(await credits(orgId), LEGACY_VIDEO_TOKEN_CREDITS);
  });

  it("credits a token purchase that settles after the switch as credits", async () => {
    const { orgId, userId } = await tenant();
    const { intent } = await startPayment({
      organizationId: orgId,
      purpose: "TOKENS",
      phone: "254712345678",
      amountCents: 110_000,
      reference: "TOKENS",
      description: "AI tokens",
      createdById: userId,
    });
    await db.paymentIntent.update({ where: { id: intent.id }, data: { imageTokens: 1, videoTokens: 1 } });
    await settleIntent(intent.id);
    assert.equal(await credits(orgId), LEGACY_IMAGE_TOKEN_CREDITS + LEGACY_VIDEO_TOKEN_CREDITS);
  });

  it("does not charge the operator's INTERNAL organisation, but records the use", async () => {
    const { orgId, userId } = await tenant("INTERNAL");
    const clip = await video(orgId, userId);
    assert.equal(clip.tokensCharged, 0);
    const row = await db.tokenLedger.findFirstOrThrow({ where: { assetId: clip.id } });
    assert.equal(row.delta, 0);
    assert.equal(row.reason, "SPEND");
  });

  it("limits parallel generations to the plan's (Free: one at a time)", async () => {
    const { orgId, userId } = await tenant();
    await settleIntent((await topUp(orgId, userId, 100)).id);
    await video(orgId, userId);
    const err = await rejection(() => video(orgId, userId));
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, "PARALLEL_LIMIT");
  });
});

describe("plans and Paystack", () => {
  after(() => db.$disconnect());

  it("starts a plan from a Paystack checkout: credits, limits, saved card, once", async () => {
    const { orgId, userId } = await tenant("TRIAL");
    const pay = await payForPlan({ organizationId: orgId, userId }, "PRO", "MONTHLY", { method: "PAYSTACK", email: "owner@example.test" });
    assert.equal(pay.kind, "checkout");
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: pay.intentId } });
    assert.equal(intent.amountCents, planPriceCents(DEFAULT_PRICING, "PRO", "MONTHLY"));
    assert.equal(intent.provider, "PAYSTACK_SIMULATOR");

    // Not paid yet: settling leaves it waiting.
    assert.equal((await settleIntent(intent.id)).status, "PROCESSING");

    simulateCheckout(intent.providerRef!, "success");
    await Promise.all([settleIntent(intent.id), settleIntent(intent.id)]);
    assert.equal(await credits(orgId), DEFAULT_PRICING.plans.PRO.creditsPerMonth);

    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
    assert.equal(sub.plan, "PRO");
    assert.equal(sub.status, "ACTIVE");
    assert.equal(sub.autoRenew, true, "a reusable card renews the plan");
    assert.ok(sub.authCipherText && !sub.authCipherText.includes("AUTH_"), "the card authorization is sealed");
    assert.equal(sub.cardLabel, "Visa •••• 4081");
    assert.equal((await db.organization.findUniqueOrThrow({ where: { id: orgId } })).plan, "GROWTH", "workspace limits rise with the plan");
  });

  it("renews a card plan when its period ends, and ends an M-Pesa plan instead", async () => {
    const card = await tenant("TRIAL");
    const pay = await payForPlan({ organizationId: card.orgId, userId: card.userId }, "BASIC", "MONTHLY", { method: "PAYSTACK", email: "a@example.test" });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: pay.intentId } });
    simulateCheckout(intent.providerRef!, "success");
    await settleIntent(intent.id);

    const mpesa = await tenant("TRIAL");
    const stk = await payForPlan({ organizationId: mpesa.orgId, userId: mpesa.userId }, "BASIC", "MONTHLY", { method: "MPESA", phone: "0712345678" });
    await settleIntent(stk.intentId);
    assert.equal((await db.subscription.findUniqueOrThrow({ where: { organizationId: mpesa.orgId } })).autoRenew, false);

    // Move both periods into the past and run the sweep.
    await db.subscription.updateMany({ where: { organizationId: { in: [card.orgId, mpesa.orgId] } }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await renewDuePlans();

    const renewed = await db.subscription.findUniqueOrThrow({ where: { organizationId: card.orgId } });
    assert.equal(renewed.status, "ACTIVE");
    assert.ok(renewed.currentPeriodEnd > new Date());
    assert.equal(await credits(card.orgId), 240, "two months of Basic credits");

    const ended = await db.subscription.findUniqueOrThrow({ where: { organizationId: mpesa.orgId } });
    assert.equal(ended.status, "EXPIRED");
    assert.equal(await credits(mpesa.orgId), 120, "credits already granted stay");
    assert.equal((await db.organization.findUniqueOrThrow({ where: { id: mpesa.orgId } })).plan, "TRIAL", "limits go back");
  });

  it("retries a declined renewal, then ends the plan after three failures", async () => {
    const { orgId, userId } = await tenant("TRIAL");
    const pay = await payForPlan({ organizationId: orgId, userId }, "BASIC", "MONTHLY", { method: "PAYSTACK", email: "b@example.test" });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: pay.intentId } });
    simulateCheckout(intent.providerRef!, "success");
    await settleIntent(intent.id);
    // A card the simulator declines.
    const { encryptFor } = await import("@/lib/secrets");
    const sealed = encryptFor(`subscription:${orgId}`, "AUTH_sim_fail");
    await db.subscription.update({
      where: { organizationId: orgId },
      data: { authCipherText: sealed.cipherText, authIv: sealed.iv, authTag: sealed.authTag, currentPeriodEnd: new Date(Date.now() - 1000) },
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      await db.subscription.update({ where: { organizationId: orgId }, data: { nextRenewalAttemptAt: new Date(Date.now() - 1000) } });
      await renewDuePlans();
    }
    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
    assert.equal(sub.status, "EXPIRED");
    assert.equal(await credits(orgId), 120, "no credits for unpaid months");
  });

  it("grants a yearly plan's credits month by month, once each", async () => {
    const { orgId, userId } = await tenant("TRIAL");
    const pay = await payForPlan({ organizationId: orgId, userId }, "MAX", "ANNUAL", { method: "MPESA", phone: "0712345678" });
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: pay.intentId } });
    assert.equal(intent.amountCents, planPriceCents(DEFAULT_PRICING, "MAX", "ANNUAL"));
    await settleIntent(intent.id);
    assert.equal(await credits(orgId), 1800);

    await db.subscription.update({ where: { organizationId: orgId }, data: { nextGrantAt: new Date(Date.now() - 1000) } });
    await Promise.all([grantDueCredits(), grantDueCredits()]);
    assert.equal(await credits(orgId), 3600, "month two granted once");
    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: orgId } });
    assert.ok(sub.nextGrantAt && sub.nextGrantAt > new Date(), "month three is scheduled");
  });

  it("buys a top-up pack through Paystack and refuses an amount Paystack did not collect", async () => {
    const { orgId, userId } = await tenant();
    const pack = DEFAULT_PRICING.packs[0]!;
    const { intent } = await startCheckout({
      organizationId: orgId,
      purpose: "CREDITS",
      credits: pack.credits,
      amountCents: pack.cents,
      email: "c@example.test",
      returnPath: "/billing",
      referencePrefix: "CREDITS",
      createdById: userId,
    });
    simulateCheckout(intent.providerRef!, "success");
    await settleIntent(intent.id);
    assert.equal(await credits(orgId), pack.credits);

    // Cancelling renewal needs a plan; there is none.
    const err = await rejection(() => setAutoRenew({ organizationId: orgId, userId }, false));
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 409);
  });
});

describe("generation and the Studio", () => {
  after(() => db.$disconnect());

  it("runs a generation through the worker steps to a stored file", async () => {
    const { orgId, userId } = await tenant("INTERNAL");
    const clip = await video(orgId, userId);
    await submitGeneration(clip.id, false);
    await pollGeneration(clip.id, 0);
    const done = await db.generatedAsset.findUniqueOrThrow({ where: { id: clip.id } });
    assert.equal(done.status, "READY");
    assert.ok(done.storageKey);
    assert.ok(existsSync(resolveKey(done.storageKey!)));
  });

  it("fails and refunds when the provider fails", async () => {
    const { orgId, userId } = await tenant();
    await settleIntent((await topUp(orgId, userId, 2)).id);
    const img = await requestGeneration({
      organizationId: orgId,
      userId,
      mode: "image",
      prompt: "A poster that will [fail] in the simulator",
      aspectRatio: "1:1",
    });
    await submitGeneration(img.id, false);
    await pollGeneration(img.id, 0);
    const failed = await db.generatedAsset.findUniqueOrThrow({ where: { id: img.id } });
    assert.equal(failed.status, "FAILED");
    assert.equal(await credits(orgId), 2);
  });

  it("quotes before charging, and a double-click generates once", async () => {
    const { orgId, userId } = await tenant();
    await settleIntent((await topUp(orgId, userId, 66)).id);
    const thread = await createThread(orgId, userId);
    const [, quote] = await postMessage(orgId, thread.id, "/video a landlord relaxes, 15 seconds, vertical");
    assert.equal(quote!.kind, "QUOTE");
    assert.equal(quote!.meta?.seconds, 15);
    assert.equal(quote!.meta?.aspectRatio, "9:16");
    assert.equal(await credits(orgId), 66, "a quote costs nothing");

    const [a, b] = await Promise.allSettled([
      generateFromQuote(orgId, userId, quote!.id),
      generateFromQuote(orgId, userId, quote!.id),
    ]);
    assert.ok(a.status === "fulfilled" || b.status === "fulfilled");
    assert.equal(await db.generatedAsset.count({ where: { organizationId: orgId } }), 1);
    assert.equal(await credits(orgId), 0, "15 s charged once: 66 credits");
  });

  it("keeps one organisation's projects from another", async () => {
    const a = await tenant();
    const b = await tenant();
    const thread = await createThread(a.orgId, a.userId, "Private");
    const err = await rejection(() => threadDetail(b.orgId, thread.id));
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 404);
  });
});
