import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LIMIT_KEYS,
  LimitReachedError,
  PLAN_DEFAULTS,
  PLAN_KEYS,
  assertWithinLimit,
  effectiveLimits,
} from "./limits";

describe("limits", () => {
  it("every plan defines every limit", () => {
    for (const plan of PLAN_KEYS) {
      for (const key of LIMIT_KEYS) assert.ok(key in PLAN_DEFAULTS[plan], `${plan}.${key}`);
    }
  });

  it("higher plans never have lower finite limits than the plan below", () => {
    const order = ["TRIAL", "STARTER", "GROWTH", "PRO"] as const;
    for (const key of LIMIT_KEYS) {
      for (let i = 1; i < order.length; i++) {
        const lo = PLAN_DEFAULTS[order[i - 1]!][key]!;
        const hi = PLAN_DEFAULTS[order[i]!][key]!;
        assert.ok(hi >= lo, `${key}: ${order[i]} (${hi}) < ${order[i - 1]} (${lo})`);
      }
    }
  });

  it("INTERNAL is unlimited", () => {
    for (const key of LIMIT_KEYS) assert.equal(PLAN_DEFAULTS.INTERNAL[key], null);
  });

  it("applies overrides on top of the plan and ignores junk", () => {
    const l = effectiveLimits("STARTER", {
      brands: 12,
      seats: null,
      storageMb: -5,
      aiCreditsMicros: "lots",
      notALimit: 99,
    });
    assert.equal(l.brands, 12);
    assert.equal(l.seats, null, "null override means unlimited");
    assert.equal(l.storageMb, PLAN_DEFAULTS.STARTER.storageMb, "negative override ignored");
    assert.equal(l.aiCreditsMicros, PLAN_DEFAULTS.STARTER.aiCreditsMicros, "non-numeric override ignored");
    assert.ok(!("notALimit" in l));
  });

  it("falls back to the most restrictive plan for an unknown plan name", () => {
    assert.deepEqual(effectiveLimits("BOGUS", null), PLAN_DEFAULTS.TRIAL);
    assert.deepEqual(effectiveLimits("STARTER", undefined), PLAN_DEFAULTS.STARTER);
  });

  it("does not let an override mutate the shared defaults", () => {
    const before = PLAN_DEFAULTS.TRIAL.brands;
    effectiveLimits("TRIAL", { brands: 500 });
    assert.equal(PLAN_DEFAULTS.TRIAL.brands, before);
  });

  it("assertWithinLimit allows up to the limit and refuses beyond it", () => {
    const limits = effectiveLimits("TRIAL", { seats: 3 });
    assert.doesNotThrow(() => assertWithinLimit(limits, "seats", 2));
    assert.throws(() => assertWithinLimit(limits, "seats", 3), LimitReachedError);
    assert.throws(() => assertWithinLimit(limits, "seats", 1, 3), LimitReachedError);
    assert.doesNotThrow(() => assertWithinLimit(limits, "seats", 1, 2));
  });

  it("unlimited never throws", () => {
    assert.doesNotThrow(() => assertWithinLimit(PLAN_DEFAULTS.INTERNAL, "brands", 1_000_000));
  });

  it("a limit of zero blocks everything", () => {
    const l = effectiveLimits("TRIAL", { connectedAccounts: 0 });
    assert.throws(() => assertWithinLimit(l, "connectedAccounts", 0), LimitReachedError);
  });
});
