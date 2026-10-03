import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { refreshPlatformConfig } from "@/lib/platform-config";
import type { Principal } from "@/lib/rbac";
import { aiStatus } from "@/server/ai";
import { resolveGateway, saveGateway } from "@/server/gateways";
import { platformSettingsStatus, savePlatformSettings } from "@/server/platform-settings";

import { makeOrg, makeUser, rejection } from "./_helpers";

/** The settings this file writes; removed afterwards so other files see the pinned test env. */
const TOUCHED = ["ANTHROPIC_API_KEY", "AI_MODEL", "META_APP_ID"];

describe("platform admin deployment settings", () => {
  let admin: Principal;

  before(async () => {
    await db.platformSetting.deleteMany({ where: { key: { in: TOUCHED } } });
    const { user } = await makeUser({ isPlatformAdmin: true });
    admin = { userId: user.id, organizationId: null, role: "SUPER_ADMIN", extraPermissions: [], enabledModules: new Set(), mfa: true };
  });
  after(async () => {
    await db.platformSetting.deleteMany({ where: { key: { in: TOUCHED } } });
    await db.$disconnect();
  });

  it("stores a Claude key sealed, applies it over the .env, and never returns it", async () => {
    const key = "sk-ant-api03-integration-test-key-9876";
    await savePlatformSettings(admin, { ANTHROPIC_API_KEY: key, AI_MODEL: "claude-sonnet-5" });

    const row = await db.platformSetting.findUniqueOrThrow({ where: { key: "ANTHROPIC_API_KEY" } });
    assert.equal(row.value, null, "a secret is never stored as plain text");
    assert.ok(row.cipherText && !row.cipherText.includes("integration-test-key"));

    await refreshPlatformConfig(true);
    assert.equal(env().ANTHROPIC_API_KEY, key, "env() serves the dashboard value");
    assert.equal(env().AI_MODEL, "claude-sonnet-5");

    const status = await platformSettingsStatus();
    const shown = status.settings.find((s) => s.key === "ANTHROPIC_API_KEY")!;
    assert.equal(shown.source, "dashboard");
    assert.equal(shown.value, "••••••••9876");
    assert.ok(!JSON.stringify(status).includes(key), "the status never carries the key");
  });

  it("lets an agency's own key win for that agency only", async () => {
    const org = await makeOrg();
    await saveGateway(org.id, "ai", { provider: "anthropic", apiKey: "sk-ant-api03-agency-own-key-5555" });
    const own = await resolveGateway(org.id, "ai");
    assert.equal(own.apiKey, "sk-ant-api03-agency-own-key-5555");
    const other = await makeOrg();
    assert.equal((await resolveGateway(other.id, "ai")).apiKey, undefined, "another agency falls back to the deployment key");
  });

  it("keeps a secret when the field is left blank, and falls back to the .env when it is removed", async () => {
    await savePlatformSettings(admin, { ANTHROPIC_API_KEY: "" });
    await refreshPlatformConfig(true);
    assert.equal(env().ANTHROPIC_API_KEY, "sk-ant-api03-integration-test-key-9876");

    await savePlatformSettings(admin, { ANTHROPIC_API_KEY: null, AI_MODEL: "" });
    await refreshPlatformConfig(true);
    assert.equal(env().ANTHROPIC_API_KEY || "", process.env.ANTHROPIC_API_KEY ?? "", "back to the .env value");
    assert.equal(await db.platformSetting.count({ where: { key: { in: ["ANTHROPIC_API_KEY", "AI_MODEL"] } } }), 0);
    assert.equal(aiStatus().chain[0]?.provider, "fixtures", "the test run's pinned provider is untouched");
  });

  it("refuses values the providers would not accept, and anything from a non-admin", async () => {
    const badProvider = await rejection(() => savePlatformSettings(admin, { AI_PROVIDER: "gpt" }));
    assert.match(String((badProvider as Error).message), /must be one of/);
    const badVersion = await rejection(() => savePlatformSettings(admin, { META_GRAPH_VERSION: "latest" }));
    assert.match(String((badVersion as Error).message), /would not work/);
    const unknown = await rejection(() => savePlatformSettings(admin, { DATABASE_URL: "postgresql://evil" }));
    assert.match(String((unknown as Error).message), /Unknown setting/);
    const owner = { ...admin, role: "OWNER" as const, organizationId: "org" };
    const denied = await rejection(() => savePlatformSettings(owner, { META_APP_ID: "123" }));
    assert.match(String((denied as Error).message), /Only platform admins/);
  });
});
