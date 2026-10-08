import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { reviseQuote } from "@/server/studio";

export const dynamic = "force-dynamic";

const body = z.object({ assetId: z.string().max(40), suggestions: z.string().max(1000) });

/** A new quote from a finished result, with the person's suggestions added. Charges nothing until generated. */
export const POST = handler({ permission: "ai:generate" }, async ({ principal, request }) => {
  const { assetId, suggestions } = await parseBody(request, body);
  return reviseQuote(orgIdOf(principal), assetId, suggestions);
});