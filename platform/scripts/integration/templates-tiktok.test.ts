import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import type { Principal } from "@/lib/rbac";
import { runAutomation } from "@/server/automations";
import { saveExternalAccount } from "@/server/external-accounts";
import { storageKeyFor } from "@/server/reference-images";
import { publishPost, schedulePosts } from "@/server/social";
import { saveFromUrl } from "@/server/storage";
import {
  addTemplateImages,
  createOrgTemplate,
  getTemplateFor,
  importPins,
  listForOrganization,
  moderateTemplate,
  removeTemplateImage,
  templateContext,
  templateFromPins,
  templateImageFile,
  updateOrgTemplate,
} from "@/server/templates";
import { simulatedTikTokReplies, simulateTikTokComment } from "@/server/tiktok";
import { checkTikTokStatus, connectTikTok, connectTikTokComments, handleTikTokWebhook, sweepTikTokComments, tiktokTokenFor } from "@/server/tiktok-posting";

import { addMember, enableModules, makeOrg, makeUser, rejection, uid } from "./_helpers";

async function tenant() {
  const org = await makeOrg({ plan: "INTERNAL" });
  const { user } = await makeUser();
  await addMember(user.id, org.id, "OWNER");
  await enableModules(org.id, ["AI_CONTENT", "SOCIAL_PUBLISHING"]);
  const owner: Principal = { userId: user.id, organizationId: org.id, role: "OWNER", extraPermissions: [], enabledModules: new Set(["AI_CONTENT", "SOCIAL_PUBLISHING"]), mfa: true };
  const brand = await db.brand.create({ data: { organizationId: org.id, name: "Tari", slug: `tari-${uid()}`, brandNumber: `B-${uid()}`, createdById: user.id } });
  return { orgId: org.id, userId: user.id, owner, brandId: brand.id };
}

async function sampleFile(name = "coffee.jpg"): Promise<File> {
  const bytes = await readFile(path.resolve(process.cwd(), "public/showcase/samples", name));
  return new File([bytes], name, { type: "image/jpeg" });
}

const OWN_PIN = "100016"; // the simulator's first own pin (burger)

/** The TikTok simulator always signs in as the same account; release it from earlier tests and runs first. */
async function releaseSimulatedTikTok() {
  await db.socialChannel.updateMany({ where: { platform: "TIKTOK", externalId: "sim-tiktok-creator", status: { not: "DISCONNECTED" } }, data: { status: "DISCONNECTED" } });
}

describe("organisation templates, Pinterest and TikTok", () => {
  let admin: Principal;

  before(async () => {
    process.env.STORAGE_DIR = path.join(os.tmpdir(), "agency-integration-storage");
    process.env.SIMULATOR_TIKTOK_MS = "0";
    resetEnvCache();
    const { user } = await makeUser({ isPlatformAdmin: true });
    admin = { userId: user.id, organizationId: null, role: "SUPER_ADMIN", extraPermissions: [], enabledModules: new Set(), mfa: true };
  });
  after(() => db.$disconnect());

  it("keeps a private template to its organisation, shares a public one, and lets an admin hide it", async () => {
    const a = await tenant();
    const b = await tenant();
    const t = await createOrgTemplate(a.owner, { title: "Weekend food", description: "Bright overhead food shots with a price tag.", status: "DRAFT", visibility: "PRIVATE" });
    const early = await rejection(() => updateOrgTemplate(a.owner, t.id, { status: "PUBLISHED" }));
    assert.equal((early as ApiError).status, 422, "no images, no publishing");
    await addTemplateImages(a.owner, t.id, [await sampleFile()], "Hero shot");
    await updateOrgTemplate(a.owner, t.id, { status: "PUBLISHED" });
    const [image] = (await getTemplateFor(a.orgId, t.id)).images;

    // Private: only A.
    assert.ok((await listForOrganization(a.orgId)).some((x) => x.id === t.id && x.scope === "mine"));
    assert.equal((await listForOrganization(b.orgId)).some((x) => x.id === t.id), false);
    assert.equal(((await rejection(() => getTemplateFor(b.orgId, t.id))) as ApiError).status, 404);
    assert.equal(await templateImageFile(b.owner, image!.id), null);
    assert.equal(await templateContext(t.id, b.orgId), null, "B cannot put A's private template in a prompt");
    assert.ok(await templateContext(t.id, a.orgId));
    assert.equal(((await rejection(() => updateOrgTemplate(b.owner, t.id, { title: "Mine now" }))) as ApiError).status, 404);

    // Public: everyone, as "shared".
    await updateOrgTemplate(a.owner, t.id, { visibility: "PUBLIC" });
    assert.ok((await listForOrganization(b.orgId)).some((x) => x.id === t.id && x.scope === "shared"));
    assert.ok(await templateImageFile(b.owner, image!.id));

    // Hidden by an admin: gone for B, still A's.
    const noReason = await rejection(() => moderateTemplate(admin, t.id, { hidden: true }));
    assert.equal((noReason as ApiError).status, 422);
    await moderateTemplate(admin, t.id, { hidden: true, reason: "Uses a client's logo" });
    assert.equal((await listForOrganization(b.orgId)).some((x) => x.id === t.id), false);
    const own = (await listForOrganization(a.orgId)).find((x) => x.id === t.id);
    assert.equal(own?.hidden, true);
    assert.equal(((await rejection(() => moderateTemplate(a.owner, t.id, { hidden: false }))) as ApiError).status, 403);
  });

  it("imports pins with credit, trusts ownership only from Pinterest, and keeps other people's pins private", async () => {
    const a = await tenant();
    await saveExternalAccount({
      organizationId: a.orgId,
      provider: "PINTEREST",
      externalId: "sim-pinterest-user",
      name: "Your studio",
      handle: "your-studio",
      tokens: { accessToken: "sim-pinterest-access", accessExpiresAt: new Date(Date.now() + 86_400_000), refreshToken: "sim-pinterest-refresh", refreshExpiresAt: null, scopes: [] },
      connectedById: a.userId,
    });
    const t = await createOrgTemplate(a.owner, { title: "Moodboard", description: "References for the new menu.", status: "DRAFT", visibility: "PRIVATE" });

    const r = await importPins(a.owner, t.id, [
      { id: OWN_PIN, source: "own" },
      { id: "77001", source: "link", link: "https://www.pinterest.com/pin/77001/" },
    ]);
    assert.deepEqual({ owned: r.owned, others: r.others }, { owned: 1, others: 1 });
    const detail = await getTemplateFor(a.orgId, t.id);
    const mine = detail.images.find((i) => i.source?.owned);
    const theirs = detail.images.find((i) => i.source && !i.source.owned);
    assert.equal(theirs?.source?.url, "https://www.pinterest.com/pin/77001/");
    assert.ok(detail.promptHint?.startsWith("In the style of these references"));

    // The browser's word is not enough: a partner pin claimed as "own" is looked up and refused.
    const spoof = await rejection(() => importPins(a.owner, t.id, [{ id: "900016", source: "own" }]));
    assert.equal((spoof as ApiError).code, "PIN_NOT_FOUND");
    const partner = await rejection(() => importPins(a.owner, t.id, [{ id: "900016", source: "partner", imageUrl: "https://i.pinimg.com/736x/a.jpg" }]));
    assert.equal((partner as ApiError).status, 403, "partner search is off");

    // Someone else's pin keeps the template private.
    await updateOrgTemplate(a.owner, t.id, { status: "PUBLISHED" });
    const share = await rejection(() => updateOrgTemplate(a.owner, t.id, { visibility: "PUBLIC" }));
    assert.equal((share as ApiError).code, "NOT_YOURS_TO_SHARE");
    await removeTemplateImage(a.owner, t.id, theirs!.id);
    await updateOrgTemplate(a.owner, t.id, { visibility: "PUBLIC" });
    const intoPublic = await rejection(() => importPins(a.owner, t.id, [{ id: "77002", source: "link", link: "https://www.pinterest.com/pin/77002/" }]));
    assert.equal((intoPublic as ApiError).code, "NOT_YOURS_TO_SHARE");

    // Other people's pictures are never a video's first frame; your own pin can be.
    const studio = await templateFromPins(a.owner, { pins: [{ id: "77003", source: "link", link: "https://www.pinterest.com/pin/77003/" }] });
    const st = await db.template.findUniqueOrThrow({ where: { id: studio.id }, include: { images: true } });
    assert.equal(st.visibility, "PRIVATE");
    assert.equal(st.status, "PUBLISHED");
    assert.equal(await storageKeyFor(a.orgId, { source: "template", id: st.images[0]!.id }, { templateId: st.id }), null);
    assert.ok(await storageKeyFor(a.orgId, { source: "template", id: mine!.id }, { templateId: t.id }));
    const b = await tenant();
    assert.equal(await storageKeyFor(b.orgId, { source: "template", id: st.images[0]!.id }, { templateId: st.id }), null, "and never another organisation's private one");
  });

  it("posts to TikTok: privacy chosen per post, asynchronous publish, refreshes the day-long token", async () => {
    const a = await tenant();
    await releaseSimulatedTikTok();
    const channel = await connectTikTok(a.owner, a.brandId, "sim-tiktok-code", "http://localhost:3400/api/channels/tiktok/callback");
    const row = await db.socialChannel.findUniqueOrThrow({ where: { id: channel.id } });
    assert.equal(row.platform, "TIKTOK");
    assert.ok(row.refreshCipher, "refresh token sealed");

    const image = await db.generatedAsset.create({
      data: { organizationId: a.orgId, status: "READY", mediaType: "IMAGE", model: "test", prompt: "Poster", requestId: `gen_${uid()}`, createdById: a.userId, storageKey: "unused-for-photos.jpg" },
    });
    const noPrivacy = await rejection(() => schedulePosts(a.owner, { channelIds: [channel.id], text: "Weekend offer", assetId: image.id }));
    assert.equal((noPrivacy as ApiError).status, 422);
    const noMedia = await rejection(() => schedulePosts(a.owner, { channelIds: [channel.id], text: "Words only", tiktok: { privacyLevel: "SELF_ONLY" } }));
    assert.equal((noMedia as ApiError).status, 422);

    const [post] = await schedulePosts(a.owner, { channelIds: [channel.id], text: "Weekend offer", assetId: image.id, tiktok: { privacyLevel: "PUBLIC_TO_EVERYONE", allowComments: true } });
    await publishPost(post!.id);
    const started = await db.socialPost.findUniqueOrThrow({ where: { id: post!.id } });
    assert.equal(started.status, "PUBLISHING");
    assert.ok((started.content as { tiktokPublishId?: string }).tiktokPublishId);
    await publishPost(post!.id); // a redelivered job does not post twice
    await checkTikTokStatus(post!.id, 0);
    const done = await db.socialPost.findUniqueOrThrow({ where: { id: post!.id } });
    assert.equal(done.status, "PUBLISHED");
    assert.match(done.externalUrl ?? "", /^https:\/\/www\.tiktok\.com\/@your\.tiktok\/video\/\d+$/);

    // A video goes up in chunks from storage.
    const saved = await saveFromUrl("sim://showcase/tari-spot-5s.mp4", `assets/${a.orgId}/${uid()}`, ".mp4");
    const video = await db.generatedAsset.create({
      data: { organizationId: a.orgId, status: "READY", mediaType: "VIDEO", model: "test", prompt: "Clip", requestId: `gen_${uid()}`, createdById: a.userId, storageKey: saved.key, mimeType: "video/mp4", durationSeconds: 5 },
    });
    const [clip] = await schedulePosts(a.owner, { channelIds: [channel.id], text: "A clip", assetId: video.id, tiktok: { privacyLevel: "SELF_ONLY" } });
    await publishPost(clip!.id);
    await checkTikTokStatus(clip!.id, 0);
    assert.equal((await db.socialPost.findUniqueOrThrow({ where: { id: clip!.id } })).status, "PUBLISHED");

    // TikTok refuses: the post fails with TikTok's reason in plain words.
    const [bad] = await schedulePosts(a.owner, { channelIds: [channel.id], text: "This will [fail]", assetId: image.id, tiktok: { privacyLevel: "SELF_ONLY" } });
    await publishPost(bad!.id);
    await checkTikTokStatus(bad!.id, 0);
    const failed = await db.socialPost.findUniqueOrThrow({ where: { id: bad!.id } });
    assert.equal(failed.status, "FAILED");
    assert.match(failed.error ?? "", /too often/);

    // An expired access token is refreshed before use.
    await db.socialChannel.update({ where: { id: channel.id }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    await tiktokTokenFor(await db.socialChannel.findUniqueOrThrow({ where: { id: channel.id } }));
    assert.ok((await db.socialChannel.findUniqueOrThrow({ where: { id: channel.id } })).tokenExpiresAt!.getTime() > Date.now() + 3_600_000);

    // Deauthorised on TikTok's side: the channel is disconnected.
    assert.equal(await handleTikTokWebhook({ event: "authorization.removed", user_openid: row.externalId! }), "disconnected 1");
  });

  it("answers new TikTok comments through automations, once, and never answers itself or old comments", async () => {
    const a = await tenant();
    await releaseSimulatedTikTok();
    const channel = await connectTikTok(a.owner, a.brandId, "sim-tiktok-code", "http://localhost:3400/api/channels/tiktok/callback");
    // One organisation per TikTok account: earlier tests' links to the simulated account are switched off.
    await db.externalAccount.updateMany({ where: { provider: "TIKTOK_BUSINESS", externalId: "sim-tiktok-business", organizationId: { not: a.orgId } }, data: { status: "DISCONNECTED" } });
    await connectTikTokComments(a.owner, channel.id, "sim-tiktok-biz-code", "http://localhost:3400/api/channels/tiktok/business/callback");
    const rule = await db.automation.create({
      data: {
        organizationId: a.orgId,
        name: "Price questions",
        trigger: "COMMENT_RECEIVED",
        conditions: { match: "keywords", keywords: ["price"] },
        actions: [{ type: "SEND_REPLY", text: "Hi {{name}}! Send us a message for prices." }],
        enabled: true,
        createdById: a.userId,
      },
    });

    const videoId = `73${Date.now()}`;
    simulateTikTokComment(videoId, "What's the price? (old comment)", "early_bird");
    await sweepTikTokComments(); // first look at the video: records where it is up to, answers nothing
    assert.equal(await db.job.count({ where: { type: "automation.run", dedupeKey: { startsWith: `automation:${rule.id}:` } } }), 0);

    const c = simulateTikTokComment(videoId, "Nice! What's the price?", "wanjiku");
    simulateTikTokComment(videoId, "Love the colours", "kamau"); // no keyword: no run
    await sweepTikTokComments();
    await sweepTikTokComments(); // again: nothing new
    const jobs = await db.job.findMany({ where: { type: "automation.run", dedupeKey: { startsWith: `automation:${rule.id}:` } } });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]!.dedupeKey, `automation:${rule.id}:tiktok-comment:${c.commentId}`);

    await runAutomation(jobs[0]!.payload as never);
    const reply = simulatedTikTokReplies().find((x) => x.commentId === c.commentId);
    assert.equal(reply?.text, "Hi wanjiku! Send us a message for prices.");
    const run = await db.automationRun.findFirstOrThrow({ where: { automationId: rule.id } });
    assert.equal(run.status, "SUCCEEDED");

    await sweepTikTokComments(); // our own reply is not a new comment to answer
    assert.equal(await db.job.count({ where: { type: "automation.run", dedupeKey: { startsWith: `automation:${rule.id}:` } } }), 1);
  });
});
