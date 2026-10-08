import "server-only";

import { env, isProduction } from "./env";

/**
 * A stand-in provider must never become a silent fallback.
 *
 * The console email adapter, the Meta simulator and the AI fixtures adapter all
 * exist so development and CI can run without live accounts. In production any
 * of them would make the product look like it works while sending nothing (or
 * posting to a fake Graph API), so production refuses to construct them at all.
 * The failure is loud and immediate, at the first call, not a quiet no-op.
 */

export type ProviderKind = "EMAIL" | "SMS" | "META" | "AI" | "PAYMENT" | "PAYSTACK" | "GENERATION" | "TIKTOK" | "PINTEREST";

const STAND_INS: Record<ProviderKind, string> = {
  EMAIL: "console",
  SMS: "console",
  META: "simulator",
  AI: "fixtures",
  PAYMENT: "simulator",
  PAYSTACK: "simulator",
  GENERATION: "simulator",
  TIKTOK: "simulator",
  PINTEREST: "simulator",
};

export class StandInProviderError extends Error {
  constructor(kind: ProviderKind, name: string) {
    super(
      `${kind}_PROVIDER="${name}" is a development stand-in and is refused in production. ` +
        `Configure a real provider.`,
    );
    this.name = "StandInProviderError";
  }
}

/**
 * The raw configured name for `kind`, with no production refusal.
 *
 * For labelling the UI only. Never call this to perform an action — use
 * providerName(), which is what keeps a stand-in from doing real work.
 */
export function configuredProviderName(kind: ProviderKind): string {
  const e = env();
  const names: Record<ProviderKind, string> = {
    EMAIL: e.EMAIL_PROVIDER,
    SMS: e.SMS_PROVIDER,
    META: e.META_PROVIDER,
    AI: e.AI_PROVIDER,
    PAYMENT: e.PAYMENT_PROVIDER,
    PAYSTACK: e.PAYSTACK_PROVIDER,
    GENERATION: e.GENERATION_PROVIDER,
    TIKTOK: e.TIKTOK_PROVIDER,
    PINTEREST: e.PINTEREST_PROVIDER,
  };
  return names[kind];
}

/** True when `kind` is still pointing at its development stand-in. */
export function isStandIn(kind: ProviderKind): boolean {
  return configuredProviderName(kind) === STAND_INS[kind];
}

/** The configured provider name for `kind`, refusing stand-ins in production. */
export function providerName(kind: ProviderKind): string {
  const name = configuredProviderName(kind);
  if (isProduction() && name === STAND_INS[kind]) throw new StandInProviderError(kind, name);
  return name;
}

/** Pure form for tests: the same rule without reading process state. */
export function isRefused(kind: ProviderKind, name: string, production: boolean): boolean {
  return production && name === STAND_INS[kind];
}
