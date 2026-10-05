import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { decideProposal } from "@/server/assistant";

export const dynamic = "force-dynamic";

const body = z.object({ action: z.enum(["apply", "dismiss"]) });

/** The person's answer to a proposal the assistant made: apply it (runs under their permissions) or dismiss it. */
export const POST = handler<{ id: string }>({ permission: "assistant:use" }, async ({ principal, request, params }) => {
  const { action } = await parseBody(request, body);
  return decideProposal(principal, params.id, action, request);
});
