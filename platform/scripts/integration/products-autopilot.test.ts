import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import sharp from "sharp";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { MODULE_KEYS } from "@/lib/modules";
import type { Principal } from "@/lib/rbac";
import {
  approveRun,
  autopilotSchema,
  autopilotTick,
  createAutopilot,
  finishAutopilotRun,
  getAutopilot,
  rejectRun,
  runAutopilot,
  updateAutopilot,
} from "@/server/autopilot";
import { addAttachments, listAttachments, profileState, setBrandImage, brandImageKey } from "@/server/brand-profile";
import { grantCredits, wallet } from "@/server/credits";
import { pollGeneration, submitGeneration } from "@/server/generation";
import { addProductImages, adjustStock, createProduct, listMovements, listProducts, productImageFile, productSchema, updateProduct } from "@/server/products";
import { assertReady, AUTOPILOT_NEEDS, requirements } from "@/server/readiness";
import { composePrompt, createThread, generateFromQuote, postMessage, reviseQuote, type QuoteMeta } from "@/server/studio";

import { addMember, makeOrg, makeUser, rejection } from "./_helpers";

const png = (w = 400, h = 400) => sharp({ create: { width: w, height: h, channels: 3, background: "#1f8a4c" } }).png().toBuffer();
const file = (bytes: Uint8Array, name = "x.png", type = "image/png") => new File([bytes as BlobPart], name, { type });

async function tenant() {
  const org = await makeOrg({ plan: "STARTER" });
  const { user } = await makeUser();
  await addMember(user.id, org.id, "OWNER");
  const p: Principal = {
    userId: user.id,
    organizationId: org.id,
    role: "OWNER",
    extraPermissions: [],
    enabledModules: new Set<string>(MODULE_KEYS),
    mfa: true,
  };
  for (const moduleKey of MODULE_KEYS) {
    await db.organizationModule.upsert({ where: { organizationId_moduleKey: { organizationId: org.id, moduleKey } }, create: { organizationId: org.id, moduleKey, enabled: true }, update: {} });
  }
  return { org, user, p };
}

async function addCredits(orgId: string, credits: number) {
  await db.$transaction((tx) => grantCredits(tx, { organizationId: orgId, credits, grantKey: `test:${orgId}:${Math.random()}`, note: "test" }));
}

async function brandWithProfile(t: Awaited<ReturnType<typeof tenant>>, name = "Mama Nyama") {
  const brand = await db.brand.create({
    data: { organizationId: t.org.id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), brandNumber: `BRD-${Math.random().toString(36).slice(2, 7)}`, slogan: "Fresh from the grill", guidelines: { voice: "Warm and neighbourly", colors: "green and gold" } },
  });
  await setBrandImage(t.p, brand.id, "cover", file(await png(800, 450)));
  return brand;
}

async function channel(orgId: string, brandId: string, platform = "FACEBOOK") {
  return db.socialChannel.create({ data: { organizationId: orgId, brandId, platform, name: `${platform} page`, externalId: "1", status: "ACTIVE" } });
}

const everyDay = { days: [1, 2, 3, 4, 5, 6, 7], times: ["09:00"] };

describe("products, brand profile, Studio context and Autopilot", () => {
  let dir: string;
  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tari-pa-"));
    process.env.STORAGE_DIR = path.relative(process.cwd(), dir);
    process.env.SIMULATOR_GEN_MS = "0";
    resetEnvCache();
  });
  after(async () => {
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  describe("products and stock", () => {
    it("keeps a count with a history, never below zero, even when sales race", async () => {
      const t = await tenant();
      const brand = await db.brand.create({ data: { organizationId: t.org.id, name: "Shop", slug: "shop", brandNumber: "BRD-1" } });
      const prod = await createProduct(t.p, productSchema.parse({ brandId: brand.id, name: "Sausage", trackStock: true, stockQty: 5, lowStockAt: 2 }));
      assert.equal(prod.stockQty, 5);
      assert.equal((await listMovements(t.p, prod.id))[0]?.reason, "INITIAL");

      const e = await rejection(() => adjustStock(t.p, prod.id, { delta: -6, reason: "SALE" }));
      assert.ok(e instanceof ApiError);
      assert.equal(e.code, "INSUFFICIENT_STOCK");

      const results = await Promise.allSettled(Array.from({ length: 8 }, () => adjustStock(t.p, prod.id, { delta: -1, reason: "SALE" })));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 5, "exactly the five that were in stock");
      const after = (await listProducts(t.org.id)).find((x) => x.id === prod.id)!;
      assert.equal(after.stockQty, 0);
      assert.equal(after.outOfStock, true);
      const log = await listMovements(t.p, prod.id);
      assert.equal(log.reduce((sum, m) => sum + m.delta, 0), 0, "the log adds up to the count");
    });

    it("sets a count, tells the team once when it crosses the warning level, and refuses untracked products", async () => {
      const t = await tenant();
      const brand = await db.brand.create({ data: { organizationId: t.org.id, name: "Shop", slug: "shop", brandNumber: "BRD-1" } });
      const prod = await createProduct(t.p, productSchema.parse({ brandId: brand.id, name: "Mugs", trackStock: true, stockQty: 4, lowStockAt: 2 }));
      await adjustStock(t.p, prod.id, { delta: -1, reason: "SALE" }); // 3: above the level
      await adjustStock(t.p, prod.id, { delta: -1, reason: "SALE" }); // 2: crosses
      await adjustStock(t.p, prod.id, { delta: -1, reason: "SALE" }); // 1: already low
      const notes = await db.notification.count({ where: { organizationId: t.org.id, kind: "product.low_stock" } });
      assert.equal(notes, 1, "one warning for the crossing");
      assert.equal((await adjustStock(t.p, prod.id, { setTo: 20, reason: "ADJUSTMENT" })).stockQty, 20);

      const plain = await createProduct(t.p, productSchema.parse({ brandId: brand.id, name: "Poster" }));
      const err = await rejection(() => adjustStock(t.p, plain.id, { delta: 1, reason: "RESTOCK" }));
      assert.ok(err instanceof ApiError);
      assert.equal(err.code, "STOCK_NOT_TRACKED");
    });

    it("keeps pictures private to the team and within the limits", async () => {
      const a = await tenant();
      const b = await tenant();
      const brand = await db.brand.create({ data: { organizationId: a.org.id, name: "Shop", slug: "shop", brandNumber: "BRD-1" } });
      const prod = await createProduct(a.p, productSchema.parse({ brandId: brand.id, name: "Bag" }));
      const [imageId] = await addProductImages(a.p, prod.id, [file(await png())]);
      assert.ok(await productImageFile(a.p, imageId!));
      assert.equal(await productImageFile(b.p, imageId!), null, "another team cannot fetch it");
      const err = await rejection(async () => addProductImages(b.p, prod.id, [file(await png())]));
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      const small = await rejection(async () => addProductImages(a.p, prod.id, [file(await png(100, 100))]));
      assert.match((small as ApiError).message, /too small/i);
    });

    it("archives out of the pickers and can clear a price", async () => {
      const t = await tenant();
      const brand = await db.brand.create({ data: { organizationId: t.org.id, name: "Shop", slug: "shop", brandNumber: "BRD-1" } });
      const prod = await createProduct(t.p, productSchema.parse({ brandId: brand.id, name: "Cup", priceCents: 50000 }));
      assert.equal((await updateProduct(t.p, prod.id, { priceCents: null })).priceCents, null);
      await updateProduct(t.p, prod.id, { archived: true });
      assert.equal((await listProducts(t.org.id)).length, 0);
      assert.equal((await listProducts(t.org.id, { includeArchived: true })).length, 1);
    });
  });

  describe("brand profile", () => {
    it("holds a cover, a logo and files, privately, and says when the profile is complete", async () => {
      const a = await tenant();
      const b = await tenant();
      const brand = await db.brand.create({ data: { organizationId: a.org.id, name: "Profile", slug: "profile", brandNumber: "BRD-9" } });
      assert.equal((await profileState(a.org.id, brand.id))?.complete, false);
      await db.brand.update({ where: { id: brand.id }, data: { slogan: "Made with care" } });
      await setBrandImage(a.p, brand.id, "cover", file(await png(800, 450)));
      assert.equal((await profileState(a.org.id, brand.id))?.complete, true);
      assert.ok(await brandImageKey(a.p, brand.id, "cover"));
      assert.equal(await brandImageKey(b.p, brand.id, "cover"), null);

      const pdf = new File([Buffer.from("%PDF-1.4\n%fake but correct start\n")], "price list.pdf", { type: "application/pdf" });
      await addAttachments(a.p, brand.id, [pdf]);
      const liar = new File([Buffer.from("not a pdf at all")], "evil.pdf", { type: "application/pdf" });
      const err = await rejection(() => addAttachments(a.p, brand.id, [liar]));
      assert.match((err as ApiError).message, /does not look like/i);
      const exe = new File([Buffer.from("MZ")], "run.exe");
      assert.ok((await rejection(() => addAttachments(a.p, brand.id, [exe]))) instanceof ApiError);
      const list = await listAttachments(a.org.id, brand.id);
      assert.equal(list.length, 1);
      assert.equal(list[0]!.kind, "DOCUMENT");
    });
  });

  describe("Studio: brand, product, character and template reach the model", () => {
    it("puts the words in the prompt (never stock numbers) and starts a video from the product picture", async () => {
      const t = await tenant();
      const brand = await brandWithProfile(t);
      const prod = await createProduct(t.p, productSchema.parse({ brandId: brand.id, name: "Smoked sausage", description: "Beef, smoked over acacia wood.", priceCents: 75000, trackStock: true, stockQty: 37, attributes: { size: "500 g" } }));
      const [imageId] = await addProductImages(t.p, prod.id, [file(await png())]);
      await addCredits(t.org.id, 200);

      const thread = await createThread(t.org.id, t.user.id);
      const [, quote] = await postMessage(t.org.id, thread.id, "/video a family enjoys dinner, 5 seconds, vertical", { context: { brandId: brand.id, productId: prod.id } });
      const meta = quote!.meta as unknown as QuoteMeta;
      assert.equal(meta.brandId, brand.id);
      assert.equal(meta.productId, prod.id);
      assert.deepEqual(meta.startImage, { source: "product", id: imageId });
      assert.ok(meta.using?.labels.includes("Product: Smoked sausage"));
      assert.ok(meta.using?.start?.thumb.includes("/api/products/images/"));

      const prompt = await composePrompt(t.org.id, meta);
      assert.match(prompt, /Fresh from the grill/);
      assert.match(prompt, /Smoked sausage/);
      assert.match(prompt, /size 500 g/);
      assert.doesNotMatch(prompt, /37/, "stock numbers never reach the model");

      const done = await generateFromQuote(t.org.id, t.user.id, quote!.id);
      const asset = await db.generatedAsset.findUniqueOrThrow({ where: { id: done.asset!.id } });
      const md = asset.metadata as { mode?: string; startImage?: { source: string; id: string }; productId?: string };
      assert.equal(md.mode, "animate", "the picture turned text-to-video into image-to-video");
      assert.deepEqual(md.startImage, { source: "product", id: imageId });
      assert.equal(asset.brandId, brand.id);
      await submitGeneration(asset.id, false);
      const sent = await db.providerFile.count({ where: { provider: "SIMULATOR" } });
      assert.ok(sent >= 1, "the picture went through the provider's upload step");
    });

    it("ignores a starting picture that is not the team's, and uses words only for images", async () => {
      const a = await tenant();
      const b = await tenant();
      const brandB = await db.brand.create({ data: { organizationId: b.org.id, name: "Other", slug: "other", brandNumber: "BRD-1" } });
      const prodB = await createProduct(b.p, productSchema.parse({ brandId: brandB.id, name: "Secret" }));
      const [foreign] = await addProductImages(b.p, prodB.id, [file(await png())]);
      const thread = await createThread(a.org.id, a.user.id);
      const [, quote] = await postMessage(a.org.id, thread.id, "/video a quiet street", {
        context: { productId: prodB.id, brandId: brandB.id, startImage: { source: "product", id: foreign! } },
      });
      const meta = quote!.meta as unknown as QuoteMeta;
      assert.equal(meta.productId ?? null, null, "another team's product is dropped");
      assert.equal(meta.brandId ?? null, null);
      assert.equal(meta.startImage ?? null, null);
    });

    it("lets a person choose words only, and makes an improvement quote that keeps the context", async () => {
      const t = await tenant();
      const brand = await brandWithProfile(t);
      const prod = await createProduct(t.p, productSchema.parse({ brandId: brand.id, name: "Chai" }));
      await addProductImages(t.p, prod.id, [file(await png())]);
      await addCredits(t.org.id, 200);
      const thread = await createThread(t.org.id, t.user.id);
      const [, q1] = await postMessage(t.org.id, thread.id, "/image steaming chai on a table", { context: { productId: prod.id, startImage: null } });
      assert.equal((q1!.meta as unknown as QuoteMeta).startImage, null);

      const made = await generateFromQuote(t.org.id, t.user.id, q1!.id);
      await submitGeneration(made.asset!.id, false);
      await pollGeneration(made.asset!.id, 0);
      const improved = await reviseQuote(t.org.id, made.asset!.id, "warmer light, closer on the cup");
      const meta = improved.meta as unknown as QuoteMeta;
      assert.match(meta.prompt, /Changes requested: warmer light, closer on the cup/);
      assert.equal(meta.productId, prod.id);
      assert.equal(await wallet(t.org.id).then((w) => w.credits), 198, "a quote costs nothing until it is generated");
      const again = await reviseQuote(t.org.id, made.asset!.id, "more energy");
      assert.equal((again.meta as unknown as QuoteMeta).prompt.match(/Changes requested/g)?.length, 1, "suggestions replace, not pile up");
      assert.ok((await rejection(() => reviseQuote(t.org.id, made.asset!.id, "x"))) instanceof ApiError);
    });
  });

  describe("readiness", () => {
    it("says exactly what is missing, in order, and clears as the essentials appear", async () => {
      const t = await tenant();
      let reqs = await requirements(t.org.id, AUTOPILOT_NEEDS);
      assert.equal(reqs.find((r) => r.key === "brand")?.ok, false);
      const err = await rejection(() => assertReady(t.org.id, AUTOPILOT_NEEDS));
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 409);
      assert.equal(err.code, "REQUIREMENTS_UNMET");

      const brand = await db.brand.create({ data: { organizationId: t.org.id, name: "B", slug: "b", brandNumber: "BRD-1" } });
      reqs = await requirements(t.org.id, ["brand", "brandProfile"], { brandId: brand.id });
      assert.deepEqual(reqs.map((r) => r.ok), [true, false]);
      await db.brand.update({ where: { id: brand.id }, data: { slogan: "Hi" } });
      await setBrandImage(t.p, brand.id, "cover", file(await png(800, 450)));
      reqs = await requirements(t.org.id, ["brandProfile", "product", "channel"], { brandId: brand.id });
      assert.deepEqual(reqs.map((r) => r.ok), [true, false, false]);
    });
  });

  describe("Autopilot", () => {
    async function ready() {
      const t = await tenant();
      const brand = await brandWithProfile(t);
      const prod = await createProduct(t.p, productSchema.parse({ brandId: brand.id, name: "Chapati pack", priceCents: 30000, trackStock: true, stockQty: 10 }));
      await addProductImages(t.p, prod.id, [file(await png())]);
      const ch = await channel(t.org.id, brand.id);
      await addCredits(t.org.id, 500);
      return { ...t, brand, prod, ch };
    }
    const input = (r: Awaited<ReturnType<typeof ready>>, over: Record<string, unknown> = {}) =>
      autopilotSchema.parse({ name: "Weekly", brandId: r.brand.id, productIds: [r.prod.id], channelIds: [r.ch.id], schedule: everyDay, ...over });

    /** Takes one run all the way: queue it, start it, let the simulator finish, then finish the run. */
    async function runOnce(autopilotId: string, slot: string) {
      await runAutopilot(autopilotId, slot);
      const run = await db.autopilotRun.findUniqueOrThrow({ where: { autopilotId_slotKey: { autopilotId, slotKey: slot } } });
      if (run.assetId) {
        await submitGeneration(run.assetId, false);
        await pollGeneration(run.assetId, 0);
        await finishAutopilotRun(run.id);
      }
      return db.autopilotRun.findUniqueOrThrow({ where: { id: run.id } });
    }

    it("will not be created until the essentials are in place", async () => {
      const t = await tenant();
      const err = await rejection(() => createAutopilot(t.p, autopilotSchema.parse({ name: "Nope", brandId: "x", channelIds: ["y"], schedule: everyDay })));
      assert.ok(err instanceof ApiError);
    });

    it("holds a post for approval, then sends it when approved, once", async () => {
      const r = await ready();
      const a = await createAutopilot(r.p, input(r));
      assert.equal(a.enabled, true);
      assert.ok(a.nextRunAt);

      const slot = new Date().toISOString();
      const run = await runOnce(a.id, slot);
      assert.equal(run.status, "AWAITING_APPROVAL");
      assert.equal(run.postIds.length, 1);
      const draft = await db.socialPost.findUniqueOrThrow({ where: { id: run.postIds[0]! } });
      assert.equal(draft.status, "DRAFT");
      assert.equal(draft.approvedById, null);
      assert.ok(await db.notification.count({ where: { organizationId: r.org.id, kind: "autopilot.needs_approval" } }));

      await approveRun(r.p, run.id, { caption: "Fresh chapati, ready today!" });
      const sent = await db.socialPost.findUniqueOrThrow({ where: { id: draft.id } });
      assert.equal(sent.status, "SCHEDULED");
      assert.equal((sent.content as { text: string }).text, "Fresh chapati, ready today!");
      assert.equal(sent.approvedById, r.user.id);
      assert.equal(await db.job.count({ where: { type: "publish.post", dedupeKey: `publish:${draft.id}:0` } }), 1);
      const twice = await rejection(() => approveRun(r.p, run.id));
      assert.equal((twice as ApiError).status, 409);
    });

    it("posts by itself when set to, and a rejected post is never sent", async () => {
      const r = await ready();
      const auto = await createAutopilot(r.p, input(r, { mode: "AUTO_POST" }));
      const run = await runOnce(auto.id, new Date().toISOString());
      assert.equal(run.status, "SCHEDULED");
      const post = await db.socialPost.findUniqueOrThrow({ where: { id: run.postIds[0]! } });
      assert.equal(post.status, "SCHEDULED");
      assert.equal(post.approvedById, r.user.id);

      const ask = await createAutopilot(r.p, input(r, { name: "Ask first" }));
      const held = await runOnce(ask.id, new Date(Date.now() + 1000).toISOString());
      await rejectRun(r.p, held.id);
      assert.equal((await db.socialPost.findUniqueOrThrow({ where: { id: held.postIds[0]! } })).status, "ARCHIVED");
      assert.equal((await db.autopilotRun.findUniqueOrThrow({ where: { id: held.id } })).status, "REJECTED");
    });

    it("runs a slot once however often the job is delivered", async () => {
      const r = await ready();
      const a = await createAutopilot(r.p, input(r));
      // Earlier suites leave due autopilots behind (the test database is kept between runs), so
      // assert on THIS autopilot's job rather than the tick's platform-wide return count.
      const slot = new Date(Date.now() - 60_000);
      await db.autopilot.update({ where: { id: a.id }, data: { nextRunAt: slot } });
      const mine = { type: "autopilot.run", dedupeKey: `autopilot:${a.id}:${slot.toISOString()}` };
      await autopilotTick();
      assert.equal(await db.job.count({ where: mine }), 1, "the due slot is queued");
      await autopilotTick();
      assert.equal(await db.job.count({ where: mine }), 1, "the slot was moved on, so it is not queued again");
      const raced = new Date(Date.now() - 1000).toISOString();
      await Promise.all([runAutopilot(a.id, raced), runAutopilot(a.id, raced), runAutopilot(a.id, raced)]);
      assert.equal(await db.autopilotRun.count({ where: { autopilotId: a.id, slotKey: raced } }), 1);
      assert.equal(await db.generatedAsset.count({ where: { organizationId: r.org.id } }), 1, "one generation, one charge");
    });

    it("skips, and says why, when credits are short, the limit is reached, or everything is sold out", async () => {
      const r = await ready();
      const a = await createAutopilot(r.p, input(r, { monthlyCreditCap: 1 }));
      const capped = await runOnce(a.id, new Date().toISOString());
      assert.equal(capped.status, "SKIPPED");
      assert.match(capped.reason ?? "", /limit/i);

      const b = await createAutopilot(r.p, input(r, { name: "Stock" }));
      await adjustStock(r.p, r.prod.id, { setTo: 0, reason: "ADJUSTMENT" });
      const soldOut = await runOnce(b.id, new Date(Date.now() + 1000).toISOString());
      assert.equal(soldOut.status, "SKIPPED");
      assert.match(soldOut.reason ?? "", /out of stock/i);
      await adjustStock(r.p, r.prod.id, { setTo: 5, reason: "RESTOCK" });

      const poor = await ready();
      const c = await createAutopilot(poor.p, input(poor));
      await db.tokenBalance.updateMany({ where: { organizationId: poor.org.id }, data: { balance: 0 } });
      const broke = await runOnce(c.id, new Date().toISOString());
      assert.equal(broke.status, "SKIPPED");
      assert.match(broke.reason ?? "", /credits/i);
      assert.equal(await db.generatedAsset.count({ where: { organizationId: poor.org.id } }), 0);
    });

    it("switches itself off after three failures in a row, and says why", async () => {
      const r = await ready();
      const a = await createAutopilot(r.p, input(r, { guidance: "[fail] this one is meant to fail" }));
      for (let i = 0; i < 3; i++) await runOnce(a.id, new Date(Date.now() + i * 1000).toISOString());
      const after = (await getAutopilot(r.p, a.id)).autopilot;
      assert.equal(after.enabled, false);
      assert.match(after.pausedReason ?? "", /in a row/);
      assert.ok(await db.notification.count({ where: { organizationId: r.org.id, kind: "autopilot.paused" } }));
      assert.equal((await wallet(r.org.id)).credits, 500, "failed renders were refunded");
      const again = await updateAutopilot(r.p, a.id, { enabled: true, guidance: "Friendly weekend offers" });
      assert.equal(again.enabled, true);
      assert.equal(again.pausedReason, null);
    });

    it("pauses when its account is disconnected", async () => {
      const r = await ready();
      const a = await createAutopilot(r.p, input(r));
      await db.socialChannel.update({ where: { id: r.ch.id }, data: { status: "DISCONNECTED" } });
      const run = await runOnce(a.id, new Date().toISOString());
      assert.equal(run.status, "SKIPPED");
      assert.equal((await getAutopilot(r.p, a.id)).autopilot.enabled, false);
    });
  });
});
