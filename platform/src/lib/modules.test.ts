import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MODULE_CATALOG,
  MODULE_KEYS,
  MODULE_LIST,
  dependentsOf,
  isModuleKey,
  missingPrerequisites,
} from "./modules";

describe("module catalogue", () => {
  it("is keyed consistently", () => {
    for (const key of MODULE_KEYS) assert.equal(MODULE_CATALOG[key].key, key);
    assert.equal(MODULE_LIST.length, MODULE_KEYS.length);
  });

  it("only requires modules that exist, and has no cycles", () => {
    for (const m of MODULE_LIST) {
      for (const r of m.requires) assert.ok(isModuleKey(r), `${m.key} requires unknown ${r}`);
    }
    const visit = (key: string, path: string[]): void => {
      assert.ok(!path.includes(key), `cycle: ${[...path, key].join(" → ")}`);
      for (const r of MODULE_CATALOG[key as keyof typeof MODULE_CATALOG].requires) visit(r, [...path, key]);
    };
    for (const k of MODULE_KEYS) visit(k, []);
  });

  it("never lets a shipped module depend on one that has not shipped", () => {
    for (const m of MODULE_LIST.filter((x) => !x.comingSoon)) {
      for (const r of m.requires) {
        assert.equal(MODULE_CATALOG[r].comingSoon, false, `${m.key} needs unreleased ${r}`);
      }
    }
  });

  it("carries no price — pricing is undecided and a number here would be quoted as fact", () => {
    for (const m of MODULE_LIST) {
      assert.ok(!Object.keys(m).some((k) => /price|cents|cost|fee/i.test(k)), `${m.key} has a price-like field`);
    }
  });

  it("reports missing prerequisites and dependents", () => {
    assert.deepEqual(missingPrerequisites("SOCIAL_PUBLISHING", new Set()), ["CONTENT_STUDIO"]);
    assert.deepEqual(missingPrerequisites("SOCIAL_PUBLISHING", new Set(["CONTENT_STUDIO"])), []);
    assert.deepEqual(dependentsOf("CONTENT_STUDIO", new Set(["CONTENT_STUDIO", "SOCIAL_PUBLISHING"])), [
      "SOCIAL_PUBLISHING",
    ]);
    assert.deepEqual(dependentsOf("CONTENT_STUDIO", new Set(["CONTENT_STUDIO"])), []);
  });

  it("ships the four Release 1 modules plus WhatsApp, Leads, Products and Autopilot from Release 2", () => {
    const shipped = MODULE_LIST.filter((m) => !m.comingSoon).map((m) => m.key).sort();
    assert.deepEqual(shipped, ["AI_CONTENT", "AUTOPILOT", "CAMPAIGN_TRACKING", "CONTENT_STUDIO", "LEADS_CRM", "PRODUCTS", "SOCIAL_PUBLISHING", "WHATSAPP_AI"]);
    for (const m of MODULE_LIST.filter((x) => !x.comingSoon)) assert.ok(m.release === "R1" || m.release === "R2", m.key);
  });
});
