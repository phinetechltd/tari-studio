import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { getAiSettings, saveAiSettings } from "@/server/settings";

/**
 * AI settings for the current organisation.
 *
 * GET returns the current settings (apiKey is returned masked).
 * PUT saves the settings.
 */

const putBody = z.object({
  apiKey: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(16384).optional(),
  system: z.string().optional(),
});

function maskApiKey(key: string): string {
  if (key.length <= 8) return "********";
  return "********" + key.slice(-4);
}

export const GET = handler({ authOnly: true }, async ({ principal }) => {
  if (!principal.organizationId) {
    return { settings: null };
  }
  const settings = await getAiSettings(principal.organizationId);
  if (!settings) return { settings: null };
  return {
    settings: {
      ...settings,
      apiKey: maskApiKey(settings.apiKey),
    },
  };
});

export const PUT = handler({ permission: "org:write" }, async ({ principal, request }) => {
  if (!principal.organizationId) {
    throw new Error("Settings require an organisation.");
  }
  const input = await parseBody(request, putBody);
  const settings = await saveAiSettings(principal.organizationId, input);
  return {
    settings: {
      ...settings,
      apiKey: maskApiKey(settings.apiKey),
    },
  };
});
