import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The signed-in person's own notifications: the bell in the top bar and the
 * /notifications page. Inside an organisation, that organisation's; in
 * platform mode, the platform admin's own (AI credits, budgets, renewals).
 */
function scopeOf(principal: { userId: string; organizationId: string | null }) {
  return { userId: principal.userId, organizationId: principal.organizationId };
}

export const GET = handler({ authOnly: true, allowPlatform: true }, async ({ principal, searchParams }) => {
  const where = scopeOf(principal);
  const unreadOnly = searchParams.get("unread") === "1";
  const take = Math.min(100, Math.max(1, Number(searchParams.get("take")) || 20));
  const beforeRaw = searchParams.get("before");
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? beforeRaw : null;
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { ...where, ...(unreadOnly ? { readAt: null } : {}), ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.notification.count({ where: { ...where, readAt: null } }),
  ]);
  return { items, unread };
});

/** Marks one notification, or all of them, read. */
export const PATCH = handler({ authOnly: true, allowPlatform: true }, async ({ principal, request }) => {
  const { id } = await parseBody(request, z.object({ id: z.string().min(1).optional() }));
  const result = await db.notification.updateMany({
    where: { ...scopeOf(principal), readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  return { marked: result.count };
});
