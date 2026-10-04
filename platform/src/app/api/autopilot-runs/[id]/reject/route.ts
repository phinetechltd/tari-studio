import { handler } from "@/lib/api";
import { rejectRun } from "@/server/autopilot";

export const dynamic = "force-dynamic";

/** Throws away a post an Autopilot made without sending it. */
export const POST = handler<{ id: string }>({ permission: "post:schedule" }, async ({ principal, params, request }) => {
  await rejectRun(principal, params.id, request);
  return { rejected: true };
});