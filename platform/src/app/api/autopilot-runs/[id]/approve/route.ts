import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { approveRun } from "@/server/autopilot";

export const dynamic = "force-dynamic";

const body = z.object({ caption: z.string().trim().max(2200).optional() });

/** Approves a post an Autopilot made and sends it out. The caption can be changed first. */
export const POST = handler<{ id: string }>({ permission: "post:schedule" }, async ({ principal, params, request }) => {
  const { caption } = await parseBody(request, body);
  await approveRun(principal, params.id, { caption }, request);
  return { approved: true };
});