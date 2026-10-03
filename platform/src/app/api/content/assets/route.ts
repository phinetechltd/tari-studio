import { z } from "zod";

import { handler, pagination, paginationMeta, parseQuery, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { orgIdOf } from "@/lib/tenant";
import { assetView } from "@/server/generation";

export const dynamic = "force-dynamic";

const query = z.object({
  mediaType: z.enum(["IMAGE", "VIDEO"]).optional(),
  status: z.enum(["GENERATING", "READY", "FAILED"]).optional(),
  q: z.string().trim().max(100).optional(),
  threadId: z.string().max(40).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

/** The generated-media library for the caller's organisation. */
export const GET = handler({ permission: "ai:generate" }, async ({ principal, searchParams }) => {
  const organizationId = orgIdOf(principal);
  const f = parseQuery(searchParams, query);
  const page = pagination(searchParams, 24);
  const where = {
    organizationId,
    archivedAt: null,
    ...(f.mediaType ? { mediaType: f.mediaType } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.threadId ? { threadId: f.threadId } : {}),
    ...(f.q ? { prompt: { contains: f.q, mode: "insensitive" as const } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.generatedAsset.findMany({ where, orderBy: { createdAt: "desc" }, take: page.take, skip: page.skip }),
    db.generatedAsset.count({ where }),
  ]);
  return ok(rows.map(assetView), paginationMeta(page, total));
});
