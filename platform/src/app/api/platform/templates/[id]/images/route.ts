import { ApiError, handler } from "@/lib/api";
import { readUploads, UploadError } from "@/server/storage";
import { addTemplateImages, MAX_TEMPLATE_IMAGES } from "@/server/templates";

export const dynamic = "force-dynamic";

/** Add images to a template's pack. Multipart: one or more `file` parts and an optional `caption`. */
export const POST = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request, params }) => {
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before publishing templates.");
  let upload;
  try {
    upload = await readUploads(request, MAX_TEMPLATE_IMAGES);
  } catch (e) {
    if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
    throw e;
  }
  const ids = await addTemplateImages(principal, params.id, upload.files, upload.fields.caption?.trim().slice(0, 200) || null, request);
  return { added: ids.length };
});
