import { ApiError, handler } from "@/lib/api";
import { addProductImages, MAX_PRODUCT_IMAGES } from "@/server/products";
import { readUploads, UploadError } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Add pictures to a product. Multipart: one or more `file` parts. */
export const POST = handler<{ id: string }>({ permission: "product:write" }, async ({ principal, request, params }) => {
  let upload;
  try {
    upload = await readUploads(request, MAX_PRODUCT_IMAGES);
  } catch (e) {
    if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
    throw e;
  }
  const ids = await addProductImages(principal, params.id, upload.files, request);
  return { added: ids.length };
});