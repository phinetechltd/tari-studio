import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import type { Principal } from "@/lib/rbac";
import {
  adjustProviderCredits,
  alertProviderOutOfCredits,
  checkAiBudgets,
  expireTopUps,
  monthKeyEAT,
  providerBalance,
  recordTopUp,
  recordUsage,
  saveBudget,
} from "@/server/ai-credits";
import { forgetModelCache, resolveModel, saveModel } from "@/server/ai-models";
import { assertAiAllowance } from "@/server/ai";
import { adjustCredits } from "@/server/credits";
import { outbox } from "@/server/email";
import { pollGeneration, requestGeneration, submitGeneration } from "@/server/generation";
import { parseEstimate } from "@/server/higgsfield";
import { deliverNotification, forgetNotificationPolicy, notify, retryDelivery, saveNotificationPolicy, savePreferences, sendTest } from "@/server/notify";
import { updateHints, updateProfile } from "@/server/profile";
import { markWizardSeen, setupProgress, shouldOpenWizard, updateSetup } from "@/server/setup";
import { sendSms, smsOutbox } from "@/server/sms";
import { createThread, postMessage, updateQuote } from "@/server/studio";

import { addMember, makeOrg, makeUser, rejection } from "./_helpers";

async function tenant(plan = "TRIAL") {
  const org = await makeOrg({ plan });
  const { user } = await makeUser();
  await addMember(user.id, org.id, "OWNER");
  const owner: Principal & { organizationId: string } = { userId: user.id, organizationId: org.id, role: "OWNER", extraPermissions: [], enabledModules: new Set(["AI_CONTENT", "SOCIAL_PUBLISHING"]), mfa: true };
  return { orgId: org.id, userId: user.id, owner };
}

const image = (orgId: string, userId: string, modelKey?: string) =>
  requestGeneration({ organizationId: orgId, userId, mode: "image", prompt: "A launch poster for a meter offer", aspectRatio: "1:1", modelKey });

describe("AI models, provider credits and notifications", () => {
  let admin: Principal;
  let adminId: string;

  before(async () => {
    process.env.SIMULATOR_PIN_MS = "0";
    process.env.SIMULATOR_GEN_MS = "0";
    process.env.STORAGE_DIR = path.join(os.tmpdir(), "agency-integration-storage");
    process.env.SMS_PROVIDER = "console";
    resetEnvCache();
    const { user } = await makeUser({ isPlatformAdmin: true });
    adminId = user.id;
    admin = { userId: user.id, organizationId: null, role: "SUPER_ADMIN", extraPermissions: [], enabledModules: new Set(), mfa: true };
    // This suite owns these platform-wide rows while it runs; earlier runs may have left them.
    await db.platformSetting.deleteMany({ where: { key: { in: ["aiBudget", "notificationPolicy"] } } });
    await db.alertMark.deleteMany({ where: { OR: [{ key: { startsWith: "ai-low:" } }, { key: { startsWith: "ai-budget:" } }, { key: { startsWith: "ai-out:" } }] } });
    forgetNotificationPolicy();
  });

  after(async () => {
    // Put the catalogue and settings back the way the migration left them, for the other suites.
    await db.aiModel.update({ where: { key: "kling-3.0" }, data: { enabled: false, defaultFor: [], creditsPerStep: null } });
    await db.aiModel.update({ where: { key: "seedance-2.5" }, data: { enabled: true, defaultFor: ["video", "animate", "extend"], creditsPerStep: null } });
    await db.aiModel.update({ where: { key: "soul-2" }, data: { enabled: true, defaultFor: ["image"], creditsPerImage: null } });
    await db.platformSetting.deleteMany({ where: { key: { in: ["aiBudget", "notificationPolicy"] } } });
    forgetModelCache();
    forgetNotificationPolicy();
    delete process.env.SMS_DAILY_CAP;
    resetEnvCache();
    await db.$disconnect();
  });

  it("reads Higgsfield's estimate as integers", () => {
    assert.deepEqual(parseEstimate({ credits: "1.500", usd: "0.094" }), { milliCredits: 1500, usdMicros: 94_000 });
    assert.deepEqual(parseEstimate({ credits: 2 }), { milliCredits: 2000, usdMicros: null });
    assert.equal(parseEstimate({ error: "nope" }), null);
  });

  it("offers enabled models only, the mode's default first, and refuses a disabled one", async () => {
    forgetModelCache();
    assert.equal((await resolveModel("image")).key, "soul-2");
    assert.equal((await resolveModel("video")).key, "seedance-2.5");
    const err = await rejection(() => resolveModel("video", "kling-3.0"));
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, "MODEL_UNAVAILABLE");
  });

  it("lets a platform admin price, enable and default a model, and charges customers by it", async () => {
    const owner = { ...admin, role: "OWNER" as const, organizationId: "x" };
    assert.equal(((await rejection(() => saveModel(owner, "kling-3.0", { enabled: true }))) as ApiError).status, 403);

    await saveModel(admin, "kling-3.0", { enabled: true, creditsPerStep: 30 });
    const { orgId, userId } = await tenant();
    await adjustCredits({ organizationId: orgId, delta: 200, note: "test", createdById: userId });
    const clip = await requestGeneration({ organizationId: orgId, userId, mode: "video", prompt: "A slow shot along a road", seconds: 10, aspectRatio: "9:16", modelKey: "kling-3.0" });
    assert.equal(clip.tokensCharged, 60, "two started 5 s steps at Kling's 30");
    assert.equal(clip.modelKey, "kling-3.0");
    assert.equal(clip.model, "kling-video/v3.0/std/text-to-video");
    const tooLong = await rejection(() => requestGeneration({ organizationId: orgId, userId, mode: "video", prompt: "Too long for Kling", seconds: 20, aspectRatio: "9:16", modelKey: "kling-3.0" }));
    assert.equal((tooLong as ApiError).status, 422);

    // A Studio quote moved onto Kling keeps roughly its length and names the model.
    const thread = await createThread(orgId, userId);
    const [, quote] = await postMessage(orgId, thread.id, "/video a tenant tops up a meter, 30 seconds, vertical");
    assert.equal(quote!.meta!.modelKey, "seedance-2.5");
    const moved = await updateQuote(orgId, quote!.id, { modelKey: "kling-3.0" });
    assert.equal(moved.meta!.seconds, 15);
    assert.match(moved.body, /Kling 3\.0/);
    assert.match(moved.body, /90 credits/);

    // One default per mode: Kling takes video from Seedance.
    await saveModel(admin, "kling-3.0", { defaultFor: ["video"] });
    assert.equal((await resolveModel("video")).key, "kling-3.0");
    const seedance = await db.aiModel.findUniqueOrThrow({ where: { key: "seedance-2.5" } });
    assert.deepEqual(seedance.defaultFor.sort(), ["animate", "extend"]);

    // Seedance is the only model that extends clips, so it cannot be switched off.
    const last = await rejection(() => saveModel(admin, "seedance-2.5", { enabled: false }));
    assert.equal((last as ApiError).code, "LAST_MODEL");

    // Switching Kling off hands video back to the next enabled model.
    await saveModel(admin, "kling-3.0", { enabled: false });
    assert.equal((await resolveModel("video")).key, "seedance-2.5");
    assert.ok(await db.auditLog.count({ where: { action: "AI_MODEL_UPDATE", entityId: "kling-3.0" } }) >= 3);
  });

  it("records what each finished render cost the platform, once", async () => {
    const { orgId, userId } = await tenant("INTERNAL");
    const before = await providerBalance();
    const img = await image(orgId, userId);
    await submitGeneration(img.id, false);
    const submitted = await db.generatedAsset.findUniqueOrThrow({ where: { id: img.id } });
    assert.equal(submitted.providerMilliCredits, 1500, "the simulator's estimate, taken before submitting");
    assert.equal(await db.providerCreditLedger.count({ where: { assetId: img.id } }), 0, "nothing is recorded until it finishes");
    await pollGeneration(img.id, 0);
    const row = await db.providerCreditLedger.findUniqueOrThrow({ where: { assetId: img.id } });
    assert.equal(row.kind, "USAGE");
    assert.equal(row.milliCredits, -1500);
    assert.equal(row.modelKey, "soul-2");
    assert.equal(await recordUsage({ assetId: img.id, organizationId: orgId, modelKey: "soul-2", milliCredits: 1500, usdMicros: null }), false, "a redelivered job records nothing");
    const afterwards = await providerBalance();
    assert.ok(Math.abs(before.milliCredits - afterwards.milliCredits - 1500) < 1, "the balance fell by exactly the render's cost");

    // A failed render costs the platform nothing.
    const bad = await requestGeneration({ organizationId: orgId, userId, mode: "image", prompt: "This will [fail] in the simulator", aspectRatio: "1:1" });
    await submitGeneration(bad.id, false);
    await pollGeneration(bad.id, 0);
    assert.equal(await db.providerCreditLedger.count({ where: { assetId: bad.id } }), 0);
  });

  it("records top-ups and adjustments, and writes off only what was unused when a top-up expires", async () => {
    const start = await providerBalance();
    await recordTopUp(admin, { credits: 1000, usd: 75, note: "test top-up" });
    assert.ok(Math.abs((await providerBalance()).milliCredits - start.milliCredits - 1_000_000) < 1);
    await adjustProviderCredits(admin, { credits: -2.5, note: "matched the console" });
    const noReason = await rejection(() => adjustProviderCredits(admin, { credits: 5, note: "" }));
    assert.ok(noReason);

    // A top-up bought 400 days ago has already lapsed; 0.4 of its 3 credits had been used.
    const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
    await recordTopUp(admin, { credits: 3, purchasedAt: old, note: "old" });
    const lapsed = await db.providerCreditLedger.findFirstOrThrow({ where: { kind: "TOPUP", note: "old" }, orderBy: { createdAt: "desc" } });
    await db.providerCreditLedger.update({ where: { id: lapsed.id }, data: { consumedMilli: 400 } });
    await expireTopUps();
    await expireTopUps(); // idempotent
    const written = await db.providerCreditLedger.findMany({ where: { kind: "EXPIRE", createdAt: { gte: new Date(Date.now() - 60_000) }, milliCredits: -2600 } });
    assert.equal(written.length, 1);
    assert.ok((await db.providerCreditLedger.findUniqueOrThrow({ where: { id: lapsed.id } })).expiredAt);
    assert.equal(await db.auditLog.count({ where: { action: "AI_CREDITS_TOPUP", userId: adminId } }), 2);
  });

  it("alerts once per condition, and never stops anyone generating", async () => {
    const balance = await providerBalance();
    await saveBudget(admin, { lowBalanceCredits: Math.ceil(balance.credits) + 1000, monthlyCredits: 1, textMonthlyUsd: null });
    const fired = await checkAiBudgets();
    assert.ok(fired.includes("low"), `fired ${fired.join(",")}`);
    assert.ok(fired.includes("higgsfield-80") && fired.includes("higgsfield-100"));
    assert.deepEqual(await checkAiBudgets(), [], "the second check is quiet");
    assert.equal(await db.notification.count({ where: { userId: adminId, kind: "ai.credits_low" } }), 1);
    assert.equal(await db.notification.count({ where: { userId: adminId, kind: "ai.budget_threshold" } }), 2);
    assert.ok(await db.alertMark.findUnique({ where: { key: `ai-budget:HIGGSFIELD:${monthKeyEAT()}:100` } }));

    // Over budget and low on credits, generation still goes ahead.
    const { orgId, userId } = await tenant("INTERNAL");
    const img = await image(orgId, userId);
    assert.equal(img.status, "GENERATING");

    // A top-up that lifts the balance above the level re-arms the low alert.
    await recordTopUp(admin, { credits: 5000, note: "refill" });
    assert.equal(await db.alertMark.findUnique({ where: { key: "ai-low:HIGGSFIELD" } }), null);

    assert.equal(await alertProviderOutOfCredits("Higgsfield returned 403."), true);
    assert.equal(await alertProviderOutOfCredits("Higgsfield returned 403."), false, "once a day");
  });

  it("enforces each organisation's monthly AI writing allowance and tells the owners once", async () => {
    const { orgId, userId } = await tenant("TRIAL"); // US$2 a month
    await assertAiAllowance(orgId);
    await db.aiUsage.create({ data: { organizationId: orgId, feature: "test", model: "claude-test", inputTokens: 1, outputTokens: 1, costMicros: 2_000_000 } });
    const err = await rejection(() => assertAiAllowance(orgId));
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 402);
    assert.equal(err.code, "AI_LIMIT");
    await rejection(() => assertAiAllowance(orgId));
    assert.equal(await db.notification.count({ where: { organizationId: orgId, userId, kind: "ai.limit_reached" } }), 1);

    const internal = await tenant("INTERNAL");
    await db.aiUsage.create({ data: { organizationId: internal.orgId, feature: "test", model: "claude-test", inputTokens: 1, outputTokens: 1, costMicros: 900_000_000 } });
    await assertAiAllowance(internal.orgId); // no limit
  });

  it("notifies by app, email and SMS by the policy and each person's choices", async () => {
    const { orgId, userId } = await tenant();
    const { user: second } = await makeUser();
    await addMember(second.id, orgId, "OWNER");
    await updateProfile(userId, orgId, { phone: "0712 345 678" });
    const { user: marketer } = await makeUser();
    await addMember(marketer.id, orgId, "MARKETER");

    // Essential: the opt-out is ignored; the owner without a phone is logged, not skipped silently.
    await savePreferences(userId, [{ event: "billing.renewal_failed", channel: "SMS", enabled: false }]);
    const r = await notify({ event: "billing.renewal_failed", organizationId: orgId, title: "We could not renew your Pro plan", body: "Your card was declined.", href: "/billing" });
    assert.deepEqual({ recipients: r.recipients, inApp: r.inApp, queued: r.queued, suppressed: r.suppressed }, { recipients: 2, inApp: 2, queued: 3, suppressed: 1 });
    const sms = await db.notificationDelivery.findMany({ where: { organizationId: orgId, channel: "SMS" } });
    assert.equal(sms.find((d) => d.userId === userId)!.status, "QUEUED");
    assert.equal(sms.find((d) => d.userId === userId)!.recipient, "254712345678");
    assert.match(sms.find((d) => d.userId === second.id)!.error!, /No mobile number/);
    assert.equal(await db.notification.count({ where: { organizationId: orgId, userId: marketer.id } }), 0, "billing goes to owners only");

    // Delivery: once, through the stand-in, never twice.
    const email = (await db.notificationDelivery.findFirstOrThrow({ where: { organizationId: orgId, channel: "EMAIL", userId } }));
    const sent = outbox.length;
    const done = await deliverNotification(email.id);
    assert.equal(done!.status, "SENT");
    assert.equal(done!.mock, true);
    await deliverNotification(email.id);
    assert.equal(outbox.length, sent + 1, "a redelivered job sends nothing");
    assert.match(outbox[outbox.length - 1]!.html!, /We could not renew your Pro plan/);
    const text = await deliverNotification(sms.find((d) => d.userId === userId)!.id);
    assert.equal(text!.status, "SENT");
    assert.match(smsOutbox[smsOutbox.length - 1]!.text, /could not renew/);

    // Ordinary events honour the person's opt-out.
    await savePreferences(userId, [{ event: "order.paid", channel: "EMAIL", enabled: false }]);
    await notify({ event: "order.paid", organizationId: orgId, title: "ORD-1 paid", href: "/app/orders" });
    const orderMail = await db.notificationDelivery.findMany({ where: { organizationId: orgId, event: "order.paid", channel: "EMAIL" } });
    assert.equal(orderMail.find((d) => d.userId === userId)!.status, "SUPPRESSED");
    assert.equal(orderMail.find((d) => d.userId === second.id)!.status, "QUEUED");
    assert.equal(await db.notificationDelivery.count({ where: { organizationId: orgId, event: "order.paid", channel: "SMS" } }), 0, "SMS is off for orders by default");

    // The platform policy switches a channel off for everyone.
    await saveNotificationPolicy(admin, { "order.paid": { EMAIL: false } });
    await notify({ event: "order.paid", organizationId: orgId, title: "ORD-2 paid" });
    assert.equal(await db.notificationDelivery.count({ where: { organizationId: orgId, event: "order.paid", channel: "EMAIL" } }), 2, "no new email rows");
    assert.equal(await db.notification.count({ where: { organizationId: orgId, kind: "order.paid" } }), 4, "still in the app");
  });

  it("holds SMS back past the daily limit, and lets an admin retry", async () => {
    const { orgId, userId } = await tenant();
    await updateProfile(userId, orgId, { phone: "0722000111" });
    await notify({ event: "plan.ending", organizationId: orgId, title: "Your plan ends on Friday" });
    const d = await db.notificationDelivery.findFirstOrThrow({ where: { organizationId: orgId, channel: "SMS" } });
    process.env.SMS_DAILY_CAP = "0";
    resetEnvCache();
    const held = await deliverNotification(d.id);
    assert.equal(held!.status, "SUPPRESSED");
    assert.match(held!.error!, /SMS limit/);
    delete process.env.SMS_DAILY_CAP;
    resetEnvCache();
    await retryDelivery(admin, d.id);
    assert.equal((await db.notificationDelivery.findUniqueOrThrow({ where: { id: d.id } })).status, "QUEUED");
    assert.ok(await db.job.findFirst({ where: { type: "notify.deliver", dedupeKey: { startsWith: `notify.deliver:${d.id}:` } } }));
    assert.equal((await deliverNotification(d.id))!.status, "SENT");
    const again = await rejection(() => retryDelivery(admin, d.id));
    assert.equal((again as ApiError).status, 409);
  });

  it("sends a test message and logs it", async () => {
    const r = await sendTest(admin, "EMAIL", "ops@example.test");
    assert.equal(r.status, "SENT");
    assert.equal(r.mock, true);
    const bad = await rejection(() => sendTest(admin, "SMS", "12345"));
    assert.equal((bad as ApiError).status, 422);
    assert.equal(await db.notificationDelivery.count({ where: { event: "test", userId: adminId } }), 1);
  });

  it("talks to Bonga as IntelliCash does, and only status 222 counts as sent", async () => {
    const replies = [
      { status: 222, status_message: "Message queued", unique_id: "bonga-1" },
      { status: 666, status_message: "Insufficient credit" },
    ];
    const seen: string[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.push(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(replies.shift()));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    Object.assign(process.env, {
      SMS_PROVIDER: "bonga",
      BONGA_SMS_ENDPOINT: `http://127.0.0.1:${port}/v1/send-sms`,
      BONGA_SMS_CLIENT_ID: "client-1",
      BONGA_SMS_API_KEY: "key-1",
      BONGA_SMS_API_SECRET: "secret-1",
      BONGA_SMS_SERVICE_ID: "svc-1",
    });
    resetEnvCache();
    try {
      const ok = await sendSms({ to: "0712345678", text: "Hello from the test" });
      assert.deepEqual(ok, { ok: true, provider: "bonga", reference: "bonga-1" });
      for (const field of ["apiClientID", "key", "secret", "txtMessage", "MSISDN", "serviceID"]) assert.ok(seen[0]!.includes(`name="${field}"`), field);
      assert.ok(seen[0]!.includes("254712345678"));
      const refused = await sendSms({ to: "0712345678", text: "Again" });
      assert.equal(refused.ok, false);
      assert.equal(refused.error, "Insufficient credit");
    } finally {
      server.close();
      for (const k of ["BONGA_SMS_ENDPOINT", "BONGA_SMS_CLIENT_ID", "BONGA_SMS_API_KEY", "BONGA_SMS_API_SECRET", "BONGA_SMS_SERVICE_ID"]) delete process.env[k];
      process.env.SMS_PROVIDER = "console";
      resetEnvCache();
    }
  });

  it("works out setup progress from what exists, and opens the wizard once", async () => {
    const { orgId, userId, owner } = await tenant();
    let p = await setupProgress(owner);
    assert.equal(p.done, 0);
    assert.ok(p.steps.some((s) => s.key === "brand"));
    assert.equal(await shouldOpenWizard(owner), true);

    await db.brand.create({ data: { organizationId: orgId, name: "Tari", slug: "tari", brandNumber: "B-1", createdById: userId } });
    await updateProfile(userId, orgId, { phone: "0712 000 222" });
    p = await updateSetup(owner, { skip: "catalogue" });
    assert.equal(p.steps.find((s) => s.key === "brand")!.done, true);
    assert.equal(p.steps.find((s) => s.key === "profile")!.done, true);
    assert.equal(p.steps.find((s) => s.key === "catalogue")!.skipped, true);
    assert.equal(await shouldOpenWizard(owner), false, "touching the checklist counts as seeing it");

    const fresh = await tenant();
    await markWizardSeen(fresh.orgId);
    assert.equal(await shouldOpenWizard(fresh.owner), false);
    const marketer = { ...owner, role: "MARKETER" as const };
    assert.equal(await shouldOpenWizard(marketer), false, "only owners are sent to the wizard");
    assert.equal(((await rejection(() => updateSetup(marketer, { dismissed: true }))) as ApiError).status, 403);
  });

  it("remembers dismissed tips, switches them off and back on", async () => {
    const { user } = await makeUser();
    await updateHints(user.id, { dismiss: "home.welcome" });
    const twice = await updateHints(user.id, { dismiss: "home.welcome" });
    assert.deepEqual(twice.dismissedHints, ["home.welcome"]);
    assert.equal((await updateHints(user.id, { enabled: false })).hintsEnabled, false);
    const reset = await updateHints(user.id, { reset: true });
    assert.deepEqual(reset, { hintsEnabled: true, dismissedHints: [] });
    assert.ok(await rejection(() => updateHints(user.id, { dismiss: "<script>" })));
    assert.ok(await rejection(() => updateProfile(user.id, null, { phone: "12345" })));
  });
});
