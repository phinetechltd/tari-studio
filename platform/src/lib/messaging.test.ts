import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { costMicros, parseChain, supportsEffort } from "./ai-models";
import {
  AutomationInputSchema,
  actionsAllowedFor,
  insideServiceWindow,
  messageMatches,
  renderTemplate,
} from "./automation-rules";
import { signPayload, verifyMetaSignature } from "./meta-signature";
import { formatPhone, toWhatsAppId } from "./phone";
import {
  deviceType,
  extractRefCode,
  isBotUserAgent,
  isShortCode,
  newShortCode,
  whatsAppLink,
  withUtm,
} from "./tracked-links";

describe("phone numbers", () => {
  it("normalises every Kenyan way of writing a number to one WhatsApp id", () => {
    for (const input of ["0712345678", "0712 345 678", "+254712345678", "254712345678", "712345678", "+254 712-345-678"]) {
      assert.equal(toWhatsAppId(input), "254712345678", input);
    }
    assert.equal(toWhatsAppId("0110123456"), "254110123456");
  });

  it("keeps international numbers and rejects nonsense", () => {
    assert.equal(toWhatsAppId("+44 7700 900123"), "447700900123");
    assert.equal(toWhatsAppId("0044 7700 900123"), "447700900123");
    assert.equal(toWhatsAppId("12345"), null);
    assert.equal(toWhatsAppId(""), null);
    assert.equal(toWhatsAppId("hello"), null);
  });

  it("formats for display", () => {
    assert.equal(formatPhone("254712345678"), "+254 712 345 678");
    assert.equal(formatPhone("447700900123"), "+447700900123");
  });
});

describe("Meta webhook signatures", () => {
  const body = '{"object":"whatsapp_business_account","entry":[]}';

  it("accepts the exact bytes Meta signed", () => {
    assert.ok(verifyMetaSignature(body, signPayload(body, "s3cret"), "s3cret"));
  });

  it("rejects a different body, a different secret, a missing header or a truncated signature", () => {
    const sig = signPayload(body, "s3cret");
    assert.equal(verifyMetaSignature(body + " ", sig, "s3cret"), false);
    assert.equal(verifyMetaSignature(body, sig, "other"), false);
    assert.equal(verifyMetaSignature(body, null, "s3cret"), false);
    assert.equal(verifyMetaSignature(body, sig.slice(0, -2), "s3cret"), false);
    assert.equal(verifyMetaSignature(body, sig, ""), false);
  });
});

describe("tracked links", () => {
  it("makes unambiguous codes", () => {
    for (let i = 0; i < 200; i++) {
      const code = newShortCode();
      assert.ok(isShortCode(code), code);
      assert.doesNotMatch(code, /[01ILO]/);
    }
  });

  it("round-trips the ref code through a wa.me link", () => {
    const link = whatsAppLink("254712345678", "Hi, I saw the offer", "K7M2QX9A");
    assert.match(link, /^https:\/\/wa\.me\/254712345678\?text=/);
    const text = decodeURIComponent(link.split("text=")[1]!);
    assert.equal(extractRefCode(text), "K7M2QX9A");
    assert.equal(extractRefCode("hello, ref: k7m2qx9a please"), "K7M2QX9A");
    assert.equal(extractRefCode("no code here"), null);
    assert.equal(extractRefCode("Ref: SHORT"), null);
  });

  it("adds UTM parameters to web links only, never overriding existing ones", () => {
    const out = new URL(withUtm("https://shop.example/p?utm_source=keep", { utm_source: "fb", utm_campaign: "launch" }));
    assert.equal(out.searchParams.get("utm_source"), "keep");
    assert.equal(out.searchParams.get("utm_campaign"), "launch");
    assert.equal(withUtm("https://wa.me/254700000000?text=hi", { utm_source: "x" }), "https://wa.me/254700000000?text=hi");
    assert.equal(withUtm("not a url", { utm_source: "x" }), "not a url");
  });

  it("does not count link-preview fetchers as clicks", () => {
    assert.ok(isBotUserAgent("WhatsApp/2.23.20.0 A"));
    assert.ok(isBotUserAgent("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"));
    assert.ok(isBotUserAgent("TelegramBot (like TwitterBot)"));
    assert.ok(isBotUserAgent(""));
    assert.ok(isBotUserAgent(null));
    assert.equal(
      isBotUserAgent("Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36"),
      false,
    );
    assert.equal(deviceType("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "mobile");
    assert.equal(deviceType("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
    assert.equal(deviceType("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "desktop");
  });
});

describe("automation rules", () => {
  it("matches keywords as whole words in any case", () => {
    const c = { match: "keywords" as const, keywords: ["price", "bei"] };
    assert.ok(messageMatches(c, "What is the PRICE?"));
    assert.ok(messageMatches(c, "bei gani"));
    assert.equal(messageMatches(c, "priceless"), false);
    assert.equal(messageMatches(c, null), false);
    assert.ok(messageMatches({ match: "any", keywords: [] }, null));
  });

  it("fills template variables with first names and safe defaults", () => {
    assert.equal(renderTemplate("Hi {{name}}, thanks for writing to {{brand}}.", { name: "Amina Otieno", brand: "Tari" }), "Hi Amina, thanks for writing to Tari.");
    assert.equal(renderTemplate("Hi {{ name }}!", { name: null }), "Hi there!");
    assert.equal(renderTemplate("Keep {{unknown}}", {}), "Keep {{unknown}}");
  });

  it("refuses reply actions on post events, empty keyword lists and double replies", () => {
    assert.deepEqual(actionsAllowedFor("POST_FAILED"), ["NOTIFY_TEAM"]);
    const bad = AutomationInputSchema.safeParse({
      name: "x1",
      trigger: "POST_FAILED",
      actions: [{ type: "SEND_REPLY", text: "hi" }],
    });
    assert.equal(bad.success, false);
    const noKeywords = AutomationInputSchema.safeParse({
      name: "x2",
      trigger: "MESSAGE_RECEIVED",
      conditions: { match: "keywords", keywords: [] },
      actions: [{ type: "SEND_REPLY", text: "hi" }],
    });
    assert.equal(noKeywords.success, false);
    const twoReplies = AutomationInputSchema.safeParse({
      name: "x3",
      trigger: "MESSAGE_RECEIVED",
      actions: [
        { type: "SEND_REPLY", text: "hi" },
        { type: "AI_REPLY" },
      ],
    });
    assert.equal(twoReplies.success, false);
    const good = AutomationInputSchema.parse({
      name: "Welcome",
      trigger: "LEAD_CREATED",
      actions: [{ type: "SEND_REPLY", text: "Karibu {{name}}!" }, { type: "NOTIFY_TEAM", message: "New lead" }],
    });
    assert.equal(good.enabled, true);
    assert.equal(good.brandId, null);
  });

  it("knows the 24-hour customer-service window", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    assert.ok(insideServiceWindow(new Date("2026-09-26T12:30:00Z"), now));
    assert.equal(insideServiceWindow(new Date("2026-09-26T11:59:00Z"), now), false);
    assert.equal(insideServiceWindow(null, now), false);
  });
});

describe("AI models", () => {
  it("prices calls from the provider's own token counts", () => {
    // Sonnet 5: US$2 in / US$10 out per million tokens → 2 and 10 micro-dollars a token.
    assert.equal(costMicros("claude-sonnet-5", { inputTokens: 1000, outputTokens: 500 }), 7000);
    assert.equal(costMicros("claude-haiku-4-5", { inputTokens: 1000, outputTokens: 500 }), 3500);
    assert.equal(costMicros("claude-sonnet-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1000 }), 200);
    assert.equal(costMicros("some/self-hosted", { inputTokens: 1000, outputTokens: 1000 }), 0);
  });

  it("sends an effort level only to models that accept one", () => {
    assert.ok(supportsEffort("claude-sonnet-5"));
    assert.equal(supportsEffort("claude-haiku-4-5"), false);
  });

  it("parses the fallback chain and falls back to the single provider", () => {
    assert.deepEqual(parseChain("anthropic:claude-sonnet-5, nvidia:moonshotai/kimi-k3 ,fixtures", "anthropic"), [
      { provider: "anthropic", model: "claude-sonnet-5" },
      { provider: "nvidia", model: "moonshotai/kimi-k3" },
      { provider: "fixtures", model: undefined },
    ]);
    assert.deepEqual(parseChain("", "anthropic"), [{ provider: "anthropic" }]);
    assert.deepEqual(parseChain("bogus:x", "fixtures"), [{ provider: "fixtures" }]);
  });
});
