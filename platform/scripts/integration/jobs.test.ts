import assert from "node:assert/strict";
import { describe, it, after } from "node:test";

import { db } from "@/lib/db";
import { claimNext, complete, enqueue, fail, reapStale } from "@/server/jobs";

import { uid } from "./_helpers";

/** Each test uses its own job type, so claims can never pick up another test's rows. */
const freshType = () => `test.${uid()}`;

describe("job queue", () => {
  after(() => db.$disconnect());

  it("claims due jobs oldest-first and skips ones scheduled for later", async () => {
    const type = freshType();
    const now = new Date();
    const later = await enqueue(type, { n: "later" }, { runAt: new Date(now.getTime() + 3_600_000) });
    const second = await enqueue(type, { n: 2 }, { runAt: new Date(now.getTime() - 1_000) });
    const first = await enqueue(type, { n: 1 }, { runAt: new Date(now.getTime() - 5_000) });

    assert.equal((await claimNext("w1", [type]))?.id, first);
    assert.equal((await claimNext("w1", [type]))?.id, second);
    assert.equal(await claimNext("w1", [type]), null, "the future job must not be claimable yet");

    const future = await claimNext("w1", [type], new Date(now.getTime() + 7_200_000));
    assert.equal(future?.id, later);
  });

  it("marks a claimed job RUNNING with the worker and attempt recorded", async () => {
    const type = freshType();
    await enqueue(type);
    const job = await claimNext("worker-a", [type]);
    assert.ok(job);
    assert.equal(job.status, "RUNNING");
    assert.equal(job.lockedBy, "worker-a");
    assert.equal(job.attempts, 1);

    await complete(job.id);
    const row = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, "DONE");
    assert.ok(row.finishedAt);
    assert.equal(row.lockedBy, null);
  });

  it("never hands one job to two workers claiming at once (SKIP LOCKED)", async () => {
    const type = freshType();
    const N = 24;
    const ids = new Set<string>();
    for (let i = 0; i < N; i++) ids.add((await enqueue(type, { i }))!);

    const claimed: string[] = [];
    const worker = async (name: string) => {
      for (;;) {
        const job = await claimNext(name, [type]);
        if (!job) return;
        claimed.push(job.id);
      }
    };
    await Promise.all(["a", "b", "c", "d"].map(worker));

    assert.equal(claimed.length, N, "every job must be claimed");
    assert.equal(new Set(claimed).size, N, "a job was claimed more than once");
    assert.deepEqual(new Set(claimed), ids);
  });

  it("retries a failed job with growing backoff, then parks it as DEAD", async () => {
    const type = freshType();
    const id = (await enqueue(type, {}, { maxAttempts: 3 }))!;
    const t0 = new Date();

    let job = await claimNext("w", [type], t0);
    assert.equal(job?.attempts, 1);
    assert.equal(await fail(id, new Error("first"), t0), "RETRY");
    let row = await db.job.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, "QUEUED");
    assert.equal(row.lastError, "first");
    assert.equal(row.runAt.getTime() - t0.getTime(), 15_000, "first retry after 15 s");
    assert.equal(await claimNext("w", [type], t0), null, "not due yet");

    const t1 = new Date(t0.getTime() + 60_000);
    job = await claimNext("w", [type], t1);
    assert.equal(job?.attempts, 2);
    assert.equal(await fail(id, new Error("second"), t1), "RETRY");
    row = await db.job.findUniqueOrThrow({ where: { id } });
    assert.equal(row.runAt.getTime() - t1.getTime(), 30_000, "second retry after 30 s");

    const t2 = new Date(t1.getTime() + 60_000);
    job = await claimNext("w", [type], t2);
    assert.equal(job?.attempts, 3);
    assert.equal(await fail(id, new Error("third"), t2), "DEAD");
    row = await db.job.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, "DEAD");
    assert.equal(row.lastError, "third");
    assert.equal(await claimNext("w", [type], new Date(t2.getTime() + 86_400_000)), null, "a DEAD job is never claimed");
  });

  it("re-queues a job whose worker vanished, and parks one that keeps killing workers", async () => {
    const type = freshType();
    const survivor = (await enqueue(type, {}, { maxAttempts: 5 }))!;
    const poison = (await enqueue(type, {}, { maxAttempts: 1 }))!;

    const t0 = new Date();
    await claimNext("crashed", [type], t0);
    await claimNext("crashed", [type], t0);

    const reaped = await reapStale(60_000, new Date(t0.getTime() + 120_000));
    assert.ok(reaped.requeued >= 1);
    assert.ok(reaped.dead >= 1);

    assert.equal((await db.job.findUniqueOrThrow({ where: { id: survivor } })).status, "QUEUED");
    assert.equal((await db.job.findUniqueOrThrow({ where: { id: poison } })).status, "DEAD");

    const again = await claimNext("healthy", [type], new Date(t0.getTime() + 120_000));
    assert.equal(again?.id, survivor);
    assert.equal(again?.attempts, 2, "the crashed attempt still counts");
  });

  it("does not reap a job that is still within its timeout", async () => {
    const type = freshType();
    const id = (await enqueue(type))!;
    const t0 = new Date();
    await claimNext("busy", [type], t0);
    await reapStale(15 * 60_000, new Date(t0.getTime() + 60_000));
    assert.equal((await db.job.findUniqueOrThrow({ where: { id } })).status, "RUNNING");
  });

  it("ignores a second enqueue with the same dedupe key", async () => {
    const key = `dedupe.${uid()}`;
    const type = freshType();
    const first = await enqueue(type, {}, { dedupeKey: key });
    const second = await enqueue(type, {}, { dedupeKey: key });
    assert.ok(first);
    assert.equal(second, null);
    assert.equal(await db.job.count({ where: { dedupeKey: key } }), 1);
  });
});
