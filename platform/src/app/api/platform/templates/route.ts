import { ApiError, handler, parseBody } from "@/lib/api";
import { createTemplate, templateSchema } from "@/server/templates";

export const dynamic = "force-dynamic";

/** Create a template (platform admins only). */
export const POST = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before publishing templates.");
  const input = await parseBody(request, templateSchema);
  const t = await createTemplate(principal, input, request);
  return { id: t.id };
});
