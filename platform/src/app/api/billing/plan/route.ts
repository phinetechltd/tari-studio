import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { BILLING_CYCLES } from "@/lib/pricing";
import { orgIdOf } from "@/lib/tenant";
import { getSubscription, payForPlan, setAutoRenew } from "@/server/subscriptions";

export const dynamic = "force-dynamic";

/** The organisation's plan. */
export const GET = handler({ permission: "org:read" }, async ({ principal }) => getSubscription(orgIdOf(principal)));

const payBody = z.object({
  plan: z.enum(["BASIC", "PRO", "MAX"]),
  cycle: z.enum(BILLING_CYCLES),
  method: z.enum(["MPESA", "PAYSTACK"]),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(254).optional(),
});

/** Pays for a plan (new, renewal or change). The plan starts once the provider confirms. */
export const POST = handler({ permission: "org:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, payBody);
  return payForPlan({ organizationId: orgIdOf(principal), userId: principal.userId, request }, input.plan, input.cycle, input);
});

const patchBody = z.object({ autoRenew: z.boolean() });

/** Turns renewal off (cancel at the end of the period) or back on. */
export const PATCH = handler({ permission: "org:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, patchBody);
  return setAutoRenew({ organizationId: orgIdOf(principal), userId: principal.userId, request }, input.autoRenew);
});
