import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { setCampaignCharacter } from "@/server/characters";

export const dynamic = "force-dynamic";

const body = z.object({ characterId: z.string().min(1).max(40), attached: z.boolean() });

/** Add a character to a campaign, or take it out. */
export const POST = handler<{ id: string }>({ permission: "campaign:write" }, async ({ principal, request, params }) => {
  const input = await parseBody(request, body);
  await setCampaignCharacter(principal, params.id, input.characterId, input.attached, request);
  return { attached: input.attached };
});
