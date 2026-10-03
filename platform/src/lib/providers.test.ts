import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resetEnvCache } from "./env";
import { configuredProviderName, isRefused, isStandIn, providerName } from "./providers";

describe("stand-in providers", () => {
  it("are refused in production and allowed elsewhere", () => {
    assert.equal(isRefused("EMAIL", "console", true), true);
    assert.equal(isRefused("META", "simulator", true), true);
    assert.equal(isRefused("AI", "fixtures", true), true);

    assert.equal(isRefused("EMAIL", "console", false), false);
    assert.equal(isRefused("META", "simulator", false), false);
    assert.equal(isRefused("AI", "fixtures", false), false);
  });

  it("real providers are never refused", () => {
    assert.equal(isRefused("EMAIL", "smtp", true), false);
    assert.equal(isRefused("META", "graph", true), false);
    assert.equal(isRefused("AI", "anthropic", true), false);
    assert.equal(isRefused("AI", "nvidia", true), false);
  });

  it("acting on a stand-in still fails loudly in production", () => {
    const before = snapshot("NODE_ENV", "META_PROVIDER");
    set("NODE_ENV", "production");
    set("META_PROVIDER", "simulator");
    resetEnvCache();
    try {
      // The action path must refuse: this is what stops a fake post.
      assert.throws(() => providerName("META"), /stand-in/);
    } finally {
      restore(before);
    }
  });

  it("labelling the UI never throws, so a page still renders", () => {
    const before = snapshot("NODE_ENV", "META_PROVIDER");
    set("NODE_ENV", "production");
    set("META_PROVIDER", "simulator");
    resetEnvCache();
    try {
      // A page render asking "is this simulated?" must get an answer, not a
      // 500 — that is the regression these two tests pin down.
      assert.equal(configuredProviderName("META"), "simulator");
      assert.equal(isStandIn("META"), true);
    } finally {
      restore(before);
    }
  });
});

/** process.env.NODE_ENV is typed read-only, so write through a mutable view. */
function set(key: string, value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

/** env() insists on these two, and the unit suite does not load .env. */
function primeEnv() {
  process.env.DATABASE_URL ??= "postgresql://u:p@127.0.0.1:5432/d";
  process.env.AUTH_SECRET ??= "x".repeat(32);
}

function snapshot(...keys: string[]) {
  primeEnv();
  return keys.map((k) => [k, process.env[k]] as const);
}

function restore(saved: ReadonlyArray<readonly [string, string | undefined]>) {
  for (const [k, v] of saved) set(k, v);
  resetEnvCache();
}
