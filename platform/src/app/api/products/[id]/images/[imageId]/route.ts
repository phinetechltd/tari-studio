import { handler } from "@/lib/api";
import { removeProductImage } from "@/server/products";

export const DELETE = handler<{ id: string; imageId: string }>({ permission: "product:write" }, async ({ principal, params, request }) => {
  await removeProductImage(principal, params.id, params.imageId, request);
  return { removed: true };
});