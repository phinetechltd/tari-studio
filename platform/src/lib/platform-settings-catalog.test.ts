import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateEnvOverrides } from "./env";
import { maskHint, PLATFORM_GROUPS, PLATFORM_SETTINGS } from "./platform-settings-catalog";

/** A valid value for settings with a format (numbers, addresses, URLs). */
const SAMPLES: Record<string, string> = {
  META_GRAPH_VERSION: "v23.0",
  SMTP_PORT: "587",
  EMAIL_FROM: "hello@example.com",
  EMAIL_REPLY_TO: "support@example.com",
  BONGA_SMS_ENDPOINT: "https://sms.example.com/v1/send-sms",
  SMS_DAILY_CAP: "300",
};

const BASE = { DATABASE_URL: "postgresql://x@localhost/x", AUTH_SECRET: "a-test-secret-that-is-long-enough-0123" };

describe("platform settings catalogue", () => {
  it("only offers settings the environment schema knows, each in a real group", () => {
    const groups = new Set(PLATFORM_GROUPS.map((g) => g.id));
    for (const s of PLATFORM_SETTINGS) {
      assert.ok(groups.has(s.group), `${s.key} is in unknown group ${s.group}`);
      const sample = s.options ? s.options[0]!.value : (SAMPLES[s.key] ?? "sample-value");
      assert.deepEqual(validateEnvOverrides({ ...BASE, [s.key]: sample }), [], `${s.key}=${sample} should be accepted`);
    }
  });

  it("never offers the secrets the dashboard itself depends on, or a way to switch off two-factor", () => {
    const keys = new Set(PLATFORM_SETTINGS.map((s) => s.key));
    for (const forbidden of ["DATABASE_URL", "AUTH_SECRET", "CREDENTIALS_KEY", "REQUIRE_TOTP", "APP_BASE_URL"]) {
      assert.equal(keys.has(forbidden), false, forbidden);
    }
  });

  it("marks every key, secret and token as secret", () => {
    for (const s of PLATFORM_SETTINGS) {
      if (/_(KEY|SECRET|PASSKEY|TOKEN|CREDENTIALS|PASSWORD)$/.test(s.key) && s.key !== "META_APP_ID") assert.ok(s.secret, `${s.key} should be secret`);
    }
  });

  it("rejects values the providers would not accept", () => {
    assert.notDeepEqual(validateEnvOverrides({ ...BASE, AI_PROVIDER: "gpt" }), []);
    assert.notDeepEqual(validateEnvOverrides({ ...BASE, META_GRAPH_VERSION: "latest" }), []);
    assert.notDeepEqual(validateEnvOverrides({ ...BASE, MPESA_ENV: "live" }), []);
  });

  it("masks secrets down to the last four characters", () => {
    assert.equal(maskHint("sk-ant-api03-abcdefgh1234"), "••••••••1234");
    assert.equal(maskHint("short"), "••••••••");
  });
});
