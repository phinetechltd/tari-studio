import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";

import { mapStatus, newReference, verdictFrom, verifyPaystackSignature } from "./paystack";

describe("paystack", () => {
  it("accepts only Paystack's HMAC-SHA512 of the exact raw body", () => {
    const secret = "sk_test_unit";
    const body = JSON.stringify({ event: "charge.success", data: { reference: "PLAN-ABC" } });
    const signature = crypto.createHmac("sha512", secret).update(body).digest("hex");
    assert.equal(verifyPaystackSignature(body, signature, secret), true);
    assert.equal(verifyPaystackSignature(body, signature.toUpperCase(), secret), true, "hex case does not matter");
    assert.equal(verifyPaystackSignature(body + " ", signature, secret), false, "a changed body fails");
    assert.equal(verifyPaystackSignature(body, signature, "sk_test_other"), false, "another key fails");
    assert.equal(verifyPaystackSignature(body, null, secret), false);
    assert.equal(verifyPaystackSignature(body, signature, undefined), false, "no key configured fails closed");
  });

  it("maps Paystack statuses; abandoned checkouts keep waiting", () => {
    assert.equal(mapStatus("success"), "SUCCEEDED");
    assert.equal(mapStatus("failed"), "FAILED");
    assert.equal(mapStatus("reversed"), "FAILED");
    assert.equal(mapStatus("abandoned"), "PENDING");
    assert.equal(mapStatus("ongoing"), "PENDING");
    assert.equal(mapStatus(undefined), "PENDING");
  });

  it("reads the amount, channel and a reusable card from a verify response", () => {
    const v = verdictFrom({
      id: 4099260516,
      status: "success",
      amount: 495000,
      currency: "KES",
      channel: "card",
      authorization: { authorization_code: "AUTH_x", reusable: true, last4: "4081", brand: "visa" },
    });
    assert.equal(v.status, "SUCCEEDED");
    assert.equal(v.amountCents, 495000);
    assert.equal(v.currency, "KES");
    assert.deepEqual(v.authorization, { code: "AUTH_x", reusable: true, label: "Visa •••• 4081" });
    assert.equal(v.receiptRef, "4099260516");
  });

  it("makes references Paystack accepts", () => {
    const ref = newReference("plan");
    assert.match(ref, /^PLAN-[A-Z0-9]+-[A-F0-9]{12}$/);
    assert.notEqual(newReference("plan"), ref);
  });
});
