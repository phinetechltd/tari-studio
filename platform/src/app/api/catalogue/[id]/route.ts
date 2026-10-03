import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { deleteCatalogueItem, updateCatalogueItem } from "@/server/catalogue";

const UpdateBody = z.object({
  name: z.string().trim().min(1).max(300).optional(),
  sku: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  imageUrl: z.string().url().max(500).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const PATCH = handler<{ id: string }>({ permission: "catalogue:write" }, async ({ principal, params, request }) => {
  const input = await parseBody(request, UpdateBody);
  return { item: await updateCatalogueItem(principal, params.id, input) };
});

export const DELETE = handler<{ id: string }>({ permission: "catalogue:write" }, async ({ principal, params }) => {
  await deleteCatalogueItem(principal, params.id);
  return { archived: true };
});
