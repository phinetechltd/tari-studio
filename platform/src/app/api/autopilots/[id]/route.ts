import { handler, parseBody } from "@/lib/api";
import { autopilotUpdateSchema, deleteAutopilot, getAutopilot, updateAutopilot } from "@/server/autopilot";

export const dynamic = "force-dynamic";

export const GET = handler<{ id: string }>({ permission: "autopilot:read" }, async ({ principal, params }) => {
  return await getAutopilot(principal, params.id);
});

export const PATCH = handler<{ id: string }>({ permission: "autopilot:write" }, async ({ principal, params, request }) => {
  const input = await parseBody(request, autopilotUpdateSchema);
  return { item: await updateAutopilot(principal, params.id, input, request) };
});

export const DELETE = handler<{ id: string }>({ permission: "autopilot:write" }, async ({ principal, params, request }) => {
  await deleteAutopilot(principal, params.id, request);
  return { deleted: true };
});