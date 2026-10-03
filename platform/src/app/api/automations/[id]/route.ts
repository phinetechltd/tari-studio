import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { deleteAutomation, setAutomationEnabled, updateAutomation } from "@/server/automations";

/** Replaces the whole rule (the edit form sends everything). */
export const PUT = handler<{ id: string }>({ permission: "automation:write" }, async ({ principal, params, request }) => {
  const body = await request.json().catch(() => null);
  return { automation: await updateAutomation(principal, params.id, body) };
});

/** Switches a rule on or off. */
export const PATCH = handler<{ id: string }>({ permission: "automation:write" }, async ({ principal, params, request }) => {
  const { enabled } = await parseBody(request, z.object({ enabled: z.boolean() }));
  return { automation: await setAutomationEnabled(principal, params.id, enabled) };
});

export const DELETE = handler<{ id: string }>({ permission: "automation:write" }, async ({ principal, params }) => {
  await deleteAutomation(principal, params.id);
  return { deleted: true };
});
