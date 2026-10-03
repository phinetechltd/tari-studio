import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { messageDetail, updateQuote } from "@/server/studio";

export const dynamic = "force-dynamic";

/** Polled while a generation runs. */
export const GET = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, params }) => {
  return messageDetail(orgIdOf(principal), params.id);
});

const patch = z.object({
  seconds: z.number().int().optional(),
  aspectRatio: z.string().max(8).optional(),
  prompt: z.string().max(2000).optional(),
  mode: z.enum(["image", "video"]).optional(),
  modelKey: z.string().min(1).max(60).optional(),
});

/** Adjusts a quote before it is generated. */
export const PATCH = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, request, params }) => {
  const input = await parseBody(request, patch);
  return updateQuote(orgIdOf(principal), params.id, input);
});
