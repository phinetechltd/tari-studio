import { ApiError, handler } from "@/lib/api";
import { hit } from "@/lib/ratelimit";
import { AiNotConfiguredError, aiStatus, generateAi } from "@/server/ai";

/**
 * A live round trip to the configured model: proves the key, the model name and
 * the network path in one click. Metered like any other call (a few tokens).
 */
export const POST = handler({ permission: "ai:generate" }, async ({ principal }) => {
  const limit = await hit(`ai-test:${principal.organizationId}`, { limit: 10, windowSec: 3600 });
  if (!limit.allowed) throw new ApiError(429, "RATE_LIMITED", "Connection tests are limited to ten an hour.");
  try {
    const result = await generateAi(
      "Reply with exactly: Connected. Then, in one short sentence, name one thing a Kenyan shop could post on Facebook this week.",
      { tier: "standard", maxTokens: 400, feature: "connection_test" },
      principal,
    );
    return {
      ok: true,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      sample: result.text.slice(0, 300),
    };
  } catch (error) {
    return {
      ok: false,
      notConfigured: error instanceof AiNotConfiguredError,
      error: error instanceof Error ? error.message : String(error),
      status: aiStatus(),
    };
  }
});
