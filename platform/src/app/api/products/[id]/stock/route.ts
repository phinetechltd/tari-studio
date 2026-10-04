import { handler, parseBody } from "@/lib/api";
import { adjustStock, listMovements, stockSchema } from "@/server/products";

export const dynamic = "force-dynamic";

export const GET = handler<{ id: string }>({ permission: "product:read" }, async ({ principal, params }) => {
  return { movements: await listMovements(principal, params.id) };
});

/** Add or remove units (`delta`) or set the count (`setTo`). Never goes below zero. */
export const POST = handler<{ id: string }>({ permission: "product:stock" }, async ({ principal, params, request }) => {
  const input = await parseBody(request, stockSchema);
  return await adjustStock(principal, params.id, input, request);
});