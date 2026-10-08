import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { listPosts, schedulePosts } from "@/server/social";

const Body = z.object({
  channelIds: z.array(z.string().min(1)).min(1).max(10),
  text: z.string().max(2200).default(""),
  assetId: z.string().min(1).nullable().optional(),
  link: z.string().url().max(2000).nullable().optional(),
  campaignId: z.string().min(1).nullable().optional(),
  /** ISO time; omitted or in the past means "now". */
  scheduledAt: z.string().datetime().nullable().optional(),
  /** TikTok channels only: privacy and interaction choices (validated in schedulePosts) */
  tiktok: z.unknown().optional(),
});

export const GET = handler({ permission: "post:read" }, async ({ principal, searchParams }) => {
  const posts = await listPosts(principal, {
    status: searchParams.get("status") ?? undefined,
    channelId: searchParams.get("channelId") ?? undefined,
    campaignId: searchParams.get("campaignId") ?? undefined,
  });
  return { posts };
});

export const POST = handler({ permission: "post:schedule" }, async ({ principal, request }) => {
  const input = await parseBody(request, Body);
  const posts = await schedulePosts(
    principal,
    { ...input, scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null },
    request,
  );
  return { posts };
});
