import { z } from "zod";

import { ApiError, handler, notFound, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { createThread } from "@/server/studio";

export const dynamic = "force-dynamic";

const body = z.object({ action: z.enum(["start", "deliver", "cancel", "reopen"]) });

/**
 * Moves an order through production. "start" opens a Studio project for it;
 * "deliver" needs at least one finished file attached to the order.
 */
export const POST = handler<{ id: string }>({ permission: "order:write", allowPlatform: true }, async ({ principal, request, params }) => {
  // Staff work orders of their own organisation; a platform admin may work any order.
  const order = await db.order.findFirst({
    where: principal.organizationId === null ? { id: params.id } : { id: params.id, organizationId: principal.organizationId },
  });
  if (!order) throw notFound("Order not found.");
  const organizationId = order.organizationId;
  const auditAs = (_p: unknown, action: "ORDER_STATUS", entity: string, entityId: string, changes: Record<string, unknown>, req?: Request) =>
    audit({ organizationId, userId: principal.userId, action, entity, entityId, changes, request: req });
  const { action } = await parseBody(request, body);

  if (action === "start") {
    if (order.status !== "PAID" && order.status !== "IN_PRODUCTION") {
      throw new ApiError(409, "CONFLICT", "Only a paid order can go into production.");
    }
    const existing = await db.studioThread.findFirst({
      where: { organizationId, orderId: order.id, archivedAt: null },
      select: { id: true },
    });
    const thread =
      existing ??
      (await createThread(organizationId, principal.userId, `${order.number}: ${order.brief.slice(0, 50)}`, order.id));
    await db.order.updateMany({ where: { id: order.id, status: "PAID" }, data: { status: "IN_PRODUCTION" } });
    await auditAs(principal, "ORDER_STATUS", "Order", order.id, { to: "IN_PRODUCTION", threadId: thread.id }, request);
    return { threadId: thread.id };
  }

  if (action === "deliver") {
    if (order.status !== "PAID" && order.status !== "IN_PRODUCTION") {
      throw new ApiError(409, "CONFLICT", "Only a paid order in production can be delivered.");
    }
    const ready = await db.generatedAsset.count({ where: { orderId: order.id, status: "READY", archivedAt: null } });
    if (ready === 0) throw new ApiError(409, "CONFLICT", "Generate at least one finished file for this order first.");
    await db.order.update({ where: { id: order.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    await auditAs(principal, "ORDER_STATUS", "Order", order.id, { to: "DELIVERED", files: ready }, request);
    return { status: "DELIVERED" };
  }

  if (action === "cancel") {
    if (order.status === "DELIVERED") throw new ApiError(409, "CONFLICT", "A delivered order cannot be cancelled.");
    if (order.status === "PAID" || order.status === "IN_PRODUCTION") {
      // Money has moved; a refund is a manual M-Pesa reversal, so say so rather than hide it.
      throw new ApiError(409, "CONFLICT", "This order is paid. Refund the customer on M-Pesa first, then cancel it.");
    }
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    await auditAs(principal, "ORDER_STATUS", "Order", order.id, { to: "CANCELLED" }, request);
    return { status: "CANCELLED" };
  }

  // reopen: a delivered order goes back into production (for a revision).
  if (order.status !== "DELIVERED") throw new ApiError(409, "CONFLICT", "Only a delivered order can be reopened.");
  await db.order.update({ where: { id: order.id }, data: { status: "IN_PRODUCTION", deliveredAt: null } });
  await auditAs(principal, "ORDER_STATUS", "Order", order.id, { to: "IN_PRODUCTION", reopened: true }, request);
  return { status: "IN_PRODUCTION" };
});
