import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { darajaTimestamp, describeResult, parseStkCallback, stkPassword, toDarajaMsisdn } from "./daraja";
import { simulatorProvider, SIMULATOR_CANCEL_PHONE } from "./simulator";

describe("daraja formats", () => {
  it("stamps time in Nairobi (UTC+3) as YYYYMMDDHHmmss", () => {
    assert.equal(darajaTimestamp(new Date("2026-09-25T21:30:05Z")), "20260926003005");
    assert.equal(darajaTimestamp(new Date("2026-01-01T00:00:00Z")), "20260101030000");
  });

  it("accepts Kenyan mobile numbers in any common form and nothing else", () => {
    assert.equal(toDarajaMsisdn("0712 345 678"), "254712345678");
    assert.equal(toDarajaMsisdn("+254 712 345 678"), "254712345678");
    assert.equal(toDarajaMsisdn("712345678"), "254712345678");
    assert.equal(toDarajaMsisdn("0110 123 456"), "254110123456");
    assert.equal(toDarajaMsisdn("+44 7700 900123"), null);
    assert.equal(toDarajaMsisdn("12345"), null);
  });

  it("builds the STK password as base64(shortcode + passkey + timestamp)", () => {
    assert.equal(stkPassword("174379", "key", "20260101030000"), Buffer.from("174379key20260101030000").toString("base64"));
  });

  it("parses a successful callback", () => {
    const parsed = parseStkCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: "29115-34620561-1",
          CheckoutRequestID: "ws_CO_191220191020363925",
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 100 },
              { Name: "MpesaReceiptNumber", Value: "NLJ7RT61SV" },
              { Name: "TransactionDate", Value: 20191219102115 },
              { Name: "PhoneNumber", Value: 254708374149 },
            ],
          },
        },
      },
    });
    assert.deepEqual(parsed, {
      checkoutRequestId: "ws_CO_191220191020363925",
      merchantRequestId: "29115-34620561-1",
      resultCode: "0",
      resultDesc: "The service request is processed successfully.",
      receipt: "NLJ7RT61SV",
      amount: 100,
      phone: "254708374149",
    });
  });

  it("parses a cancelled callback, which has no metadata", () => {
    const parsed = parseStkCallback({
      Body: { stkCallback: { CheckoutRequestID: "ws_CO_1", ResultCode: 1032, ResultDesc: "Request cancelled by user" } },
    });
    assert.equal(parsed?.resultCode, "1032");
    assert.equal(parsed?.receipt, null);
  });

  it("rejects bodies that are not callbacks", () => {
    assert.equal(parseStkCallback(null), null);
    assert.equal(parseStkCallback({}), null);
    assert.equal(parseStkCallback({ Body: { stkCallback: { ResultCode: 0 } } }), null);
  });

  it("explains common failures in plain words", () => {
    assert.match(describeResult("1032"), /cancelled/);
    assert.match(describeResult("1"), /balance/);
    assert.equal(describeResult("9999", "Something odd"), "Something odd");
  });
});

describe("simulator", () => {
  it("stays pending until the PIN delay passes, then settles", async () => {
    const sim = simulatorProvider(1000);
    const start = await sim.initiate({
      amountCents: 10_000,
      phone: "254712345678",
      reference: "ORD-0001",
      description: "Images",
      callbackUrl: "http://localhost/cb",
    });
    assert.equal(start.ok, true);
    const now = new Date();
    assert.equal((await sim.verify({ providerRef: start.providerRef!, phone: "254712345678", createdAt: now })).status, "PENDING");
    const past = new Date(Date.now() - 2000);
    const done = await sim.verify({ providerRef: start.providerRef!, phone: "254712345678", createdAt: past });
    assert.equal(done.status, "SUCCEEDED");
    assert.ok(done.receiptRef);
  });

  it("simulates a cancelled prompt", async () => {
    const sim = simulatorProvider(0);
    const result = await sim.verify({ providerRef: "x", phone: SIMULATOR_CANCEL_PHONE, createdAt: new Date(0) });
    assert.equal(result.status, "FAILED");
    assert.equal(result.resultCode, "1032");
  });
});
