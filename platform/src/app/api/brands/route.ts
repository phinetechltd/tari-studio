import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { createBrand, listBrands } from "@/server/brands";

const CreateBrandBody = z.object({
  name: z.string().trim().min(2).max(200),
  avatarUrl: z.string().url().max(500).optional(),
  guidelines: z.record(z.unknown()).optional(),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email().max(254).optional(),
  contactPhone: z.string().max(50).optional(),
  website: z.string().url().max(500).optional(),
  timezone: z.string().max(100).optional(),
  defaultCurrency: z.string().max(10).optional(),
});

export const GET = handler({ permission: "brand:read" }, async ({ principal, searchParams }) => {
  const brands = await listBrands(principal, searchParams.get("includeArchived") === "true");
  return { brands };
});

export const POST = handler({ permission: "brand:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, CreateBrandBody);
  const brand = await createBrand({
    ...input,
    organizationId: principal.organizationId!,
    createdById: principal.userId,
    request,
  });
  return { brand };
});
