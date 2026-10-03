import "server-only";

import { db } from "./db";

/**
 * Fixed-window rate limiting, keyed on an *identity* — an email address, an
 * organisation, a tracked-link code — never on an IP.
 *
 * Keying on IP punishes whole offices and shared handsets and does nothing
 * against an attacker who rotates addresses (the IntelliCash lesson). The
 * counters live in Postgres so the web process and the worker see the same
 * numbers and a restart does not reset them.
 */

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export async function hit(
  key: string,
  opts: { limit: number; windowSec: number },
  nowMs: number = Date.now(),
): Promise<RateResult> {
  const windowMs = opts.windowSec * 1000;
  const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);

  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"
  `;

  const count = Number(rows[0]?.count ?? 1);
  const allowed = count <= opts.limit;
  const retryAfterSec = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - nowMs) / 1000));
  return { allowed, remaining: Math.max(0, opts.limit - count), retryAfterSec };
}

/** Drops windows too old to matter. Called from the worker's maintenance job. */
export async function pruneBuckets(olderThanMs = 24 * 3_600_000): Promise<number> {
  const res = await db.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: new Date(Date.now() - olderThanMs) } },
  });
  return res.count;
}
