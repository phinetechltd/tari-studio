import "server-only";

import { randomUUID } from "node:crypto";

import { db, type Tx } from "./db";

/**
 * Per-organisation document numbering (TSK-0001, CMP-0001 …).
 *
 * Ported from Raut with one deliberate change. Raut read the counter and then
 * updated it, which was correct only because SQLite serialises every writer. On
 * Postgres two concurrent transactions would both read 5 and both issue TSK-0005.
 * This is one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`: the row lock
 * the update takes is what serialises concurrent callers, and the number issued
 * is read back from the statement itself.
 */

export type DocType = "TASK" | "CAMPAIGN" | "BRAND" | "REPORT" | "ORDER";

const DEFAULT_PREFIX: Record<DocType, string> = {
  TASK: "TSK",
  CAMPAIGN: "CMP",
  BRAND: "BRD",
  REPORT: "RPT",
  ORDER: "ORD",
};

const PAD = 4;

export async function nextNumber(
  organizationId: string,
  docType: DocType,
  /** Run inside the caller's transaction so the number rolls back with the work. */
  client?: Tx,
): Promise<string> {
  const prefix = DEFAULT_PREFIX[docType];
  const runner = client ?? db;

  // First call inserts nextValue = 2 (issuing 1); later calls increment.
  const rows = await runner.$queryRaw<Array<{ prefix: string; nextValue: number }>>`
    INSERT INTO "DocumentCounter" ("id", "organizationId", "docType", "prefix", "nextValue")
    VALUES (${randomUUID()}, ${organizationId}, ${docType}, ${prefix}, 2)
    ON CONFLICT ("organizationId", "docType")
    DO UPDATE SET "nextValue" = "DocumentCounter"."nextValue" + 1
    RETURNING "prefix", "nextValue"
  `;

  const row = rows[0];
  if (!row) throw new Error("Document counter returned no row");
  return `${row.prefix}-${String(row.nextValue - 1).padStart(PAD, "0")}`;
}
