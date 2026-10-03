import { z } from "zod";

import { handler, notFound, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { LIMIT_KEYS, PLAN_KEYS } from "@/lib/limits";
import { setOrganizationStatus, setPlan, updateLimits } from "@/server/organizations";
import { renameOrganization } from "@/server/platform-admin";

const limitValue = z.number().int().min(0).nullable();
const body = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    plan: z.enum(PLAN_KEYS).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    limits: z.record(z.enum(LIMIT_KEYS), limitValue).optional(),
  })
  .refine((b) => b.name || b.plan || b.status || b.limits, { message: "Nothing to change." });

export const PATCH = handler<{ id: string }>(
  { permission: "platform:manage", allowPlatform: true },
  async ({ principal, params, request }) => {
    const input = await parseBody(request, body);
    const exists = await db.organization.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) throw notFound("No such organisation.");

    if (input.name) await renameOrganization(principal, params.id, input.name, request);
    if (input.plan) await setPlan({ organizationId: params.id, plan: input.plan, byUserId: principal.userId });
    if (input.limits) {
      await updateLimits({
        organizationId: params.id,
        overrides: input.limits as Record<string, number | null>,
        byUserId: principal.userId,
      });
    }
    if (input.status) {
      await setOrganizationStatus({ organizationId: params.id, status: input.status, byUserId: principal.userId });
    }
    return { updated: true };
  },
);
