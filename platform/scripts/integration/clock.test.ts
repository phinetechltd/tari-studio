import assert from "node:assert/strict";
import { describe, it, after } from "node:test";

import { db } from "@/lib/db";

import { makeOrg } from "./_helpers";

describe("database clock", () => {
  after(() => db.$disconnect());

  it("runs sessions in UTC, so naive timestamps and now() agree", async () => {
    const rows = await db.$queryRaw<Array<{ tz: string }>>`SELECT current_setting('TimeZone') AS tz`;
    assert.equal(rows[0]?.tz, "UTC", "the database must be pinned to UTC (ALTER DATABASE … SET timezone TO 'UTC')");
  });

  it("stores DEFAULT now() timestamps as real UTC", async () => {
    const before = Date.now();
    const org = await makeOrg();
    const drift = Math.abs(org.createdAt.getTime() - before);
    assert.ok(drift < 15_000, `createdAt is ${Math.round(drift / 1000)}s from the app clock — a timezone shift would show as hours`);
  });

  it("round-trips a JS Date through raw SQL without shifting it", async () => {
    const at = new Date("2026-09-21T12:00:00.000Z");
    const rows = await db.$queryRaw<Array<{ same: boolean }>>`SELECT (${at}::timestamp = '2026-09-21 12:00:00'::timestamp) AS same`;
    assert.equal(rows[0]?.same, true);
  });
});
