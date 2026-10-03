import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVENTS, eventSpec, eventsFor, policyAllows, resolvedPolicy, shouldSend } from "./notification-events";

describe("notification events", () => {
  it("have unique keys, and every event shows in the app by default", () => {
    const keys = EVENTS.map((e) => e.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const e of EVENTS) assert.equal(e.defaults.IN_APP, true, e.key);
  });

  it("send SMS by default only for the urgent events", () => {
    const sms = EVENTS.filter((e) => e.defaults.SMS).map((e) => e.key).sort();
    assert.deepEqual(sms, ["ai.credits_low", "ai.provider_out_of_credits", "billing.renewal_failed", "credits.empty", "plan.ending"]);
    for (const key of sms) assert.equal(eventSpec(key)!.essential, true, `${key} is urgent, so essential`);
  });

  it("take the admin's policy over the defaults, per channel", () => {
    assert.equal(policyAllows({}, "order.paid", "EMAIL"), true);
    assert.equal(policyAllows({ "order.paid": { EMAIL: false } }, "order.paid", "EMAIL"), false);
    assert.equal(policyAllows({ "order.paid": { SMS: true } }, "order.paid", "SMS"), true);
    assert.equal(policyAllows({}, "no.such.event", "IN_APP"), false);
    const matrix = resolvedPolicy({ "plan.ending": { SMS: false } });
    assert.equal(matrix["plan.ending"]!.SMS, false);
    assert.equal(matrix["plan.ending"]!.EMAIL, true);
  });

  it("let people opt out of ordinary events but not essential ones", () => {
    assert.deepEqual(shouldSend({}, "order.paid", "EMAIL", false), { send: false, reason: "opted_out" });
    assert.deepEqual(shouldSend({}, "order.paid", "EMAIL", undefined), { send: true });
    assert.deepEqual(shouldSend({}, "billing.renewal_failed", "SMS", false), { send: true }, "essential ignores the opt-out");
    assert.deepEqual(shouldSend({ "billing.renewal_failed": { SMS: false } }, "billing.renewal_failed", "SMS", true), { send: false, reason: "policy" }, "but an admin can switch the channel off");
    assert.deepEqual(shouldSend({}, "order.paid", "IN_APP", false), { send: true }, "in-app is never opted out of");
  });

  it("show people only the events their role receives", () => {
    const marketer = eventsFor({ platformAdmin: false, roles: ["MARKETER"] }).map((e) => e.key);
    assert.ok(marketer.includes("automation.notify"));
    assert.ok(!marketer.includes("billing.renewal_failed"));
    assert.ok(!marketer.includes("ai.credits_low"));
    const owner = eventsFor({ platformAdmin: false, roles: ["OWNER"] }).map((e) => e.key);
    assert.ok(owner.includes("billing.renewal_failed") && owner.includes("order.paid"));
    const admin = eventsFor({ platformAdmin: true, roles: [] }).map((e) => e.key);
    assert.ok(admin.includes("ai.credits_low") && !admin.includes("order.paid"));
  });
});
