import { handler, parseBody } from "@/lib/api";
import { archiveProduct, getProduct, productUpdateSchema, updateProduct } from "@/server/products";

export const GET = handler<{ id: string }>({ permission: "product:read" }, async ({ principal, params }) => {
  return { item: await getProduct(principal, params.id) };
});

export const PATCH = handler<{ id: string }>({ permission: "product:write" }, async ({ principal, params, request }) => {
  const input = await parseBody(request, productUpdateSchema);
  return { item: await updateProduct(principal, params.id, input, request) };
});

/** Archives (hides) the product; its pictures and stock history are kept. */
export const DELETE = handler<{ id: string }>({ permission: "product:write" }, async ({ principal, params, request }) => {
  await archiveProduct(principal, params.id, request);
  return { archived: true };
});