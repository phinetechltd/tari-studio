import { handler, parseBody } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { deleteTemplate, getTemplateFor, orgTemplateSchema, updateOrgTemplate } from "@/server/templates";

export const dynamic = "force-dynamic";

export const GET = handler<{ id: string }>({ permission: "template:read" }, async ({ principal, params }) => getTemplateFor(orgIdOf(principal), params.id));

/** Edits, publishes or changes the visibility of one of the organisation's own templates. */
export const PATCH = handler<{ id: string }>({ permission: "template:write" }, async ({ principal, request, params }) => {
  const input = await parseBody(request, orgTemplateSchema.partial());
  const t = await updateOrgTemplate(principal, params.id, input, request);
  return { id: t.id, status: t.status, visibility: t.visibility };
});

export const DELETE = handler<{ id: string }>({ permission: "template:write" }, async ({ principal, request, params }) => {
  await deleteTemplate(principal, params.id, request);
  return { deleted: true };
});
