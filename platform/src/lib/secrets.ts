import "server-only";

import crypto from "node:crypto";

/**
 * Credential encryption for things the platform must be able to use again:
 * Meta access tokens, and each user's TOTP seed.
 *
 * AES-256-GCM, with a **scope id bound in as additional authenticated data**.
 * For channel tokens the scope is the organisation; for a TOTP seed it is the
 * user. A cipher text lifted out of one scope's row and pasted into another's
 * fails to decrypt rather than quietly handing the second scope the first
 * one's secret. Row-level tenancy mistakes are the likeliest way a multi-tenant
 * product leaks, so the cryptography is made to catch them instead of trusting
 * the query.
 *
 * The master key lives in `CREDENTIALS_KEY`; a database dump on its own is
 * inert. Rotating the key makes every stored secret unreadable, which is why
 * callers treat "cannot decrypt" as "not configured" and fail closed.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96 bits, the GCM standard

export interface SealedSecret {
  cipherText: string;
  iv: string;
  authTag: string;
}

/** Thrown when the deployment has no usable key. Never carries key material. */
export class SecretsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsUnavailableError";
  }
}

function masterKey(): Buffer | null {
  const raw = process.env.CREDENTIALS_KEY;
  if (!raw) return null;

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  // A short key would still "work" in the sense of not throwing here, and would
  // silently weaken everything, so the length is a hard requirement.
  return key.length === KEY_BYTES ? key : null;
}

/**
 * Whether this deployment can store secrets at all. Callers use it to report a
 * feature as unconfigured *before* someone types a secret into a form that
 * cannot keep it.
 */
export function secretsAvailable(): boolean {
  return masterKey() !== null;
}

/** Generates a key suitable for CREDENTIALS_KEY. Tooling only, never at runtime. */
export function generateMasterKey(): string {
  return crypto.randomBytes(KEY_BYTES).toString("base64");
}

export function encryptFor(scopeId: string, plaintext: string): SealedSecret {
  const key = masterKey();
  if (!key) {
    throw new SecretsUnavailableError(
      "CREDENTIALS_KEY is not set, so secrets cannot be stored.",
    );
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(scopeId, "utf8"));

  const cipherText = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    cipherText: cipherText.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Returns null when the secret cannot be authenticated — a wrong key, a
 * tampered row, or a blob belonging to a different scope. Callers treat that as
 * "not configured", which fails closed.
 */
export function decryptFor(scopeId: string, sealed: SealedSecret): string | null {
  const key = masterKey();
  if (!key) return null;

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, "base64"));
    decipher.setAAD(Buffer.from(scopeId, "utf8"));
    decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(sealed.cipherText, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // GCM raises on a failed tag check — that is its whole point. The reason is
    // never reported outward: it would tell an attacker which of the key, the
    // tag or the AAD was wrong.
    return null;
  }
}

/** Convenience for credential bundles, which are objects rather than strings. */
export function sealJson(scopeId: string, value: unknown): SealedSecret {
  return encryptFor(scopeId, JSON.stringify(value));
}

export function openJson<T>(scopeId: string, sealed: SealedSecret): T | null {
  const raw = decryptFor(scopeId, sealed);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Masks a secret for display. The last four characters are kept so an admin can
 * tell which token is loaded without the value ever going back over the wire.
 */
export function maskSecret(value: string): string {
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}
