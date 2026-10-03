import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { kenyanMsisdn, maskMsisdn, parseBongaResponse, smsParts, smsText } from "./sms";

describe("SMS helpers", () => {
  it("accept Kenyan mobile numbers in every common form, and nothing else", () => {
    for (const raw of ["0712345678", "0712 345 678", "+254712345678", "254712345678", "712345678", "0110 123 456"]) {
      assert.match(kenyanMsisdn(raw)!, /^254[17]\d{8}$/, raw);
    }
    assert.equal(kenyanMsisdn("0712345678"), "254712345678");
    assert.equal(kenyanMsisdn("0110123456"), "254110123456");
    for (const raw of ["", null, undefined, "12345", "+447700900123", "0201234567", "not a phone"]) assert.equal(kenyanMsisdn(raw), null, String(raw));
  });

  it("mask numbers for logs", () => {
    assert.equal(maskMsisdn("254712345678"), "2547•••••678");
  });

  it("read a Bonga reply: only status 222 is success, whatever the HTTP code", () => {
    assert.deepEqual(parseBongaResponse({ status: 222, status_message: "Message queued", unique_id: 9981 }), { ok: true, reference: "9981", message: "Message queued" });
    assert.deepEqual(parseBongaResponse({ status: "222", unique_id: "ab1" }), { ok: true, reference: "ab1", message: "Bonga status 222" });
    const low = parseBongaResponse({ status: 666, status_message: "Insufficient credit" });
    assert.equal(low.ok, false);
    assert.equal(low.message, "Insufficient credit");
    assert.equal(parseBongaResponse(null).ok, false);
    assert.equal(parseBongaResponse("<html>").ok, false);
  });

  it("count message parts and keep texts to two parts", () => {
    assert.equal(smsParts("a".repeat(160)), 1);
    assert.equal(smsParts("a".repeat(161)), 2);
    assert.equal(smsParts("Habari 😀"), 1);
    assert.equal(smsParts("😀".repeat(40)), 2, "emoji force the shorter 70/67 parts");
    const text = smsText("Your plan ends on 6 October", "x".repeat(400), "Studio");
    assert.ok(text.length <= 306);
    assert.ok(text.startsWith("Studio: Your plan ends on 6 October. "));
  });
});
