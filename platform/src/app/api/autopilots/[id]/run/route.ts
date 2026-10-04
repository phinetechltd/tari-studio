import { handler } from "@/lib/api";
import { runNow } from "@/server/autopilot";

export const dynamic = "force-dynamic";

/** Makes one post now, held for approval, so the person can see what Autopilot will do. */
export const POST = handler<{ id: string }>({ permission: "autopilot:write" }, async ({ principal, params, request }) => {
  return await runNow(principal, params.id, request);
});