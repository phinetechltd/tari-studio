import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { archiveCampaign, CAMPAIGN_STATUSES, getCampaignDetail, updateCampaign } from "@/server/campaigns";

const UpdateBody = z.object({
  name: z.string().trim().min(2).max(300).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  budgetCents: z.number().int().min(0).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  landingUrl: z.string().url().max(2000).nullable().optional(),
});

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));

export const GET = handler<{ id: string }>({ permission: "campaign:read" }, async ({ principal, params }) => {
  return getCampaignDetail(principal, params.id);
});

export const PATCH = handler<{ id: string }>({ permission: "campaign:write" }, async ({ principal, params, request }) => {
  const input = await parseBody(request, UpdateBody);
  const campaign = await updateCampaign(
    principal,
    params.id,
    { ...input, startDate: toDate(input.startDate), endDate: toDate(input.endDate) },
    request,
  );
  return { campaign };
});

export const DELETE = handler<{ id: string }>({ permission: "campaign:write" }, async ({ principal, params }) => {
  await archiveCampaign(principal, params.id);
  return { archived: true };
});
