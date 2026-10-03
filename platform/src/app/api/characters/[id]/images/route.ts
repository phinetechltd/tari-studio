import { ApiError, handler } from "@/lib/api";
import { addCharacterImages, MAX_CHARACTER_IMAGES } from "@/server/characters";
import { readUploads, UploadError } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Add images to a character. Multipart: one or more `file` parts. */
export const POST = handler<{ id: string }>({ permission: "character:write" }, async ({ principal, request, params }) => {
  let upload;
  try {
    upload = await readUploads(request, MAX_CHARACTER_IMAGES);
  } catch (e) {
    if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
    throw e;
  }
  const ids = await addCharacterImages(principal, params.id, upload.files, request);
  return { added: ids.length };
});
