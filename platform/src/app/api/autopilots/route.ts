import { handler, parseBody } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { autopilotSchema, createAutopilot, listAutopilots } from "@/server/autopilot";

export const dynamic = "force-dynamic";

export const GET = handler({ permission: "autopilot:read" }, async ({ principal }) => {
  return { items: await listAutopilots(orgIdOf(principal)) };
});

/** Creates an Autopilot. Answers 409 REQUIREMENTS_UNMET, naming what is missing, until the essentials are in place. */
export const POST = handler({ permission: "autopilot:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, autopilotSchema);
  return { item: await createAutopilot(principal, input, request) };
});