import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  annualSavingCents,
  creditsBuy,
  creditsToCents,
  DEFAULT_CONVERSION,
  DEFAULT_PRICING as P,
  defaultPricingInput,
  EXTRAS,
  imageCreditsFor,
  kesCentsFromUsd,
  LEGACY_IMAGE_TOKEN_CREDITS,
  LEGACY_VIDEO_TOKEN_CREDITS,
  maxAnnualSavingPercent,
  planPriceCents,
  PricingError,
  quoteCreditOrder,
  recalculateFromUsd,
  resolvePricing,
  videoCreditsFor,
} from "./pricing";

const KES = (n: number) => n * 100;

describe("pricing", () => {
  it("converts Higgsfield's dollars at KES 130 plus 30%, rounded up to KES 50", () => {
    assert.equal(kesCentsFromUsd(9), KES(1550)); // 9 x 130 x 1.3 = 1,521
    assert.equal(kesCentsFromUsd(23), KES(3900)); // 3,887
    assert.equal(kesCentsFromUsd(29), KES(4950)); // 4,901
    assert.equal(kesCentsFromUsd(59), KES(10000)); // 9,971
    assert.equal(kesCentsFromUsd(79), KES(13400)); // 13,351
    assert.equal(kesCentsFromUsd(0), 0);
    assert.equal(kesCentsFromUsd(9, { usdToKes: 100, margin: 0, roundToKes: 10 }), KES(900));
  });

  it("pins the default plan prices the owner approved", () => {
    assert.deepEqual(
      Object.values(P.plans).map((p) => [p.key, p.monthlyCents / 100, p.annualPerMonthCents / 100, p.creditsPerMonth, p.parallel]),
      [
        ["FREE", 0, 0, 0, 1],
        ["BASIC", 1550, 1550, 120, 2],
        ["PRO", 4950, 3900, 600, 3],
        ["MAX", 13400, 10000, 1800, 8],
      ],
    );
    assert.equal(planPriceCents(P, "PRO", "ANNUAL"), KES(46_800));
    assert.equal(planPriceCents(P, "MAX", "MONTHLY"), KES(13_400));
    assert.equal(annualSavingCents(P, "PRO"), KES(12_600));
    assert.equal(annualSavingCents(P, "BASIC"), 0);
    assert.equal(maxAnnualSavingPercent(P), 25);
  });

  it("charges 2 credits an image and 22 per started 5 seconds of video by default", () => {
    assert.equal(imageCreditsFor(P, 1), 2);
    assert.equal(imageCreditsFor(P, 5), 10);
    assert.equal(videoCreditsFor(P, 4), 22);
    assert.equal(videoCreditsFor(P, 5), 22);
    assert.equal(videoCreditsFor(P, 6), 44);
    assert.equal(videoCreditsFor(P, 10), 44);
    assert.equal(videoCreditsFor(P, 30), 132);
    assert.throws(() => videoCreditsFor(P, 3), PricingError);
    assert.throws(() => videoCreditsFor(P, 31), PricingError);
    assert.throws(() => videoCreditsFor(P, 7.5), PricingError);
    assert.throws(() => imageCreditsFor(P, 0), PricingError);
  });

  it("says what a month of credits buys, as the plan cards show it", () => {
    assert.deepEqual(creditsBuy(P, 120), { images: 60, videos5s: 5 });
    assert.deepEqual(creditsBuy(P, 600), { images: 300, videos5s: 27 });
    assert.deepEqual(creditsBuy(P, 1800), { images: 900, videos5s: 81 });
  });

  it("prices top-ups at Higgsfield's one-time rate, and the smallest pack sets a credit's value", () => {
    assert.deepEqual(
      P.packs.map((p) => [p.key, p.credits, p.cents / 100]),
      [
        ["PACK_40", 40, 550],
        ["PACK_200", 200, 2550],
        ["PACK_1000", 1000, 12700],
      ],
    );
    assert.equal(P.creditValueCents, 1375); // KES 13.75 a credit
    assert.equal(creditsToCents(P, 2), KES(28)); // 27.50 rounded up
    assert.equal(creditsToCents(P, 44), KES(605));
  });

  it("follows an admin's price list everywhere", () => {
    const input = defaultPricingInput();
    input.imageCredits = 3;
    input.videoCreditsPerStep = 10;
    input.plans.PRO = { ...input.plans.PRO, monthlyCents: KES(6000), annualPerMonthCents: KES(4500), creditsPerMonth: 900 };
    input.packs = [{ credits: 500, cents: KES(5000) }, { credits: 100, cents: KES(1200) }];
    const custom = resolvePricing(input);
    assert.equal(planPriceCents(custom, "PRO", "ANNUAL"), KES(54_000));
    assert.equal(videoCreditsFor(custom, 10), 20);
    assert.deepEqual(custom.packs.map((p) => p.credits), [100, 500], "packs are sorted, smallest first");
    assert.equal(custom.creditValueCents, 1200, "the smallest pack's rate: KES 12 a credit");
    assert.deepEqual(quoteCreditOrder(custom, { kind: "IMAGE", images: 2 }), { images: 2, videoSeconds: 0, credits: 6, amountCents: KES(72) });
  });

  it("recalculates plan and pack prices from dollars, keeping credits", () => {
    const base = defaultPricingInput();
    base.plans.BASIC.creditsPerMonth = 150;
    const next = recalculateFromUsd(base, { usdToKes: 140, margin: 0.5, roundToKes: 100 });
    assert.equal(next.plans.BASIC.monthlyCents, KES(1900)); // 9 x 140 x 1.5 = 1,890
    assert.equal(next.plans.BASIC.creditsPerMonth, 150);
    assert.equal(next.packs[0]!.cents, KES(700)); // 3 x 140 x 1.5 = 630
    assert.deepEqual(defaultPricingInput().conversion, DEFAULT_CONVERSION);
  });

  it("keeps the historical token conversion", () => {
    assert.equal(LEGACY_IMAGE_TOKEN_CREDITS, 8);
    assert.equal(LEGACY_VIDEO_TOKEN_CREDITS, 73);
  });

  it("quotes done-for-you orders as their credits at the pay-as-you-go rate", () => {
    assert.deepEqual(quoteCreditOrder(P, { kind: "IMAGE", images: 3 }), { images: 3, videoSeconds: 0, credits: 6, amountCents: KES(83) });
    assert.deepEqual(quoteCreditOrder(P, { kind: "VIDEO", seconds: 15 }), { images: 0, videoSeconds: 15, credits: 66, amountCents: KES(908) });
    assert.throws(() => quoteCreditOrder(P, { kind: "IMAGE", images: 0 }), PricingError);
    assert.throws(() => quoteCreditOrder(P, { kind: "IMAGE", images: 21 }), PricingError);
  });

  it("never invents a price for extras", () => {
    for (const x of EXTRAS) assert.equal(x.priceCents, null);
  });
});

describe("pricing: every length, count and rate stays whole and monotonic", () => {
  it("charges per started 5 seconds, never less for longer, for every length from 4 to 30 s", () => {
    let last = 0;
    for (let s = 4; s <= 30; s++) {
      const credits = videoCreditsFor(P, s);
      assert.equal(credits, Math.ceil(s / 5) * P.videoCreditsPerStep, `${s} s`);
      assert.ok(credits >= last, `${s} s costs at least as much as ${s - 1} s`);
      last = credits;
    }
    assert.equal(videoCreditsFor(P, 5), videoCreditsFor(P, 4), "4 s and 5 s are one step");
    assert.equal(videoCreditsFor(P, 6), 2 * P.videoCreditsPerStep, "the 6th second starts a second step");
  });

  it("prices every order from 1 to 20 images and every clip in whole shillings", () => {
    for (let n = 1; n <= 20; n++) {
      const q = quoteCreditOrder(P, { kind: "IMAGE", images: n });
      assert.equal(q.credits, n * P.imageCredits);
      assert.equal(q.amountCents % 100, 0, `${n} images: whole shillings`);
      assert.ok(q.amountCents >= (q.credits * P.creditValueCents) - 1e-6, "never rounds below the credits' value");
    }
    for (let s = 4; s <= 30; s++) {
      const q = quoteCreditOrder(P, { kind: "VIDEO", seconds: s });
      assert.equal(q.amountCents % 100, 0, `${s} s: whole shillings`);
    }
  });

  it("refuses counts and lengths outside the range, and fractions", () => {
    assert.throws(() => quoteCreditOrder(P, { kind: "IMAGE", images: 0 }), PricingError);
    assert.throws(() => quoteCreditOrder(P, { kind: "IMAGE", images: 21 }), PricingError);
    assert.throws(() => quoteCreditOrder(P, { kind: "IMAGE", images: 1.5 }), PricingError);
    assert.throws(() => quoteCreditOrder(P, { kind: "VIDEO", seconds: 3 }), PricingError);
    assert.throws(() => quoteCreditOrder(P, { kind: "VIDEO", seconds: 31 }), PricingError);
  });

  it("rounds a converted price up to the step, whatever the rate or margin", () => {
    const rates = [1, 99.5, 129.99, 130, 131.01, 250, 1000];
    const margins = [0, 0.05, 0.3, 1];
    const steps = [10, 50, 100];
    for (const usdToKes of rates) {
      for (const margin of margins) {
        for (const roundToKes of steps) {
          for (const usd of [0.5, 3, 9, 23, 99.99]) {
            const cents = kesCentsFromUsd(usd, { usdToKes, margin, roundToKes });
            const exact = usd * usdToKes * (1 + margin);
            assert.equal(cents % (roundToKes * 100), 0, "a multiple of the step");
            assert.ok(cents / 100 >= exact - 1e-6, `never below the exact price (${usd} x ${usdToKes} x ${1 + margin})`);
            assert.ok(cents / 100 < exact + roundToKes + 1e-6, "and never a whole step above it");
          }
        }
      }
    }
  });

  it("converts credits to shillings without ever undercharging a fraction of a shilling", () => {
    for (const credits of [1, 2, 3, 22, 44, 66, 110, 599, 600, 1800]) {
      const cents = creditsToCents(P, credits);
      assert.equal(cents % 100, 0);
      assert.ok(cents >= credits * P.creditValueCents - 1e-6);
      assert.ok(cents - credits * P.creditValueCents < 100, "at most one shilling of rounding");
    }
  });
});
