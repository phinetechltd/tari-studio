import assert from "node:assert/strict";
import { describe, it, after } from "node:test";

import { db } from "@/lib/db";
import { nextNumber } from "@/lib/numbering";

import { makeOrg, rejection } from "./_helpers";

describe("document numbering", () => {
  after(() => db.$disconnect());

  it("starts at 0001 and counts up per document type", async () => {
    const org = await makeOrg();
    assert.equal(await nextNumber(org.id, "TASK"), "TSK-0001");
    assert.equal(await nextNumber(org.id, "TASK"), "TSK-0002");
    assert.equal(await nextNumber(org.id, "CAMPAIGN"), "CMP-0001");
    assert.equal(await nextNumber(org.id, "TASK"), "TSK-0003");
  });

  it("keeps organisations independent", async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    assert.equal(await nextNumber(a.id, "TASK"), "TSK-0001");
    assert.equal(await nextNumber(b.id, "TASK"), "TSK-0001");
  });

  it("never issues the same number twice under concurrency", async () => {
    const org = await makeOrg();
    const N = 40;
    const issued = await Promise.all(Array.from({ length: N }, () => nextNumber(org.id, "TASK")));

    assert.equal(new Set(issued).size, N, "duplicate document numbers were issued");
    const expected = Array.from({ length: N }, (_, i) => `TSK-${String(i + 1).padStart(4, "0")}`);
    assert.deepEqual([...issued].sort(), expected, "numbers must be contiguous, with no gaps");
  });

  it("gives the number back when the surrounding transaction rolls back", async () => {
    const org = await makeOrg();
    const err = await rejection(() =>
      db.$transaction(async (tx) => {
        assert.equal(await nextNumber(org.id, "REPORT", tx), "RPT-0001");
        throw new Error("abort");
      }),
    );
    assert.match(String(err), /abort/);
    assert.equal(await nextNumber(org.id, "REPORT"), "RPT-0001", "a rolled-back number must not be burned");
  });
});
