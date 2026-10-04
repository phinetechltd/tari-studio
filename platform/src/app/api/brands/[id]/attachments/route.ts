import { ApiError, handler } from "@/lib/api";
import { addAttachments, MAX_BRAND_ATTACHMENTS } from "@/server/brand-profile";
import { readUploads, UploadError } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Keep pictures or documents (PDF, Word, Excel, PowerPoint) with the brand. Multipart: `file` parts. */
export const POST = handler<{ id: string }>({ permission: "brand:write" }, async ({ principal, request, params }) => {
  let upload;
  try {
    upload = await readUploads(request, MAX_BRAND_ATTACHMENTS);
  } catch (e) {
    if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
    throw e;
  }
  const ids = await addAttachments(principal, params.id, upload.files, request);
  return { added: ids.length };
});