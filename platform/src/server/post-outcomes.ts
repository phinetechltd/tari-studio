import "server-only";

import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

import { fireAutomations } from "./automations";

/**
 * How a scheduled post ends, whichever network it went to (Meta answers at
 * once; TikTok answers later, through status checks). Both outcomes fire the
 * organisation's automations.
 */

export async function finishPublished(input: {
  postId: string;
  organizationId: string;
  brandId: string;
  createdById: string | null;
  channel: { id: string; name: string };
  brandName: string;
  externalId: string;
  url: string | null;
}): Promise<boolean> {
  const won = await db.socialPost.updateMany({
    where: { id: input.postId, status: { in: ["PUBLISHING", "SCHEDULED"] } },
    data: { status: "PUBLISHED", publishedAt: new Date(), externalId: input.externalId, externalUrl: input.url, error: null },
  });
  if (won.count !== 1) return false;
  await db.socialChannel.update({ where: { id: input.channel.id }, data: { lastUsedAt: new Date() } });
  await audit({ organizationId: input.organizationId, userId: input.createdById, action: "PUBLISH", entity: "SocialPost", entityId: input.postId, changes: { externalId: input.externalId } });
  await fireAutomations({
    organizationId: input.organizationId,
    brandId: input.brandId,
    trigger: "POST_PUBLISHED",
    eventKey: `post:${input.postId}:published`,
    context: { postId: input.postId, channelName: input.channel.name, brandName: input.brandName, url: input.url },
  });
  return true;
}

export async function finishFailed(postId: string, organizationId: string, brandId: string, message: string): Promise<void> {
  await db.socialPost.update({ where: { id: postId }, data: { status: "FAILED", error: message.slice(0, 1000) } });
  await fireAutomations({
    organizationId,
    brandId,
    trigger: "POST_FAILED",
    eventKey: `post:${postId}:failed:${Date.now()}`,
    context: { postId, error: message },
  });
}
