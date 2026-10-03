import { ApiError, handler, parseBody } from "@/lib/api";
import { deleteTemplate, templateSchema, updateTemplate } from "@/server/templates";

export const dynamic = "force-dynamic";

export const PATCH = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request, params }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before publishing templates.");
  const input = await parseBody(request, templateSchema.partial());
  const t = await updateTemplate(principal, params.id, input, request);
  return { id: t.id, status: t.status };
});

export const DELETE = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request, params }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before deleting templates.");
  await deleteTemplate(principal, params.id, request);
  return { deleted: true };
});
