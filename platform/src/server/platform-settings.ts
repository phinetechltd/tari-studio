import "server-only";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { validateEnvOverrides } from "@/lib/env";
import { PLATFORM_SECRET_SCOPE, refreshPlatformConfig } from "@/lib/platform-config";
import { maskHint, PLATFORM_SETTINGS, specFor } from "@/lib/platform-settings-catalog";
import { isRefused, type ProviderKind } from "@/lib/providers";
import type { Principal } from "@/lib/rbac";
import { decryptFor, encryptFor, secretsAvailable } from "@/lib/secrets";

/**
 * The platform admin's deployment settings: provider modes, models and keys
 * entered in the console instead of the server's .env. Values are validated
 * against the same schema as .env before they are stored, secrets are sealed
 * and write-only, and every change is audited by key (never by value).
 */

export interface PlatformSettingStatus {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  help?: string;
  /** Where the value in force comes from. */
  source: "dashboard" | "env" | null;
  /** The value for plain settings; a masked hint for secrets. */
  value: string | null;
  /** The .env value (plain settings only), shown as the fallback. */
  envValue: string | null;
}

export async function platformSettingsStatus(): Promise<{ vaultReady: boolean; settings: PlatformSettingStatus[] }> {
  const rows = await db.platformSetting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const settings = PLATFORM_SETTINGS.map((spec): PlatformSettingStatus => {
    const row = byKey.get(spec.key);
    const envRaw = process.env[spec.key]?.trim() || null;
    let dashboard: string | null = null;
    if (row) {
      dashboard = spec.secret
        ? row.cipherText && row.iv && row.authTag
          ? decryptFor(PLATFORM_SECRET_SCOPE, { cipherText: row.cipherText, iv: row.iv, authTag: row.authTag })
          : null
        : row.value;
    }
    const active = dashboard ?? envRaw;
    return {
      key: spec.key,
      label: spec.label,
      group: spec.group,
      secret: spec.secret,
      options: spec.options,
      placeholder: spec.placeholder,
      help: spec.help,
      source: dashboard ? "dashboard" : envRaw ? "env" : null,
      value: active ? (spec.secret ? maskHint(active) : active) : null,
      envValue: spec.secret ? null : envRaw,
    };
  });
  return { vaultReady: secretsAvailable(), settings };
}

const PROVIDER_KIND: Record<string, ProviderKind> = {
  AI_PROVIDER: "AI",
  META_PROVIDER: "META",
  PAYMENT_PROVIDER: "PAYMENT",
  PAYSTACK_PROVIDER: "PAYSTACK",
  GENERATION_PROVIDER: "GENERATION",
  EMAIL_PROVIDER: "EMAIL",
  SMS_PROVIDER: "SMS",
  TIKTOK_PROVIDER: "TIKTOK",
  PINTEREST_PROVIDER: "PINTEREST",
};

/**
 * Applies changes. For each key: a string sets the dashboard value; "" clears a
 * plain value (back to .env) and leaves a secret as it is; null clears either.
 */
export async function savePlatformSettings(principal: Principal, changes: Record<string, string | null>, request?: Request) {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only platform admins change deployment settings.");
  const unknown = Object.keys(changes).filter((k) => !specFor(k));
  if (unknown.length) throw new ApiError(422, "VALIDATION_FAILED", `Unknown setting: ${unknown.join(", ")}`);

  const rows = await db.platformSetting.findMany();
  const current = new Map<string, string>();
  for (const row of rows) {
    const plain =
      row.cipherText && row.iv && row.authTag
        ? decryptFor(PLATFORM_SECRET_SCOPE, { cipherText: row.cipherText, iv: row.iv, authTag: row.authTag })
        : row.value;
    if (plain) current.set(row.key, plain);
  }

  const next = new Map(current);
  const touched: string[] = [];
  for (const [key, raw] of Object.entries(changes)) {
    const spec = specFor(key)!;
    if (raw === null) {
      if (next.delete(key)) touched.push(key);
      continue;
    }
    const value = raw.trim();
    if (value === "") {
      if (!spec.secret && next.delete(key)) touched.push(key);
      continue;
    }
    if (spec.options && !spec.options.some((o) => o.value === value)) {
      throw new ApiError(422, "VALIDATION_FAILED", `${spec.label} must be one of: ${spec.options.map((o) => o.label).join(", ")}.`);
    }
    if (value.length > 2000) throw new ApiError(422, "VALIDATION_FAILED", `${spec.label} is too long.`);
    if (next.get(key) !== value) {
      next.set(key, value);
      touched.push(key);
    }
  }
  if (touched.length === 0) return platformSettingsStatus();

  const candidate = Object.fromEntries(next);
  const problems = validateEnvOverrides(candidate);
  if (problems.length) throw new ApiError(422, "VALIDATION_FAILED", `Those values would not work: ${problems.join("; ")}`);

  if (process.env.NODE_ENV === "production") {
    for (const [key, kind] of Object.entries(PROVIDER_KIND)) {
      const effective = candidate[key] ?? process.env[key];
      if (effective && isRefused(kind, effective, true)) {
        throw new ApiError(422, "STAND_IN_REFUSED", `${specFor(key)!.label}: the development stand-in cannot be used in production.`);
      }
    }
  }

  const needsVault = touched.some((k) => specFor(k)!.secret && next.has(k));
  if (needsVault && !secretsAvailable()) {
    throw new ApiError(503, "VAULT_UNAVAILABLE", "CREDENTIALS_KEY is not set on the server, so keys cannot be stored.");
  }

  await db.$transaction(
    touched.map((key) => {
      const spec = specFor(key)!;
      const value = next.get(key);
      if (value === undefined) return db.platformSetting.deleteMany({ where: { key } });
      const data = spec.secret
        ? (() => {
            const sealed = encryptFor(PLATFORM_SECRET_SCOPE, value);
            return { value: null, cipherText: sealed.cipherText, iv: sealed.iv, authTag: sealed.authTag, updatedById: principal.userId };
          })()
        : { value, cipherText: null, iv: null, authTag: null, updatedById: principal.userId };
      return db.platformSetting.upsert({ where: { key }, create: { key, ...data }, update: data });
    }),
  );

  await audit({
    organizationId: null,
    userId: principal.userId,
    action: "UPDATE",
    entity: "PlatformSetting",
    changes: { keys: touched.map((k) => ({ key: k, cleared: !next.has(k) })) },
    request,
  });

  await refreshPlatformConfig(true);
  return platformSettingsStatus();
}
