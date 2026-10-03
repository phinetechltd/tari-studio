import "server-only";

import type { JobRow } from "@/server/jobs";
import { pruneFinished } from "@/server/jobs";
import { pruneBuckets } from "@/lib/ratelimit";
import { db } from "@/lib/db";
import { aiCreditsSweep } from "@/server/ai-credits";
import { runAutomation } from "@/server/automations";
import { pollGeneration, submitGeneration } from "@/server/generation";
import { deliverNotification } from "@/server/notify";
import { publishPost } from "@/server/social";
import { runBillingSweep } from "@/server/subscriptions";

/**
 * Job handlers, keyed by job type. Each must be idempotent: delivery is
 * at-least-once (see src/server/jobs.ts).
 *
 * Later workstreams register theirs here: `publish.post`, `insights.pull`,
 * `report.daily`, `channel.health`.
 */

function assetIdOf(job: JobRow): string {
  const id = (job.payload as { assetId?: unknown } | null)?.assetId;
  if (typeof id !== "string") throw new Error(`${job.type} job ${job.id} has no assetId`);
  return id;
}

export type JobHandler = (job: JobRow) => Promise<void>;

export const handlers: Record<string, JobHandler> = {
  /** Does nothing, successfully. Used to prove the queue end to end. */
  "system.noop": async () => undefined,

  /** Hourly housekeeping. */
  "system.prune": async () => {
    await pruneBuckets();
    await pruneFinished();
    await db.idempotencyKey.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
    });
    // The delivery log keeps six months; alert marks outlive any period they guard.
    await db.notificationDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * 86_400_000) } } });
    await db.alertMark.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 400 * 86_400_000) } } });
  },

  /** Every minute: plan credit grants, renewals, expiries, reminders, stale checkouts (src/server/subscriptions.ts). */
  "billing.sweep": async () => {
    const r = await runBillingSweep();
    if (r.granted || r.renewed || r.failed || r.expired || r.reminded) console.info("[worker] billing sweep", r);
    // Provider credit expiries and AI budget alerts (throttled to every five minutes). Alerts only.
    const ai = await aiCreditsSweep();
    if (ai && (ai.expired || ai.alerts.length)) console.info("[worker] AI credits", ai);
  },

  /** Sends one queued email or SMS (src/server/notify.ts). */
  "notify.deliver": async (job) => {
    const id = (job.payload as { deliveryId?: unknown } | null)?.deliveryId;
    if (typeof id !== "string") throw new Error(`notify.deliver job ${job.id} has no deliveryId`);
    await deliverNotification(id, job.attempts >= job.maxAttempts);
  },

  /** Sends a generation to the provider (src/server/generation.ts). */
  "content.generate": async (job) => {
    await submitGeneration(assetIdOf(job), job.attempts >= job.maxAttempts);
  },

  /** Checks on a submitted generation and finishes, fails or re-schedules it. */
  "content.poll": async (job) => {
    const n = Number((job.payload as { n?: unknown } | null)?.n ?? 0);
    await pollGeneration(assetIdOf(job), Number.isFinite(n) ? n : 0);
  },

  /** Publishes one scheduled post to Facebook or Instagram (src/server/social.ts). */
  "publish.post": async (job) => {
    const postId = (job.payload as { postId?: unknown } | null)?.postId;
    if (typeof postId !== "string") throw new Error(`publish.post job ${job.id} has no postId`);
    await publishPost(postId);
  },

  /** Runs one automation for one event (src/server/automations.ts). */
  "automation.run": async (job) => {
    const p = job.payload as { automationId?: unknown; eventKey?: unknown; context?: unknown } | null;
    if (typeof p?.automationId !== "string" || typeof p.eventKey !== "string") {
      throw new Error(`automation.run job ${job.id} is missing automationId or eventKey`);
    }
    await runAutomation({ automationId: p.automationId, eventKey: p.eventKey, context: (p.context ?? {}) as Record<string, never> });
  },
};
