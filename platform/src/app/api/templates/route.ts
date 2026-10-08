import { handler, parseBody } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { createOrgTemplate, listForOrganization, orgTemplateSchema } from "@/server/templates";

export const dynamic = "force-dynamic";

/** Templates this organisation may see: the platform's, its own, and other organisations' public ones. */
export const GET = handler({ permission: "template:read" }, async ({ principal, searchParams }) => {
  return { templates: await listForOrganization(orgIdOf(principal), { usable: searchParams.get("usable") === "1" }) };
});

/** A new template of this organisation's own (a draft until it is published). */
export const POST = handler({ permission: "template:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, orgTemplateSchema);
  const t = await createOrgTemplate(principal, input, request);
  return { id: t.id };
});
