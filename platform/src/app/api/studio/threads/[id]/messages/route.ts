import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { postMessage } from "@/server/studio";

export const dynamic = "force-dynamic";

const body = z.object({
  text: z.string().trim().min(1).max(4000),
  parentAssetId: z.string().max(40).optional(),
  templateId: z.string().max(40).nullable().optional(),
  characterIds: z.array(z.string().max(40)).max(3).optional(),
  campaignId: z.string().max(40).nullable().optional(),
});

/** A user turn. The reply is a quote; nothing is generated or charged until Generate is pressed. */
export const POST = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, request, params }) => {
  const input = await parseBody(request, body);
  return postMessage(orgIdOf(principal), params.id, input.text, {
    parentAssetId: input.parentAssetId,
    context: { templateId: input.templateId, characterIds: input.characterIds, campaignId: input.campaignId },
  });
});
