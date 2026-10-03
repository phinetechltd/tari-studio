import "server-only";

import { db } from "./db";
import { setEnvOverrides } from "./env";
import { PLATFORM_SETTING_KEYS } from "./platform-settings-catalog";
import { decryptFor } from "./secrets";

/**
 * Loads the platform admin's console settings (PlatformSetting rows) into the
 * env() overrides, at most every ten seconds per process. The web server calls
 * this per request and the worker per loop, so a key saved in the console
 * reaches every process within seconds without a restart.
 *
 * A database that cannot be read keeps the last values that loaded (and, at
 * start-up, the plain .env), so a brief outage never flips a live deployment
 * onto different credentials.
 */

export const PLATFORM_SECRET_SCOPE = "platform-settings";
const REFRESH_MS = 10_000;

let loadedAt = 0;
let inFlight: Promise<void> | null = null;

export function refreshPlatformConfig(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < REFRESH_MS) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const rows = await db.platformSetting.findMany();
      const next: Record<string, string> = {};
      for (const row of rows) {
        if (!PLATFORM_SETTING_KEYS.has(row.key)) continue;
        if (row.cipherText && row.iv && row.authTag) {
          const plain = decryptFor(PLATFORM_SECRET_SCOPE, { cipherText: row.cipherText, iv: row.iv, authTag: row.authTag });
          // Unreadable (CREDENTIALS_KEY rotated): fall back to .env rather than an empty key.
          if (plain) next[row.key] = plain;
        } else if (row.value) {
          next[row.key] = row.value;
        }
      }
      setEnvOverrides(next);
      loadedAt = Date.now();
    } catch {
      // Table missing (before migrate deploy) or database down: keep what we have.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
