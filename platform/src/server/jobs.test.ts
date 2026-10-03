import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { backoffMs } from "./jobs";

describe("job backoff", () => {
  it("doubles from 15 s and caps at an hour", () => {
    assert.equal(backoffMs(1), 15_000);
    assert.equal(backoffMs(2), 30_000);
    assert.equal(backoffMs(3), 60_000);
    assert.equal(backoffMs(4), 120_000);
    assert.equal(backoffMs(20), 3_600_000);
  });
  it("never goes negative or below the base for a nonsense attempt count", () => {
    assert.equal(backoffMs(0), 15_000);
    assert.equal(backoffMs(-3), 15_000);
  });
});
