import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { isSimulated } from "@/server/meta";
import { connectWhatsAppNumber } from "@/server/social";

const Body = z.object({
  brandId: z.string().min(1),
  phoneNumberId: z.string().trim().regex(/^[\w-]{5,40}$/, "Paste the Phone number ID from WhatsApp Manager."),
  businessAccountId: z.string().trim().max(40).optional(),
  accessToken: z.string().trim().min(20).max(1000),
  name: z.string().trim().max(120).optional(),
});

/**
 * Connects a WhatsApp Cloud API number. With the simulator, any id and a
 * placeholder token are accepted so the inbox can be tried end to end.
 */
export const POST = handler({ permission: "channel:connect" }, async ({ principal, request }) => {
  const input = await parseBody(request, Body);
  const channel = await connectWhatsAppNumber(principal, input);
  return { channel, simulated: isSimulated() };
});
