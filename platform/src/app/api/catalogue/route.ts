import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { createCatalogueItem, listCatalogueItems } from "@/server/catalogue";

const CreateBody = z.object({
  brandId: z.string().min(1),
  name: z.string().trim().min(1).max(300),
  sku: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().min(0).optional(),
  imageUrl: z.string().url().max(500).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

export const GET = handler({ permission: "catalogue:read" }, async ({ principal, searchParams }) => {
  const items = await listCatalogueItems(principal, searchParams.get("brandId") ?? undefined);
  return { items };
});

export const POST = handler({ permission: "catalogue:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, CreateBody);
  const item = await createCatalogueItem({
    ...input,
    organizationId: principal.organizationId!,
    createdById: principal.userId,
    request,
  });
  return { item };
});
