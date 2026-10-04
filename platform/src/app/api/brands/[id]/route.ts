import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { deleteBrand, getBrandById, updateBrand } from "@/server/brands";

const UpdateBody = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  slogan: z.string().trim().max(160).nullable().optional(),
  guidelines: z.record(z.unknown()).optional(),
  contactName: z.string().max(200).nullable().optional(),
  contactEmail: z.string().email().max(254).nullable().optional(),
  contactPhone: z.string().max(50).nullable().optional(),
  website: z.string().url().max(500).nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  timezone: z.string().max(100).optional(),
  defaultCurrency: z.string().max(10).optional(),
});

export const GET = handler<{ id: string }>({ permission: "brand:read" }, async ({ principal, params }) => {
  return { brand: await getBrandById(principal, params.id) };
});

export const PATCH = handler<{ id: string }>({ permission: "brand:write" }, async ({ principal, params, request }) => {
  const input = await parseBody(request, UpdateBody);
  return { brand: await updateBrand(principal, params.id, input) };
});

export const DELETE = handler<{ id: string }>({ permission: "brand:write" }, async ({ principal, params }) => {
  await deleteBrand(principal, params.id);
  return { archived: true };
});
