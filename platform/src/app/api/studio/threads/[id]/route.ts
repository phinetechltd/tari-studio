import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { orgIdOf } from "@/lib/tenant";
import { ownedThread, threadDetail } from "@/server/studio";

export const dynamic = "force-dynamic";

export const GET = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, params }) => {
  return threadDetail(orgIdOf(principal), params.id);
});

const patch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  archived: z.boolean().optional(),
});

/** Rename, archive or restore a project. Archiving hides it; nothing is deleted. */
export const PATCH = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, request, params }) => {
  const organizationId = orgIdOf(principal);
  const thread = await ownedThread(organizationId, params.id);
  const input = await parseBody(request, patch);
  const updated = await db.studioThread.update({
    where: { id: thread.id },
    data: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.archived === undefined ? {} : { archivedAt: input.archived ? new Date() : null }),
    },
    select: { id: true, title: true, archivedAt: true },
  });
  return { id: updated.id, title: updated.title, archived: updated.archivedAt !== null };
});
