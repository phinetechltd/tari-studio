import { handler } from "@/lib/api";
import { deleteTrackedLink } from "@/server/campaigns";

export const DELETE = handler<{ id: string; linkId: string }>({ permission: "link:write" }, async ({ principal, params }) => {
  await deleteTrackedLink(principal, params.id, params.linkId);
  return { deleted: true };
});
