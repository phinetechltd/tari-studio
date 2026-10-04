import { fail, handler } from "@/lib/api";
import { productImageFile } from "@/server/products";
import { serveFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/** A product picture, served only to the organisation that owns it. */
export const GET = handler<{ id: string }>({ permission: "product:read" }, async ({ principal, request, params }) => {
  const key = await productImageFile(principal, params.id);
  if (!key) return fail(404, "NOT_FOUND", "Picture not found.");
  return serveFile(key, request);
});