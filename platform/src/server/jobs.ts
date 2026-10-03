import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * Database-backed work queue.
 *
 * Postgres is already here and the volumes are small (publishing, insights
 * pulls, a daily report), so a queue table beats adding Redis. The worker
 * claims one row at a time with `FOR UPDATE SKIP LOCKED`, which lets several
 * workers run without ever taking the same job.
 *
 * Delivery is at-least-once: a worker that dies mid-job leaves a RUNNING row
 * that `reapStale` re-queues. **Handlers must therefore be idempotent** — the
 * publish handler, for one, looks a post up before retrying rather than
 * posting blind.
 *
 * Every time comparison passes a JS Date rather than SQL `now()`. Prisma stores
 * naive UTC timestamps; comparing them against a session-zone `now()` is the
 * kind of bug that only appears when the server's clock zone isn't UTC.
 */

export interface JobRow {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  status: string;
  runAt: Date;
  attempts: number;
  maxAttempts: number;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  dedupeKey: string | null;
  organizationId: string | null;
}

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  organizationId?: string | null;
  /** At most one job is ever created for a given key; a repeat returns null. */
  dedupeKey?: string;
}

export async function enqueue(
  type: string,
  payload: Prisma.InputJsonValue = {},
  opts: EnqueueOptions = {},
): Promise<string | null> {
  if (opts.dedupeKey) {
    // A repeat is expected, not exceptional (the hourly prune, a redelivered
    // webhook), so it is a silent no-op rather than a caught unique violation
    // that Prisma would log as an error every time.
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "Job" ("id", "type", "payload", "status", "runAt", "attempts", "maxAttempts", "organizationId", "dedupeKey", "createdAt")
      VALUES (${randomUUID()}, ${type}, ${JSON.stringify(payload)}::jsonb, 'QUEUED', ${opts.runAt ?? new Date()}, 0,
              ${opts.maxAttempts ?? 5}, ${opts.organizationId ?? null}, ${opts.dedupeKey}, ${new Date()})
      ON CONFLICT ("dedupeKey") DO NOTHING
      RETURNING "id"
    `;
    return rows[0]?.id ?? null;
  }
  try {
    const job = await db.job.create({
      data: {
        type,
        payload,
        runAt: opts.runAt ?? new Date(),
        maxAttempts: opts.maxAttempts ?? 5,
        organizationId: opts.organizationId ?? null,
        dedupeKey: opts.dedupeKey ?? null,
      },
      select: { id: true },
    });
    return job.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

/** Claims the next due job, or null when none is ready. */
export async function claimNext(
  workerId: string,
  types?: readonly string[],
  now: Date = new Date(),
): Promise<JobRow | null> {
  const typeFilter =
    types && types.length > 0
      ? Prisma.sql`AND "type" IN (${Prisma.join([...types])})`
      : Prisma.empty;

  const rows = await db.$queryRaw<JobRow[]>`
    UPDATE "Job"
       SET "status" = 'RUNNING',
           "lockedAt" = ${now},
           "lockedBy" = ${workerId},
           "attempts" = "attempts" + 1
     WHERE "id" = (
       SELECT "id" FROM "Job"
        WHERE "status" = 'QUEUED' AND "runAt" <= ${now} ${typeFilter}
        ORDER BY "runAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
    RETURNING "id", "type", "payload", "status", "runAt", "attempts", "maxAttempts",
              "lockedAt", "lockedBy", "lastError", "dedupeKey", "organizationId"
  `;
  return rows[0] ?? null;
}

export async function complete(id: string, now: Date = new Date()): Promise<void> {
  await db.job.update({
    where: { id },
    data: { status: "DONE", finishedAt: now, lockedAt: null, lockedBy: null, lastError: null },
  });
}

/** Exponential backoff: 15 s, 30 s, 60 s … capped at one hour. */
export function backoffMs(attempts: number): number {
  return Math.min(15_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

/**
 * Records a failure. Retries with backoff until `maxAttempts` is spent, then
 * parks the row as DEAD (kept, not deleted, so it can be inspected and replayed).
 */
export async function fail(
  id: string,
  error: unknown,
  now: Date = new Date(),
): Promise<"RETRY" | "DEAD"> {
  const job = await db.job.findUnique({
    where: { id },
    select: { attempts: true, maxAttempts: true },
  });
  if (!job) return "DEAD";

  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);

  if (job.attempts >= job.maxAttempts) {
    await db.job.update({
      where: { id },
      data: { status: "DEAD", finishedAt: now, lockedAt: null, lockedBy: null, lastError: message },
    });
    return "DEAD";
  }

  await db.job.update({
    where: { id },
    data: {
      status: "QUEUED",
      runAt: new Date(now.getTime() + backoffMs(job.attempts)),
      lockedAt: null,
      lockedBy: null,
      lastError: message,
    },
  });
  return "RETRY";
}

/**
 * Re-queues jobs whose worker vanished. A job that has already used all its
 * attempts is parked as DEAD instead, so a job that crashes the worker every
 * time cannot loop forever.
 */
export async function reapStale(
  timeoutMs: number,
  now: Date = new Date(),
): Promise<{ requeued: number; dead: number }> {
  const cutoff = new Date(now.getTime() - timeoutMs);

  const dead = await db.$executeRaw`
    UPDATE "Job"
       SET "status" = 'DEAD', "finishedAt" = ${now}, "lockedAt" = NULL, "lockedBy" = NULL,
           "lastError" = 'worker lost after final attempt'
     WHERE "status" = 'RUNNING' AND "lockedAt" < ${cutoff} AND "attempts" >= "maxAttempts"
  `;
  const requeued = await db.$executeRaw`
    UPDATE "Job"
       SET "status" = 'QUEUED', "lockedAt" = NULL, "lockedBy" = NULL, "lastError" = 'worker lost'
     WHERE "status" = 'RUNNING' AND "lockedAt" < ${cutoff}
  `;
  return { requeued: Number(requeued), dead: Number(dead) };
}

/** Housekeeping: finished jobs are history, not state. */
export async function pruneFinished(olderThanMs = 14 * 86_400_000, now: Date = new Date()): Promise<number> {
  const res = await db.job.deleteMany({
    where: { status: "DONE", finishedAt: { lt: new Date(now.getTime() - olderThanMs) } },
  });
  return res.count;
}
