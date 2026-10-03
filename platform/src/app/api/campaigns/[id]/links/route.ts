import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { createTrackedLink } from "@/server/campaigns";

const Body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("whatsapp"),
    label: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(6).max(30),
    message: z.string().trim().min(1).max(500),
  }),
  z.object({
    kind: z.literal("web"),
    label: z.string().trim().min(1).max(80),
    destinationUrl: z.string().trim().url().max(2000),
  }),
]);

export const POST = handler<{ id: string }>({ permission: "link:write" }, async ({ principal, params, request }) => {
  const input = await parseBody(request, Body);
  return { link: await createTrackedLink(principal, params.id, input, request) };
});
