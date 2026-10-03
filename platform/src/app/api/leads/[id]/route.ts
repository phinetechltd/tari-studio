import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { STAGES } from "@/lib/automation-rules";
import { updateContact } from "@/server/whatsapp";

const Body = z.object({
  stage: z.enum(STAGES).optional(),
  notes: z.string().max(4000).nullable().optional(),
  name: z.string().trim().max(120).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export const PATCH = handler<{ id: string }>({ permission: "lead:write" }, async ({ principal, params, request }) => {
  const input = await parseBody(request, Body);
  return { contact: await updateContact(principal, params.id, input, request) };
});
