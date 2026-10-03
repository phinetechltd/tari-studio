import "server-only";

import { db } from "@/lib/db";

/**
 * Per-organization AI settings — API key, default model, temperature, etc.
 *
 * Stored as JSON in the Setting table (key = "ai"), alongside the other
 * per-organisation configuration. One row per org, created on first write.
 */

export interface AiSettings {
  /** NVIDIA API key (or other provider key). Stored encrypted at rest in a later phase. */
  apiKey: string;
  /** Default model for generation, e.g. "moonshotai/kimi-k3". */
  model: string;
  /** Default temperature (0-2). */
  temperature: number;
  /** Default max tokens (1-16384). */
  maxTokens: number;
  /** Optional system prompt prepended to every generation. */
  system: string;
}

const AI_SETTING_KEY = "ai";

export async function getAiSettings(organizationId: string): Promise<AiSettings | null> {
  const setting = await db.setting.findUnique({
    where: { organizationId_key: { organizationId, key: AI_SETTING_KEY } },
  });
  if (!setting) return null;
  return JSON.parse(JSON.stringify(setting.value)) as AiSettings;
}

export async function saveAiSettings(
  organizationId: string,
  input: Partial<AiSettings>,
): Promise<AiSettings> {
  const existing = await getAiSettings(organizationId);
  const merged: AiSettings = {
    apiKey: input.apiKey ?? existing?.apiKey ?? "",
    model: input.model ?? existing?.model ?? "nvidia-nemotron-3-ultra",
    temperature: input.temperature ?? existing?.temperature ?? 1,
    maxTokens: input.maxTokens ?? existing?.maxTokens ?? 4096,
    system: input.system ?? existing?.system ?? "",
  };

  await db.setting.upsert({
    where: { organizationId_key: { organizationId, key: AI_SETTING_KEY } },
    create: { organizationId, key: AI_SETTING_KEY, value: JSON.parse(JSON.stringify(merged)) as any },
    update: { value: JSON.parse(JSON.stringify(merged)) as any },
  });

  return merged;
}
