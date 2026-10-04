import { ApiError, fail, handler } from "@/lib/api";
import { brandImageKey, clearBrandImage, setBrandImage } from "@/server/brand-profile";
import { readUploads, serveFile, UploadError } from "@/server/storage";

export const dynamic = "force-dynamic";

export const GET = handler<{ id: string }>({ permission: "brand:read" }, async ({ principal, request, params }) => {
  const key = await brandImageKey(principal, params.id, "logo");
  if (!key) return fail(404, "NOT_FOUND", "No logo yet.");
  return serveFile(key, request);
});

/** Replace the brand's logo. Multipart: one "file" part. */
export const POST = handler<{ id: string }>({ permission: "brand:write" }, async ({ principal, request, params }) => {
  let upload;
  try {
    upload = await readUploads(request, 1);
  } catch (e) {
    if (e instanceof UploadError) throw new ApiError(422, "VALIDATION_FAILED", e.message);
    throw e;
  }
  await setBrandImage(principal, params.id, "logo", upload.files[0]!, request);
  return { saved: true };
});

export const DELETE = handler<{ id: string }>({ permission: "brand:write" }, async ({ principal, params, request }) => {
  await clearBrandImage(principal, params.id, "logo", request);
  return { removed: true };
});
