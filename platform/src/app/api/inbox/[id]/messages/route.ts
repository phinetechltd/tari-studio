import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { hit } from "@/lib/ratelimit";
import { replyAsPerson } from "@/server/whatsapp";

const Body = z.object({ text: z.string().trim().min(1).max(4096) });

export const POST = handler<{ id: string }>({ permission: "inbox:reply" }, async ({ principal, params, request }) => {
  const { text } = await parseBody(request, Body);
  // A stuck key or a script should not be able to flood a customer.
  const limit = await hit(`wa-reply:${params.id}`, { limit: 20, windowSec: 60 });
  if (!limit.allowed) throw new ApiError(429, "RATE_LIMITED", "That is a lot of messages at once. Wait a minute before sending more.");
  return { message: await replyAsPerson(principal, params.id, text, request) };
});
