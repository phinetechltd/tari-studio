import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { simulateInbound } from "@/server/whatsapp";

const Body = z.object({
  channelId: z.string().min(1),
  from: z.string().trim().min(6).max(30),
  name: z.string().trim().max(80).optional(),
  body: z.string().trim().min(1).max(1000),
});

/**
 * Sends a customer message into the inbox through the real webhook path.
 * Refused unless META_PROVIDER is the simulator (so never in production).
 */
export const POST = handler({ permission: "inbox:reply" }, async ({ principal, request }) => {
  const input = await parseBody(request, Body);
  return simulateInbound(principal, input);
});
