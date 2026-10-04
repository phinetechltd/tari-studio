import { ApiError, handler } from "@/lib/api";
import { readUploads, UploadError } from "@/server/storage";
import { addTemplateImages, MAX_TEMPLATE_IMAGES } from "@/server/templates";

export const dynamic = "force-dynamic";

/** Adds uploaded images to one of the organisation's own templates. Multipart: `file` parts and an optional `caption`. */
export const POST = handler<{ id: string }>({ permission: "template:write" }, async ({ principal, request, params }) => {
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
