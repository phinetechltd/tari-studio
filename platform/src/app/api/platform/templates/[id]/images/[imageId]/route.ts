import { ApiError, handler } from "@/lib/api";
import { removeTemplateImage } from "@/server/templates";

export const dynamic = "force-dynamic";

export const DELETE = handler<{ id: string; imageId: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request, params }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing templates.");
  await removeTemplateImage(principal, params.id, params.imageId, request);
  return { deleted: true };
});
