import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatKES, formatMoney, fromCents, sumCents, toCents } from "./money";

describe("money", () => {
  it("converts between whole units and cents without float drift", () => {
    assert.equal(toCents(19.99), 1999);
    assert.equal(toCents(0.1 + 0.2), 30);
    assert.equal(fromCents(1999), 19.99);
  });

  it("formats in the brand's currency", () => {
    assert.equal(formatKES(21_450_000), "KES 214,500");
    assert.equal(formatMoney(150_000, "USD"), "USD 1,500");
    assert.equal(formatMoney(150_050, "KES", { decimals: true }), "KES 1,500.50");
  });

  it("sums cents and refuses a fractional value", () => {
    assert.equal(sumCents([100, 250, 1]), 351);
    assert.equal(sumCents([]), 0);
    assert.throws(() => sumCents([100, 0.5]));
    assert.throws(() => sumCents([Number.NaN]));
  });
});
