import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { insideServiceWindow } from "@/lib/automation-rules";
import { getConversation, markConversationRead, updateConversation } from "@/server/whatsapp";

const Body = z.object({
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  automationsPaused: z.boolean().optional(),
});

/** A conversation with its messages. Reading it marks it read. */
export const GET = handler<{ id: string }>({ permission: "inbox:read" }, async ({ principal, params }) => {
  const conversation = await getConversation(principal, params.id);
  await markConversationRead(principal, params.id);
  return { conversation, canReply: insideServiceWindow(conversation.lastInboundAt) };
});

export const PATCH = handler<{ id: string }>({ permission: "inbox:reply" }, async ({ principal, params, request }) => {
  const input = await parseBody(request, Body);
  return { conversation: await updateConversation(principal, params.id, input) };
});
