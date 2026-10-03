import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "./db";

/**
 * First-writer-wins claim on an external event or client request.
 *
 * Meta retries webhooks; people double-click. `claim` returns true exactly once
 * per key, so the caller does the work only when it wins. The key must be
 * namespaced by the caller (`meta:event:<id>`, `publish:<jobId>`) so unrelated
 * features cannot collide.
 */
export async function claim(
  key: string,
  scope: string,
  endpoint: string,
): Promise<boolean> {
  try {
    await db.idempotencyKey.create({ data: { key, scope, endpoint } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

/** Stores the outcome so a later duplicate can be answered identically. */
export async function recordResponse(key: string, response: Prisma.InputJsonValue): Promise<void> {
  await db.idempotencyKey.update({ where: { key }, data: { response } }).catch(() => undefined);
}

export async function priorResponse(key: string): Promise<unknown | null> {
  const row = await db.idempotencyKey.findUnique({ where: { key } });
  return row?.response ?? null;
}
