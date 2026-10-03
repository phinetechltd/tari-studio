import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { CAMPAIGN_SOURCES, createCampaign, listCampaigns } from "@/server/campaigns";

const CreateBody = z.object({
  brandId: z.string().min(1),
  name: z.string().trim().min(2).max(300),
  description: z.string().max(2000).optional(),
  source: z.enum(CAMPAIGN_SOURCES),
  budgetCents: z.number().int().min(0).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  landingUrl: z.string().url().max(2000).optional(),
});

export const GET = handler({ permission: "campaign:read" }, async ({ principal, searchParams }) => {
  const campaigns = await listCampaigns(principal, {
    status: searchParams.get("status") ?? undefined,
    brandId: searchParams.get("brandId") ?? undefined,
  });
  return { campaigns };
});

export const POST = handler({ permission: "campaign:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, CreateBody);
  const campaign = await createCampaign(
    principal,
    {
      ...input,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    },
    request,
  );
  return { campaign };
});
