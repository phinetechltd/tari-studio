import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { PRODUCT_NAME } from "@/lib/brand";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Uptime checks and the deploy script call this. It proves the process is up
// *and* can reach the database — a 200 that never touched Postgres would report
// a broken deployment as healthy. A queue with jobs overdue by more than five
// minutes means the worker is down, which silently stops publishing, automations
// and generations, so that is reported too. Nothing here names a customer or a
// secret.
export const GET = handler({ public: true }, async () => {
  let dbOk = false;
  let overdueJobs: number | null = null;
  let deadJobs: number | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
    const cutoff = new Date(Date.now() - 5 * 60_000);
    [overdueJobs, deadJobs] = await Promise.all([
      db.job.count({ where: { status: "QUEUED", runAt: { lt: cutoff } } }),
      db.job.count({ where: { status: "DEAD", finishedAt: { gt: new Date(Date.now() - 86_400_000) } } }),
    ]);
  } catch {
    // Database unreachable — reported below, not thrown.
  }
  const workerOk = overdueJobs === 0;
  const status = !dbOk ? "down" : workerOk ? "ok" : "degraded";
  return NextResponse.json(
    {
      status,
      product: PRODUCT_NAME,
      time: new Date().toISOString(),
      db: dbOk,
      worker: { ok: workerOk, overdueJobs, deadJobsLast24h: deadJobs },
      providers: {
        ai: process.env.AI_PROVIDER ?? "fixtures",
        meta: process.env.META_PROVIDER ?? "simulator",
        payments: process.env.PAYMENT_PROVIDER ?? "simulator",
        generation: process.env.GENERATION_PROVIDER ?? "simulator",
      },
    },
    { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
});
