import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { draftCaption } from "@/server/copywriter";

const Body = z.object({
  brandId: z.string().min(1),
  platform: z.enum(["FACEBOOK", "INSTAGRAM", "WHATSAPP"]),
  brief: z.string().trim().min(3).max(1500),
  link: z.string().url().max(2000).nullable().optional(),
});

/** A caption drafted from the brief and the brand's own catalogue facts. */
export const POST = handler({ permission: "ai:generate" }, async ({ principal, request }) => {
  const input = await parseBody(request, Body);
  return draftCaption(principal, input);
});
