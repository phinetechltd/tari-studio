import { handler } from "@/lib/api";
import { createAutomation, listAutomations, recentRuns } from "@/server/automations";

export const GET = handler({ permission: "inbox:read" }, async ({ principal }) => {
  const [automations, runs] = await Promise.all([listAutomations(principal), recentRuns(principal)]);
  return { automations, runs };
});

export const POST = handler({ permission: "automation:write" }, async ({ principal, request }) => {
  const body = await request.json().catch(() => null);
  return { automation: await createAutomation(principal, body) };
});
