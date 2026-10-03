import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { draftWhatsAppReply } from "@/server/copywriter";

const Body = z.object({ instructions: z.string().max(1000).optional() });

/** Drafts a reply from the conversation and the brand's catalogue. Nothing is sent. */
export const POST = handler<{ id: string }>({ permission: "inbox:reply" }, async ({ principal, params, request }) => {
  const { instructions } = await parseBody(request, Body);
  const text = await draftWhatsAppReply({ organizationId: orgIdOf(principal), conversationId: params.id, instructions, principal });
  return { text };
});
