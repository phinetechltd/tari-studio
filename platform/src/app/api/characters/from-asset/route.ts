import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { characterFromAsset, characterSchema } from "@/server/characters";

export const dynamic = "force-dynamic";

const body = characterSchema.extend({ assetId: z.string().min(1).max(40) });

/** Keep a finished generated image as a new character. */
export const POST = handler({ permission: "character:write" }, async ({ principal, request }) => {
  const { assetId, ...input } = await parseBody(request, body);
  const c = await characterFromAsset(principal, assetId, input, request);
  return { id: c.id };
});
