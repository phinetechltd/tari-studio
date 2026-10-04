import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeSchedule, nextRunAt, scheduleProblem, upcoming } from "./schedule";

const NAIROBI = "Africa/Nairobi"; // UTC+3, no daylight saving
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("schedule rules", () => {
  it("accepts a sensible schedule and says what is wrong with others", () => {
    assert.equal(scheduleProblem({ days: [1, 4], times: ["09:00"] }), null);
    assert.match(scheduleProblem({ days: [], times: ["09:00"] }) ?? "", /at least one day/);
    assert.match(scheduleProblem({ days: [1], times: [] }) ?? "", /at least one time/);
    assert.match(scheduleProblem({ days: [0], times: ["09:00"] }) ?? "", /Monday to Sunday/);
    assert.match(scheduleProblem({ days: [8], times: ["09:00"] }) ?? "", /Monday to Sunday/);
    assert.match(scheduleProblem({ days: [1, 1], times: ["09:00"] }) ?? "", /once/);
    assert.match(scheduleProblem({ days: [1], times: ["9:00"] }) ?? "", /09:00/);
    assert.match(scheduleProblem({ days: [1], times: ["24:00"] }) ?? "", /09:00/);
    assert.match(scheduleProblem({ days: [1], times: ["01:00", "02:00", "03:00", "04:00", "05:00"] }) ?? "", /at most/);
  });
});

describe("next run", () => {
  // 2026-10-05 is a Monday.
  it("finds the next slot later the same day", () => {
    const from = new Date("2026-10-05T04:00:00Z"); // 07:00 Monday in Nairobi
    assert.equal(iso(nextRunAt({ days: [1], times: ["09:00"] }, NAIROBI, from)), "2026-10-05T06:00:00.000Z");
  });

  it("is strictly after the moment given (a slot that has just started is not returned again)", () => {
    const slot = new Date("2026-10-05T06:00:00Z");
    assert.equal(iso(nextRunAt({ days: [1], times: ["09:00"] }, NAIROBI, slot)), "2026-10-12T06:00:00.000Z");
    assert.equal(iso(nextRunAt({ days: [1], times: ["09:00"] }, NAIROBI, new Date(slot.getTime() - 1))), "2026-10-05T06:00:00.000Z");
  });

  it("moves to the next chosen weekday", () => {
    const from = new Date("2026-10-05T10:00:00Z"); // Monday afternoon, after 09:00
    assert.equal(iso(nextRunAt({ days: [1, 4], times: ["09:00"] }, NAIROBI, from)), "2026-10-08T06:00:00.000Z"); // Thursday
  });

  it("uses the wall clock of the brand's zone, including across midnight UTC", () => {
    // 00:30 Nairobi on Tuesday 6 Oct is 21:30 UTC on Monday 5 Oct.
    const from = new Date("2026-10-05T12:00:00Z");
    assert.equal(iso(nextRunAt({ days: [2], times: ["00:30"] }, NAIROBI, from)), "2026-10-05T21:30:00.000Z");
  });

  it("lists several times a day in order", () => {
    const from = new Date("2026-10-05T00:00:00Z");
    const got = upcoming({ days: [1], times: ["18:00", "09:00"] }, NAIROBI, from, 3).map(iso);
    assert.deepEqual(got, ["2026-10-05T06:00:00.000Z", "2026-10-05T15:00:00.000Z", "2026-10-12T06:00:00.000Z"]);
  });

  it("handles a zone with daylight saving (London, clocks go back on 25 Oct 2026)", () => {
    const sch = { days: [7], times: ["09:00"] };
    assert.equal(iso(nextRunAt(sch, "Europe/London", new Date("2026-10-18T00:00:00Z"))), "2026-10-18T08:00:00.000Z"); // BST, UTC+1
    assert.equal(iso(nextRunAt(sch, "Europe/London", new Date("2026-10-25T00:00:00Z"))), "2026-10-25T09:00:00.000Z"); // GMT, UTC+0
  });

  it("returns null for an invalid schedule or an unknown zone", () => {
    assert.equal(nextRunAt({ days: [], times: ["09:00"] }, NAIROBI, new Date()), null);
    assert.equal(nextRunAt({ days: [1], times: ["09:00"] }, "Mars/Olympus", new Date()), null);
  });
});

describe("describing a schedule", () => {
  it("reads naturally", () => {
    assert.equal(describeSchedule({ days: [4, 1], times: ["09:00"] }), "Every Monday and Thursday at 09:00");
    assert.equal(describeSchedule({ days: [1, 2, 3, 4, 5], times: ["08:00", "17:30"] }), "Every weekday at 08:00 and 17:30");
    assert.equal(describeSchedule({ days: [1, 2, 3, 4, 5, 6, 7], times: ["12:00"] }), "Every day at 12:00");
    assert.equal(describeSchedule({ days: [3], times: ["07:15"] }), "Every Wednesday at 07:15");
    assert.equal(describeSchedule({ days: [], times: [] }), "No schedule yet");
  });
});
