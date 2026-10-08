import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";

import { actionsAllowedFor, AutomationInputSchema } from "./automation-rules";
import { chunkPlan, describeTikTokFailure, tikTokOptionsSchema } from "./tiktok";
import { verifyTikTokSignature } from "./tiktok-signature";

const MB = 1024 * 1024;

describe("TikTok helpers", () => {
  it("accepts a correctly signed, fresh webhook and nothing else", () => {
    const secret = "client-secret";
    const body = JSON.stringify({ event: "authorization.removed", user_openid: "abc" });
    const t = 1_791_000_000;
    const s = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    assert.equal(verifyTikTokSignature(`t=${t},s=${s}`, body, secret, t + 10), true);
    assert.equal(verifyTikTokSignature(`t=${t},s=${s}`, body + " ", secret, t + 10), false, "tampered body");
    assert.equal(verifyTikTokSignature(`t=${t},s=${s}`, body, "other-secret", t + 10), false, "wrong secret");
    assert.equal(verifyTikTokSignature(`t=${t},s=${s}`, body, secret, t + 3600), false, "replayed an hour later");
    assert.equal(verifyTikTokSignature(null, body, secret), false);
    assert.equal(verifyTikTokSignature(`t=${t},s=nothex!`, body, secret, t), false);
    assert.equal(verifyTikTokSignature(`t=${t},s=${s}`, body, "", t), false, "no secret configured");
  });

  it("uploads small files in one chunk and large ones in 10 MB chunks, the last taking the rest", () => {
    assert.deepEqual(chunkPlan(5 * MB), { chunkSize: 5 * MB, count: 1, ranges: [{ start: 0, end: 5 * MB - 1 }] });
    const big = chunkPlan(95 * MB + 123);
    assert.equal(big.chunkSize, 10 * MB);
    assert.equal(big.count, 9);
    assert.equal(big.ranges[0]!.start, 0);
    assert.equal(big.ranges.at(-1)!.end, 95 * MB + 122);
    assert.equal(big.ranges.reduce((n, r) => n + (r.end - r.start + 1), 0), 95 * MB + 123, "every byte once");
    assert.throws(() => chunkPlan(0));
  });

  it("requires a privacy choice and starts interactions off", () => {
    assert.equal(tikTokOptionsSchema.safeParse({}).success, false);
    const ok = tikTokOptionsSchema.parse({ privacyLevel: "SELF_ONLY" });
    assert.deepEqual(ok, { privacyLevel: "SELF_ONLY", allowComments: false, allowDuet: false, allowStitch: false, brandedContent: false, yourBrand: false });
    assert.equal(tikTokOptionsSchema.safeParse({ privacyLevel: "EVERYONE" }).success, false);
  });

  it("explains TikTok's refusals in plain words", () => {
    assert.match(describeTikTokFailure("unaudited_client_can_only_post_to_private_accounts"), /not been audited/);
    assert.match(describeTikTokFailure("spam_risk_too_many_posts"), /too often/);
    assert.match(describeTikTokFailure(null), /refused/);
  });

  it("lets TikTok comments be answered and alerted on, but not staged or tagged", () => {
    assert.deepEqual(actionsAllowedFor("COMMENT_RECEIVED").sort(), ["AI_REPLY", "NOTIFY_TEAM", "SEND_REPLY"]);
    const bad = AutomationInputSchema.safeParse({ name: "x", trigger: "COMMENT_RECEIVED", actions: [{ type: "ADD_TAG", tag: "lead" }] });
    assert.equal(bad.success, false);
    const good = AutomationInputSchema.safeParse({
      name: "Price questions",
      trigger: "COMMENT_RECEIVED",
      conditions: { match: "keywords", keywords: ["price", "bei"] },
      actions: [{ type: "AI_REPLY", instructions: "" }, { type: "NOTIFY_TEAM", message: "Price question on TikTok" }],
    });
    assert.equal(good.success, true);
  });
});
