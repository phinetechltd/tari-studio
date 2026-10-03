import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { generateAi } from "@/server/ai";

/**
 * Free-form text generation. Requires `ai:generate` (role + AI_CONTENT licence);
 * every call is metered into AiUsage.
 */

const body = z.object({
  prompt: z.string().min(1).max(8000),
  tier: z.enum(["standard", "quick"]).optional(),
  maxTokens: z.number().int().positive().max(16000).optional(),
  system: z.string().max(8000).optional(),
});

export const POST = handler({ permission: "ai:generate" }, async ({ principal, request }) => {
  const { prompt, tier, maxTokens, system } = await parseBody(request, body);
  const result = await generateAi(prompt, { tier, maxTokens, system, feature: "generate" }, principal);
  return {
    text: result.text,
    provider: result.provider,
    model: result.model,
    requestId: result.requestId,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
});
