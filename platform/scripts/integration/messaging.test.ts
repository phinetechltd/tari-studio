import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { GET as verifyWebhook, POST as postWebhook } from "@/app/api/webhooks/whatsapp/route";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { signPayload } from "@/lib/meta-signature";
import type { Principal } from "@/lib/rbac";
import { createAutomation } from "@/server/automations";
import { createCampaign, createTrackedLink, recordClick, resolveTrackedLink } from "@/server/campaigns";
import { saveGateway } from "@/server/gateways";
import type { JobRow } from "@/server/jobs";
import { connectMetaPages, connectWhatsAppNumber, publishPost, schedulePosts } from "@/server/social";
import { OutsideServiceWindowError, processWebhook, sendWhatsAppText, type WaWebhook } from "@/server/whatsapp";
import { handlers } from "@/worker/handlers";

import { addMember, enableModules, makeOrg, makeUser, rejection, uid } from "./_helpers";

/** Drains queued jobs of the given types for one organisation, as the worker would. */
async function drain(organizationId: string, types: string[]): Promise<number> {
  let ran = 0;
  for (let round = 0; round < 5; round++) {
    const jobs = await db.job.findMany({ where: { organizationId, status: "QUEUED", type: { in: types } }, orderBy: { createdAt: "asc" } });
    if (jobs.length === 0) break;
    for (const job of jobs) {
      await db.job.update({ where: { id: job.id }, data: { status: "RUNNING", attempts: { increment: 1 } } });
      await handlers[job.type]!(job as unknown as JobRow);
      await db.job.update({ where: { id: job.id }, data: { status: "DONE", finishedAt: new Date() } });
      ran++;
    }
  }
  return ran;
}

function inbound(phoneNumberId: string, from: string, body: string, opts: { id?: string; name?: string; at?: Date } = {}): WaWebhook {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ wa_id: from, profile: { name: opts.name ?? "Wanjiku Test" } }],
              messages: [
                {
                  from,
                  id: opts.id ?? `wamid.TEST${uid()}`,
                  timestamp: String(Math.floor((opts.at ?? new Date()).getTime() / 1000)),
                  type: "text",
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

const kenyanNumber = () => `2547${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;

describe("WhatsApp, automations, campaigns and publishing", () => {
  let orgId: string;
  let brandId: string;
  let owner: Principal;
  let phoneNumberId: string;
  let channelId: string;

  before(async () => {
    resetEnvCache();
    const org = await makeOrg({ plan: "INTERNAL" });
    orgId = org.id;
    const { user } = await makeUser();
    await addMember(user.id, orgId, "OWNER");
    const modules = ["CONTENT_STUDIO", "SOCIAL_PUBLISHING", "CAMPAIGN_TRACKING", "AI_CONTENT", "LEADS_CRM", "WHATSAPP_AI"] as const;
    await enableModules(orgId, [...modules]);
    owner = { userId: user.id, organizationId: orgId, role: "OWNER", extraPermissions: [], enabledModules: new Set(modules), mfa: true };
    const brand = await db.brand.create({
      data: { organizationId: orgId, name: `Brand ${uid()}`, slug: `brand-${uid()}`, brandNumber: `BRD-${uid()}` },
    });
    brandId = brand.id;
    await db.catalogueItem.create({ data: { organizationId: orgId, brandId, name: "Prepaid meter", priceCents: 475_000 } });
    phoneNumberId = `sim-${uid()}`;
    const channel = await connectWhatsAppNumber(owner, { brandId, phoneNumberId, accessToken: "simulated-token-not-a-secret" });
    channelId = channel.id;
  });
  after(() => db.$disconnect());

  it("stores an inbound message once, however many times WhatsApp delivers it", async () => {
    const from = kenyanNumber();
    const payload = inbound(phoneNumberId, from, "Hello there", { id: `wamid.DUP${uid()}` });
    const first = await processWebhook(payload);
    const second = await processWebhook(payload);
    assert.deepEqual([first.messages, first.duplicates], [1, 0]);
    assert.deepEqual([second.messages, second.duplicates], [0, 1]);
    const contact = await db.contact.findUniqueOrThrow({ where: { organizationId_phone: { organizationId: orgId, phone: from } } });
    assert.equal(contact.name, "Wanjiku Test");
    const conversation = await db.conversation.findFirstOrThrow({ where: { contactId: contact.id } });
    assert.equal(conversation.unreadCount, 1);
    assert.equal(await db.message.count({ where: { conversationId: conversation.id } }), 1);
  });

  it("ignores deliveries for a number no organisation has connected", async () => {
    const outcome = await processWebhook(inbound(`unknown-${uid()}`, kenyanNumber(), "hi"));
    assert.equal(outcome.unrouted, 1);
    assert.equal(outcome.messages, 0);
  });

  it("credits a chat to the campaign whose tracked link carried the ref code", async () => {
    const campaign = await createCampaign(owner, { brandId, name: `Launch ${uid()}`, source: "WHATSAPP" });
    const link = await createTrackedLink(owner, campaign.id, { kind: "whatsapp", label: "Poster", phone: "0712 345 678", message: "Hi, I saw the poster" });
    assert.match(link.destinationUrl, new RegExp(`Ref%3A%20${link.shortCode}`));
    const from = kenyanNumber();
    await processWebhook(inbound(phoneNumberId, from, `Hi, I saw the poster\n\nRef: ${link.shortCode}`));
    const contact = await db.contact.findUniqueOrThrow({ where: { organizationId_phone: { organizationId: orgId, phone: from } } });
    assert.equal(contact.campaignId, campaign.id);
  });

  it("answers a new lead and a keyword with automations, once each, and never twice", async () => {
    const welcome = await createAutomation(owner, {
      name: "Welcome",
      trigger: "LEAD_CREATED",
      actions: [{ type: "SEND_REPLY", text: "Karibu {{name}} to {{brand}}!" }, { type: "ADD_TAG", tag: "new-lead" }, { type: "NOTIFY_TEAM", message: "New lead" }],
    });
    const price = await createAutomation(owner, {
      name: "Price",
      trigger: "MESSAGE_RECEIVED",
      conditions: { match: "keywords", keywords: ["price", "bei"] },
      actions: [{ type: "AI_REPLY", instructions: "" }, { type: "SET_STAGE", stage: "QUALIFIED" }],
    });

    const from = kenyanNumber();
    await processWebhook(inbound(phoneNumberId, from, "What is the price of the meter?", { name: "Amina Otieno" }));
    await drain(orgId, ["automation.run"]);

    const contact = await db.contact.findUniqueOrThrow({ where: { organizationId_phone: { organizationId: orgId, phone: from } } });
    const out = await db.message.findMany({ where: { conversation: { contactId: contact.id }, direction: "OUT" }, orderBy: { createdAt: "asc" } });
    assert.equal(out.length, 2, "one welcome, one AI answer");
    assert.ok(out.every((m) => m.status === "SENT" && m.externalId?.startsWith("wamid.SIM")));
    assert.ok(out.some((m) => m.author === "AUTOMATION" && m.body!.startsWith("Karibu Amina to Brand")));
    assert.ok(out.some((m) => m.author === "AI" && m.body!.startsWith("[fixtures]")));
    assert.equal(contact.stage, "QUALIFIED");
    assert.deepEqual(contact.tags, ["new-lead"]);
    assert.ok((await db.notification.count({ where: { organizationId: orgId, kind: "automation.notify" } })) >= 1);
    assert.ok((await db.aiUsage.count({ where: { organizationId: orgId, feature: "whatsapp_auto_reply" } })) >= 1);

    // A second message without a keyword: no new lead, no price answer.
    await processWebhook(inbound(phoneNumberId, from, "Thanks!"));
    await drain(orgId, ["automation.run"]);
    assert.equal(await db.message.count({ where: { conversation: { contactId: contact.id }, direction: "OUT" } }), 2);

    // Replaying the same automation job for the same event does nothing.
    const run = await db.automationRun.findFirstOrThrow({ where: { automationId: welcome.id } });
    await handlers["automation.run"]!({ id: "replay", type: "automation.run", payload: { automationId: welcome.id, eventKey: run.eventKey, context: {} } } as unknown as JobRow);
    assert.equal(await db.automationRun.count({ where: { automationId: welcome.id } }), 1);
    assert.equal((await db.automation.findUniqueOrThrow({ where: { id: price.id } })).runCount, 1);
  });

  it("stays quiet when automations are paused on a conversation", async () => {
    const from = kenyanNumber();
    await processWebhook(inbound(phoneNumberId, from, "first"));
    await drain(orgId, ["automation.run"]);
    const conversation = await db.conversation.findFirstOrThrow({ where: { contact: { phone: from, organizationId: orgId } } });
    const before = await db.message.count({ where: { conversationId: conversation.id, direction: "OUT" } });
    await db.conversation.update({ where: { id: conversation.id }, data: { automationsPaused: true } });
    await processWebhook(inbound(phoneNumberId, from, "what is the price"));
    await drain(orgId, ["automation.run"]);
    assert.equal(await db.message.count({ where: { conversationId: conversation.id, direction: "OUT" } }), before);
  });

  it("refuses free-form replies outside WhatsApp's 24-hour window", async () => {
    const from = kenyanNumber();
    await processWebhook(inbound(phoneNumberId, from, "old message", { at: new Date(Date.now() - 25 * 3_600_000) }));
    const conversation = await db.conversation.findFirstOrThrow({ where: { contact: { phone: from, organizationId: orgId } } });
    const error = await rejection(() => sendWhatsAppText(conversation.id, "Hello again", { author: "PERSON", sentById: owner.userId }));
    assert.ok(error instanceof OutsideServiceWindowError);
  });

  it("moves delivery receipts forward only", async () => {
    const from = kenyanNumber();
    await processWebhook(inbound(phoneNumberId, from, "hi"));
    const conversation = await db.conversation.findFirstOrThrow({ where: { contact: { phone: from, organizationId: orgId } } });
    const sent = await sendWhatsAppText(conversation.id, "Hello!", { author: "PERSON", sentById: owner.userId });
    const receipt = (status: string): WaWebhook => ({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, statuses: [{ id: sent.externalId!, status }] } }] }],
    });
    await processWebhook(receipt("read"));
    await processWebhook(receipt("delivered"));
    assert.equal((await db.message.findUniqueOrThrow({ where: { id: sent.id } })).status, "READ");
  });

  it("verifies Meta's webhook handshake and signatures", async () => {
    const ok = await verifyWebhook(
      new Request("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=integration-verify-token&hub.challenge=12345"),
      { params: Promise.resolve({}) },
    );
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), "12345");
    const bad = await verifyWebhook(new Request("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1"), { params: Promise.resolve({}) });
    assert.equal(bad.status, 403);

    const body = JSON.stringify(inbound(phoneNumberId, kenyanNumber(), "signed hello"));
    const signed = await postWebhook(
      new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", body, headers: { "x-hub-signature-256": signPayload(body, "integration-meta-app-secret") } }),
      { params: Promise.resolve({}) },
    );
    assert.equal(signed.status, 200);
    assert.equal(((await signed.json()) as { data: { messages: number } }).data.messages, 1);

    const forged = await postWebhook(
      new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", body, headers: { "x-hub-signature-256": signPayload(body, "someone-else") } }),
      { params: Promise.resolve({}) },
    );
    assert.equal(forged.status, 401);
  });

  it("counts people, not link-preview bots or double taps, and forwards with UTM tags", async () => {
    const campaign = await createCampaign(owner, { brandId, name: `Web ${uid()}`, source: "FACEBOOK" });
    const link = await createTrackedLink(owner, campaign.id, { kind: "web", label: "Product page", destinationUrl: "https://shop.example/meter" });
    const resolved = await resolveTrackedLink(link.shortCode);
    const url = new URL(resolved!.destination);
    assert.equal(url.searchParams.get("utm_source"), "facebook");
    assert.equal(url.searchParams.get("utm_content"), "product-page");

    const phone = (ip: string) =>
      new Request(`http://localhost/l/${link.shortCode}`, {
        headers: { "user-agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", "x-forwarded-for": ip },
      });
    assert.equal(await recordClick(link.id, phone("10.0.0.1")), true);
    assert.equal(await recordClick(link.id, phone("10.0.0.1")), false, "same visitor within ten minutes");
    assert.equal(await recordClick(link.id, phone("10.0.0.2")), true);
    assert.equal(await recordClick(link.id, new Request("http://localhost/l/x", { headers: { "user-agent": "WhatsApp/2.23.20.0 A" } })), false);
    assert.equal((await db.trackedLink.findUniqueOrThrow({ where: { id: link.id } })).clickCount, 2);
  });

  it("publishes a scheduled post once, records failures, and never re-posts an interrupted attempt", async () => {
    const [page, ig] = await connectMetaPages(owner, brandId, [
      { pageId: `page-${uid()}`, pageName: "Test Page", pageToken: "simulated-page-token", instagram: { id: `ig-${uid()}`, username: "test_ig" } },
    ]);
    assert.equal(page!.platform, "FACEBOOK");
    assert.equal(ig!.platform, "INSTAGRAM");

    await assert.rejects(() => schedulePosts(owner, { channelIds: [ig!.id], text: "no media" }), /needs an image or a video/);
    await assert.rejects(() => schedulePosts(owner, { channelIds: [channelId], text: "to whatsapp" }), /WhatsApp numbers receive replies/);

    const [ok] = await schedulePosts(owner, { channelIds: [page!.id], text: "Weekend offer on meters" });
    await drain(orgId, ["publish.post"]);
    const published = await db.socialPost.findUniqueOrThrow({ where: { id: ok!.id } });
    assert.equal(published.status, "PUBLISHED");
    assert.ok(published.externalId);
    await publishPost(ok!.id);
    assert.equal((await db.socialPost.findUniqueOrThrow({ where: { id: ok!.id } })).externalId, published.externalId);

    await createAutomation(owner, { name: "Failed post alert", trigger: "POST_FAILED", actions: [{ type: "NOTIFY_TEAM", message: "Post failed" }] });
    const [bad] = await schedulePosts(owner, { channelIds: [page!.id], text: "This one will [fail]" });
    await drain(orgId, ["publish.post", "automation.run"]);
    const failed = await db.socialPost.findUniqueOrThrow({ where: { id: bad!.id } });
    assert.equal(failed.status, "FAILED");
    assert.match(failed.error ?? "", /rejected/);
    assert.ok(await db.notification.findFirst({ where: { organizationId: orgId, title: "Post failed" } }));

    const [stuck] = await schedulePosts(owner, { channelIds: [page!.id], text: "interrupted" });
    await db.socialPost.update({ where: { id: stuck!.id }, data: { status: "PUBLISHING" } });
    await publishPost(stuck!.id);
    const uncertain = await db.socialPost.findUniqueOrThrow({ where: { id: stuck!.id } });
    assert.equal(uncertain.status, "FAILED");
    assert.equal(uncertain.externalId, null);
    assert.match(uncertain.error ?? "", /interrupted/);
  });

  it("accepts deliveries signed by an agency's own Meta app, for that agency's numbers only", async () => {
    const other = await makeOrg({ plan: "INTERNAL" });
    const { user } = await makeUser();
    await addMember(user.id, other.id, "OWNER");
    const modules = ["SOCIAL_PUBLISHING", "CONTENT_STUDIO", "LEADS_CRM", "WHATSAPP_AI"] as const;
    await enableModules(other.id, [...modules]);
    const otherOwner: Principal = { userId: user.id, organizationId: other.id, role: "OWNER", extraPermissions: [], enabledModules: new Set(modules), mfa: true };
    const otherBrand = await db.brand.create({ data: { organizationId: other.id, name: `Own app ${uid()}`, slug: `own-${uid()}`, brandNumber: "BRD-0001" } });
    await saveGateway(other.id, "social", { appId: "own-app-1", appSecret: "own-app-secret", webhookVerifyToken: "own-verify-token" });

    const ownNumber = `sim-${uid()}`;
    const channel = await connectWhatsAppNumber(otherOwner, { brandId: otherBrand.id, phoneNumberId: ownNumber, accessToken: "simulated-token-not-a-secret" });
    assert.equal((channel.metadata as { appId?: string }).appId, "own-app-1", "the channel records which app issued its token");

    const post = (body: string, secret: string) =>
      postWebhook(new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", body, headers: { "x-hub-signature-256": signPayload(body, secret) } }), {
        params: Promise.resolve({}),
      });

    const ownBody = JSON.stringify(inbound(ownNumber, kenyanNumber(), "hello from the agency's own app"));
    assert.equal((await post(ownBody, "own-app-secret")).status, 200);

    // The agency's secret cannot vouch for a number another organisation owns.
    const foreignBody = JSON.stringify(inbound(phoneNumberId, kenyanNumber(), "spoofed"));
    assert.equal((await post(foreignBody, "own-app-secret")).status, 401);

    const handshake = await verifyWebhook(
      new Request("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=own-verify-token&hub.challenge=777"),
      { params: Promise.resolve({}) },
    );
    assert.equal(await handshake.text(), "777");
  });
});
