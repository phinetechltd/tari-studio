import { handler, parseBody } from "@/lib/api";
import { memberPatchSchema, removeMember, updateMember } from "@/server/teams";

export const dynamic = "force-dynamic";

/** Change a member's role, suspend or restore them, or set their extra permissions. */
export const PATCH = handler<{ id: string }>({ permission: "member:write" }, async ({ principal, request, params }) => {
  const input = await parseBody(request, memberPatchSchema);
  const m = await updateMember(principal, params.id, input, request);
  return { id: m.id, role: m.role, status: m.status };
});

/** Remove a member from the team. */
export const DELETE = handler<{ id: string }>({ permission: "member:write" }, async ({ principal, request, params }) => {
  await removeMember(principal, params.id, request);
  return { removed: true };
});
