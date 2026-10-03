import { z } from "zod";

import { handler, notFound, parseBody } from "@/lib/api";
import { auditAs } from "@/lib/audit";
import { db } from "@/lib/db";
import { orgIdOf } from "@/lib/tenant";
import { assetView } from "@/server/generation";

export const dynamic = "force-dynamic";

async function owned(organizationId: string, id: string) {
  const asset = await db.generatedAsset.findFirst({ where: { id, organizationId } });
  if (!asset) throw notFound("Asset not found.");
  return asset;
}

export const GET = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, params }) => {
  return assetView(await owned(orgIdOf(principal), params.id));
});

const patch = z.object({ prompt: z.string().trim().min(3).max(2000) });

/** Edits the note kept with an asset. The file itself never changes. */
export const PATCH = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, request, params }) => {
  const asset = await owned(orgIdOf(principal), params.id);
  const { prompt } = await parseBody(request, patch);
  const updated = await db.generatedAsset.update({ where: { id: asset.id }, data: { prompt } });
  await auditAs(principal, "UPDATE", "GeneratedAsset", asset.id, { prompt }, request);
  return assetView(updated);
});

/**
 * Removes an asset from the library. The row is kept (it anchors the token
 * ledger and the audit trail); only a finished or failed asset can be removed.
 */
export const DELETE = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, request, params }) => {
  const asset = await owned(orgIdOf(principal), params.id);
  if (asset.status === "GENERATING") {
    return { archived: false, reason: "Wait for the generation to finish before removing it." };
  }
  await db.generatedAsset.update({ where: { id: asset.id }, data: { archivedAt: new Date() } });
  await auditAs(principal, "ARCHIVE", "GeneratedAsset", asset.id, undefined, request);
  return { archived: true };
});
