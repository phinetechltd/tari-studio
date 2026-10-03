import os from "node:os";

import { refreshPlatformConfig } from "@/lib/platform-config";
import { claimNext, complete, enqueue, fail, reapStale, type JobRow } from "@/server/jobs";

import { handlers } from "./handlers";

/**
 * The background worker: `npm run worker`, and its own systemd unit in
 * production. It shares the database with the web process and nothing else.
 *
 * Loop: claim one due job → run its handler → mark it done, or fail it with
 * backoff. On SIGTERM it stops claiming and lets the running job finish, so a
 * deploy does not abandon a post half-published.
 */

const workerId = `${os.hostname()}:${process.pid}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const STALE_AFTER_MS = 15 * 60_000;
const JOB_TIMEOUT_MS = 5 * 60_000;

let stopping = false;
let running: Promise<void> | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runJob(job: JobRow): Promise<void> {
  const handler = handlers[job.type];
  if (!handler) {
    // An unknown type will never succeed by retrying, so it is parked at once.
    await fail(job.id, new Error(`No handler registered for "${job.type}"`), new Date());
    return;
  }
  try {
    await Promise.race([
      handler(job),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`Timed out after ${JOB_TIMEOUT_MS} ms`)), JOB_TIMEOUT_MS),
      ),
    ]);
    await complete(job.id);
  } catch (e) {
    const outcome = await fail(job.id, e);
    console.error(`[worker] ${job.type} ${job.id} failed (${outcome}):`, e instanceof Error ? e.message : e);
  }
}

/** Recurring work is scheduled by enqueueing with a per-interval dedupe key. */
async function scheduleRecurring(now = new Date()): Promise<void> {
  const hour = now.toISOString().slice(0, 13); // 2026-09-21T15
  await enqueue("system.prune", {}, { dedupeKey: `system.prune:${hour}`, maxAttempts: 2 });
  const minute = now.toISOString().slice(0, 16); // 2026-09-21T15:04
  await enqueue("billing.sweep", {}, { dedupeKey: `billing.sweep:${minute}`, maxAttempts: 1 });
}

async function main(): Promise<void> {
  console.info(`[worker] ${workerId} started`);
  let lastReap = 0;
  let lastSchedule = 0;

  process.on("SIGTERM", () => (stopping = true));
  process.on("SIGINT", () => (stopping = true));

  while (!stopping) {
    // Keys and modes a platform admin saved in the console (throttled to every 10 s).
    await refreshPlatformConfig();
    const now = Date.now();
    if (now - lastReap > 60_000) {
      lastReap = now;
      const reaped = await reapStale(STALE_AFTER_MS);
      if (reaped.requeued || reaped.dead) console.warn("[worker] reaped stale jobs", reaped);
    }
    if (now - lastSchedule > 60_000) {
      lastSchedule = now;
      await scheduleRecurring();
    }

    const job = await claimNext(workerId);
    if (!job) {
      await sleep(POLL_MS);
      continue;
    }
    running = runJob(job);
    await running;
    running = null;
  }

  if (running) await running;
  console.info(`[worker] ${workerId} stopped`);
}

main().catch((e) => {
  console.error("[worker] fatal", e);
  process.exit(1);
});
