import { handler, notFound } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { revokeInvite } from "@/server/invites";

export const DELETE = handler<{ id: string }>({ permission: "member:write" }, async ({ principal, params }) => {
  const revoked = await revokeInvite(orgIdOf(principal), params.id, principal.userId);
  if (!revoked) throw notFound("That invitation is not open.");
  return { revoked: true };
});
