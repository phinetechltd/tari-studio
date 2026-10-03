import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { deriveQuote } from "@/server/studio";

export const dynamic = "force-dynamic";

const body = z.object({ assetId: z.string().max(40), mode: z.enum(["animate", "extend"]) });

/** Starts an animate (image to video) or extend (longer clip) quote from a finished asset. */
export const POST = handler({ permission: "ai:generate" }, async ({ principal, request }) => {
  const { assetId, mode } = await parseBody(request, body);
  return deriveQuote(orgIdOf(principal), assetId, mode);
});
