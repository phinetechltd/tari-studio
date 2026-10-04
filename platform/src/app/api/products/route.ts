import { handler, parseBody } from "@/lib/api";
import { createProduct, listProducts, productSchema } from "@/server/products";
import { orgIdOf } from "@/lib/tenant";

export const GET = handler({ permission: "product:read" }, async ({ principal, searchParams }) => {
  const items = await listProducts(orgIdOf(principal), {
    brandId: searchParams.get("brandId") ?? undefined,
    q: searchParams.get("q")?.trim().slice(0, 80) || undefined,
    includeArchived: searchParams.get("archived") === "1",
    onlyLowStock: searchParams.get("lowStock") === "1",
  });
  return { items };
});

export const POST = handler({ permission: "product:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, productSchema);
  return { item: await createProduct(principal, input, request) };
});