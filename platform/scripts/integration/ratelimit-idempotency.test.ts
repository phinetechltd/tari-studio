import assert from "node:assert/strict";
import { describe, it, after } from "node:test";

import { db } from "@/lib/db";
import { claim, priorResponse, recordResponse } from "@/lib/idempotency";
import { hit, pruneBuckets } from "@/lib/ratelimit";

import { uid } from "./_helpers";

describe("rate limiting", () => {
  after(() => db.$disconnect());

  it("allows up to the limit within a window, then refuses", async () => {
    const key = `rl.${uid()}`;
    const now = Date.UTC(2026, 8, 21, 12, 0, 10);
    const opts = { limit: 3, windowSec: 60 };

    for (let i = 1; i <= 3; i++) {
      const r = await hit(key, opts, now);
      assert.equal(r.allowed, true, `hit ${i}`);
      assert.equal(r.remaining, 3 - i);
    }
    const blocked = await hit(key, opts, now);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.retryAfterSec, 50, "10 s into a 60 s window leaves 50 s");
  });

  it("starts a fresh count in the next window", async () => {
    const key = `rl.${uid()}`;
    const t = Date.UTC(2026, 8, 21, 12, 0, 10);
    const opts = { limit: 1, windowSec: 60 };
    assert.equal((await hit(key, opts, t)).allowed, true);
    assert.equal((await hit(key, opts, t)).allowed, false);
    assert.equal((await hit(key, opts, t + 60_000)).allowed, true);
  });

  it("counts each identity separately", async () => {
    const t = Date.UTC(2026, 8, 21, 12, 0, 10);
    const opts = { limit: 1, windowSec: 60 };
    assert.equal((await hit(`rl.${uid()}`, opts, t)).allowed, true);
    assert.equal((await hit(`rl.${uid()}`, opts, t)).allowed, true);
  });

  it("counts atomically when many requests arrive at once", async () => {
    const key = `rl.${uid()}`;
    const t = Date.now();
    const results = await Promise.all(Array.from({ length: 30 }, () => hit(key, { limit: 10, windowSec: 3600 }, t)));
    assert.equal(results.filter((r) => r.allowed).length, 10, "exactly the limit may pass");
  });

  it("prunes windows that are too old to matter", async () => {
    const key = `rl.${uid()}`;
    await hit(key, { limit: 5, windowSec: 60 }, Date.now() - 3 * 86_400_000);
    assert.ok((await pruneBuckets()) >= 1);
    assert.equal(await db.rateLimitBucket.count({ where: { key } }), 0);
  });
});

describe("idempotency", () => {
  it("lets exactly one caller win a key", async () => {
    const key = `test:${uid()}`;
    assert.equal(await claim(key, "system", "test"), true);
    assert.equal(await claim(key, "system", "test"), false);
  });

  it("lets exactly one of many simultaneous callers win", async () => {
    const key = `test:${uid()}`;
    const wins = await Promise.all(Array.from({ length: 12 }, () => claim(key, "system", "test")));
    assert.equal(wins.filter(Boolean).length, 1);
  });

  it("remembers the recorded response for a later duplicate", async () => {
    const key = `test:${uid()}`;
    assert.equal(await priorResponse(key), null);
    await claim(key, "system", "test");
    await recordResponse(key, { postId: "123" });
    assert.deepEqual(await priorResponse(key), { postId: "123" });
  });
});
