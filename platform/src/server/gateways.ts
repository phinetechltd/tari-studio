import "server-only";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decryptFor, encryptFor, secretsAvailable } from "@/lib/secrets";

/**
 * Per-organisation gateway settings: the keys an Owner sets from the console,
 * stored in the Setting table (one row per gateway).
 *
 * Two rules shape this file.
 *
 *  - Agencies manage only their own social media app here. AI, image/video
 *    generation and payment credentials are platform-managed exclusively —
 *    they belong to the platform admin (console Deployment keys), and no
 *    agency setting may override or bypass them. Rows an older version stored
 *    for `gateway:ai`, `gateway:video` or `gateway:mpesa` are left in place
 *    but never read again (the catalog below is the allow-list).
 *  - Secrets are sealed at rest with the credentials vault (AES-256-GCM, bound
 *    to the organisation as AAD), never stored beside the non-secret config.
 *    Reads return a masked hint; only the action paths get the plaintext back,
 *    and only through resolveGateway().
 */

export type GatewayKey = "social";

export interface GatewayField {
  name: string;
  label: string;
  /** True when the value must be sealed at rest and masked on read. */
  secret: boolean;
  /** Where the deployment-level default comes from, for the status line. */
  envHint: string;
  placeholder?: string;
}

export const GATEWAYS: Record<GatewayKey, { name: string; summary: string; fields: GatewayField[] }> = {
  social: {
    name: "Social media (Meta)",
    summary: "Facebook Pages, Instagram and WhatsApp Cloud API app credentials — your own Meta app, if you bring one.",
    fields: [
      { name: "appId", label: "Meta app ID", secret: false, envHint: "META_APP_ID", placeholder: "e.g. 1234567890123456" },
      { name: "appSecret", label: "Meta app secret", secret: true, envHint: "META_APP_SECRET", placeholder: "Sealed at rest; leave blank to keep the current one" },
      { name: "webhookVerifyToken", label: "Webhook verify token", secret: true, envHint: "META_WEBHOOK_VERIFY_TOKEN", placeholder: "The string Meta echoes on registration" },
    ],
  },
};

const SETTING_KEY: Record<GatewayKey, string> = { social: "gateway:social" };

interface StoredGateway {
  config: Record<string, string>;
  secrets: Record<string, { cipherText: string; iv: string; authTag: string }>;
}

function isGatewayKey(k: string): k is GatewayKey {
  return k in GATEWAYS;
}

async function readStored(organizationId: string, gateway: GatewayKey): Promise<StoredGateway | null> {
  const row = await db.setting.findUnique({
    where: { organizationId_key: { organizationId, key: SETTING_KEY[gateway] } },
  });
  if (!row) return null;
  const value = row.value as unknown as StoredGateway;
  return value?.config ? value : null;
}

/** The deployment-level default for a field, for the status line. */
function envDefault(gateway: GatewayKey, field: string): string | undefined {
  const e = env();
  const map: Record<string, string | undefined> = {
    "social.appId": e.META_APP_ID,
    "social.appSecret": e.META_APP_SECRET,
    "social.webhookVerifyToken": e.META_WEBHOOK_VERIFY_TOKEN,
  };
  return map[`${gateway}.${field}`];
}

function mask(value: string): string {
  if (value.length <= 8) return "********";
  return "********" + value.slice(-4);
}

/**
 * What the console shows and the API returns: org values over deployment
 * defaults, secrets masked to a hint. Never hands back plaintext.
 */
export interface GatewayStatusField {
  name: string;
  label: string;
  secret: boolean;
  envHint: string;
  placeholder?: string;
  source: "org" | "deployment" | null;
  value: string | null;
}

export interface GatewayStatus {
  name: string;
  summary: string;
  vaultReady: boolean;
  fields: GatewayStatusField[];
}

export async function gatewayStatus(organizationId: string | null): Promise<{ gateways: Record<GatewayKey, GatewayStatus> }> {
  const vaultReady = secretsAvailable();
  const out = {} as Record<GatewayKey, GatewayStatus>;
  for (const key of Object.keys(GATEWAYS) as GatewayKey[]) {
    const spec = GATEWAYS[key];
    const stored = organizationId ? await readStored(organizationId, key) : null;
    out[key] = {
      name: spec.name,
      summary: spec.summary,
      vaultReady,
      fields: spec.fields.map((f): GatewayStatusField => {
        const orgValue = stored?.config[f.name];
        const hasSecret = Boolean(stored?.secrets[f.name]);
        const deploymentValue = envDefault(key, f.name);
        const active = f.secret ? (orgValue ?? hasSecret ? "org" : deploymentValue ? "deployment" : null) : (orgValue ?? deploymentValue) || null;
        return {
          name: f.name,
          label: f.label,
          secret: f.secret,
          envHint: f.envHint,
          placeholder: f.placeholder,
          /** Where the active value comes from: org setting or deployment env. */
          source: active ? (orgValue || (f.secret ? hasSecret : false) ? "org" : "deployment") : null,
          /** Masked hint for a secret, the value itself for plain fields. */
          value: active ? (f.secret ? mask(String(orgValue ?? deploymentValue ?? "")) : String(active)) : null,
        };
      }),
    };
  }
  return { gateways: out };
}

/**
 * Saves one gateway's settings. A blank secret keeps the stored one; "remove"
 * clears it. Secrets are sealed against the organisation, so a row lifted into
 * another org's setting cannot be decrypted.
 *
 * Anything but the social gateway is refused here as well as at the route —
 * an agency must never be able to store AI, generation or payment credentials.
 */
export async function saveGateway(organizationId: string, gateway: string, input: Record<string, unknown>) {
  if (!isGatewayKey(gateway)) {
    throw new ApiError(403, "FORBIDDEN", "AI, generation and payment credentials are managed by the platform, not by your agency. You can only manage your own social media app here.");
  }
  const spec = GATEWAYS[gateway];
  if (!secretsAvailable()) throw new Error("CREDENTIALS_KEY is not set on the server, so credentials cannot be stored.");

  const stored = (await readStored(organizationId, gateway)) ?? { config: {}, secrets: {} };
  const config: Record<string, string> = { ...stored.config };
  const secrets: StoredGateway["secrets"] = { ...stored.secrets };

  for (const f of spec.fields) {
    const raw = input[f.name];
    if (raw === undefined) continue; // not in the payload: leave as-is
    const value = String(raw ?? "").trim();
    if (f.secret) {
      if (value === "") continue; // blank keeps the current secret
      if (value.toLowerCase() === "remove") {
        delete secrets[f.name];
        delete config[f.name];
        continue;
      }
      secrets[f.name] = encryptFor(organizationId, value);
      delete config[f.name];
    } else {
      if (value === "") delete config[f.name];
      else config[f.name] = value;
    }
  }

  await db.setting.upsert({
    where: { organizationId_key: { organizationId, key: SETTING_KEY[gateway] } },
    create: { organizationId, key: SETTING_KEY[gateway], value: JSON.parse(JSON.stringify({ config, secrets })) },
    update: { value: JSON.parse(JSON.stringify({ config, secrets })) },
  });
  return gatewayStatus(organizationId);
}

/**
 * The plaintext merged view for the action paths: org values over deployment
 * defaults, secrets decrypted. This is the only way a saved key reaches a
 * provider call, and it refuses a secret that fails to unseal.
 */
export async function resolveGateway(organizationId: string, gateway: GatewayKey): Promise<Record<string, string>> {
  const spec = GATEWAYS[gateway];
  const stored = await readStored(organizationId, gateway);
  const out: Record<string, string> = {};
  for (const f of spec.fields) {
    const deploymentValue = envDefault(gateway, f.name);
    if (f.secret) {
      const sealed = stored?.secrets[f.name];
      if (sealed) {
        const plain = decryptFor(organizationId, sealed);
        if (!plain) throw new Error(`The stored ${f.label} could not be decrypted; save it again from Settings.`);
        out[f.name] = plain;
      } else if (deploymentValue) out[f.name] = deploymentValue;
    } else {
      const value = stored?.config[f.name] || deploymentValue;
      if (value) out[f.name] = value;
    }
  }
  return out;
}
