/**
 * AI model catalogue: which models the platform calls, what they cost, and how
 * the fallback chain is written in the environment. Pure, so it is unit-tested.
 *
 * Prices are the provider's published list prices in US$ per million tokens,
 * kept as micro-dollars per million (1 000 000 = US$1). AiUsage.costMicros is
 * computed from the provider's own token counts, never estimated.
 */

export const DEFAULT_MODEL = "claude-sonnet-5";
export const DEFAULT_QUICK_MODEL = "claude-haiku-4-5";

interface Price {
  inputPerMTok: number;
  outputPerMTok: number;
}

const PRICES: Record<string, Price> = {
  "claude-opus-5": { inputPerMTok: 5_000_000, outputPerMTok: 25_000_000 },
  "claude-sonnet-5": { inputPerMTok: 2_000_000, outputPerMTok: 10_000_000 },
  "claude-haiku-4-5": { inputPerMTok: 1_000_000, outputPerMTok: 5_000_000 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Cost in micro-dollars. Unknown models (self-hosted, fixtures) cost 0 rather than a guess. */
export function costMicros(model: string, usage: TokenUsage): number {
  const price = PRICES[model];
  if (!price) return 0;
  const perToken = (perMTok: number) => perMTok / 1_000_000;
  const total =
    usage.inputTokens * perToken(price.inputPerMTok) +
    usage.outputTokens * perToken(price.outputPerMTok) +
    (usage.cacheReadTokens ?? 0) * perToken(price.inputPerMTok) * 0.1 +
    (usage.cacheWriteTokens ?? 0) * perToken(price.inputPerMTok) * 1.25;
  return Math.round(total);
}

/** Sonnet 5 and Opus take an effort level; Haiku 4.5 rejects the parameter. */
export function supportsEffort(model: string): boolean {
  return /^claude-(sonnet-5|opus-5)/.test(model);
}

export type ProviderName = "anthropic" | "nvidia" | "fixtures";

export interface ChainEntry {
  provider: ProviderName;
  model?: string;
}

const PROVIDERS: ReadonlySet<string> = new Set(["anthropic", "nvidia", "fixtures"]);

/**
 * "anthropic:claude-sonnet-5, nvidia:moonshotai/kimi-k3, fixtures" → entries.
 * The model half may itself contain a colon or slash, so only the first colon splits.
 * Unknown providers are dropped rather than failing every request at run time.
 */
export function parseChain(raw: string | undefined | null, fallbackProvider: string): ChainEntry[] {
  const entries: ChainEntry[] = [];
  for (const part of (raw ?? "").split(",").map((p) => p.trim()).filter(Boolean)) {
    const i = part.indexOf(":");
    const provider = (i === -1 ? part : part.slice(0, i)).trim().toLowerCase();
    const model = i === -1 ? undefined : part.slice(i + 1).trim() || undefined;
    if (PROVIDERS.has(provider)) entries.push({ provider: provider as ProviderName, model });
  }
  if (entries.length > 0) return entries;
  return PROVIDERS.has(fallbackProvider) ? [{ provider: fallbackProvider as ProviderName }] : [{ provider: "fixtures" }];
}
