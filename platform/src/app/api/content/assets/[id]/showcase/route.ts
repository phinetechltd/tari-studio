import { z } from "zod";

import { ApiError, handler, notFound, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { orgIdOf } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const body = z.object({
  showcase: z.boolean(),
  title: z.string().trim().max(80).optional(),
});

/**
 * Pins a finished generation to the public landing page, or takes it off.
 * Platform admins only: it publishes the file to anyone on the internet
 * (src/app/showcase/[id]), so it is not a per-agency decision.
 */
export const PUT = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, request, params }) => {
  const me = await db.user.findUnique({ where: { id: principal.userId }, select: { isPlatformAdmin: true } });
  if (!me?.isPlatformAdmin) throw new ApiError(403, "FORBIDDEN", "Only platform admins choose what appears on the landing page.");

  const asset = await db.generatedAsset.findFirst({ where: { id: params.id, organizationId: orgIdOf(principal) } });
  if (!asset) throw notFound("Asset not found.");
  const input = await parseBody(request, body);
  if (input.showcase && (asset.status !== "READY" || !asset.storageKey || asset.archivedAt)) {
    throw new ApiError(409, "CONFLICT", "Only a finished file that is still in the library can be shown.");
  }

  const updated = await db.generatedAsset.update({
    where: { id: asset.id },
    data: input.showcase
      ? { showcase: true, showcaseTitle: input.title || null, showcasedAt: new Date() }
      : { showcase: false, showcasedAt: null },
  });
  await audit({
    organizationId: asset.organizationId,
    userId: principal.userId,
    action: "ASSET_SHOWCASE",
    entity: "GeneratedAsset",
    entityId: asset.id,
    changes: { showcase: input.showcase, title: input.title ?? null },
    request,
  });
  return { showcase: updated.showcase, title: updated.showcaseTitle };
});
