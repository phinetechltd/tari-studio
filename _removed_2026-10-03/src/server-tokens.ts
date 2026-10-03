import "server-only";

import { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { db, type Tx } from "@/lib/db";
import type { TokenKind } from "@/lib/pricing";

/**
 * Generation tokens: bought with M-Pesa, spent on images and videos.
 *
 * Two tables, two jobs. `TokenLedger` is the append-only history (every credit,
 * debit and refund, with what caused it). `TokenBalance` is the running total a
 * spend decrements; the decrement carries `balance >= n` in its WHERE clause, so
 * concurrent generations cannot overdraw an organisation, and there is no
 * read-then-write window to race through.
 *
 * Idempotency is enforced by unique keys on the ledger: a payment credits each
 * kind once, a generation is charged once and refunded once. Callers pass a
 * transaction so the ledger row and the balance move together or not at all.
 *
 * INTERNAL-plan organisations (the operator's own agency, which fulfils public
 * orders that were already paid for) are not charged. Their generations still
 * get a zero-value SPEND row, so usage stays visible in the ledger.
 */

export const TOKEN_KINDS: readonly TokenKind[] = ["IMAGE", "VIDEO"];

export async function isUnmetered(organizationId: string, client: Tx | typeof db = db): Promise<boolean> {
  const org = await client.organization.findUnique({ where: { id: organizationId }, select: { plan: true } });
  return org?.plan === "INTERNAL";
}

export interface Balances {
  IMAGE: number;
  VIDEO: number;
  /** True for INTERNAL-plan organisations, which generate without spending tokens */
  unmetered: boolean;
}

export async function balances(organizationId: string): Promise<Balances> {
  const [rows, unmetered] = await Promise.all([
    db.tokenBalance.findMany({ where: { organizationId }, select: { kind: true, balance: true } }),
    isUnmetered(organizationId),
  ]);
  const of = (k: TokenKind) => rows.find((r) => r.kind === k)?.balance ?? 0;
  return { IMAGE: of("IMAGE"), VIDEO: of("VIDEO"), unmetered };
}

/** Credits purchased tokens once per payment and kind. Returns false when already credited. */
export async function creditPurchase(
  tx: Tx,
  input: { organizationId: string; kind: TokenKind; count: number; paymentIntentId: string; createdById?: string | null },
): Promise<boolean> {
  if (input.count <= 0) return false;
  const already = await tx.tokenLedger.findFirst({
    where: { paymentIntentId: input.paymentIntentId, kind: input.kind, reason: "PURCHASE" },
    select: { id: true },
  });
  if (already) return false;

  await tx.tokenLedger.create({
    data: {
      organizationId: input.organizationId,
      kind: input.kind,
      delta: input.count,
      reason: "PURCHASE",
      paymentIntentId: input.paymentIntentId,
      createdById: input.createdById ?? null,
    },
  });
  await tx.tokenBalance.upsert({
    where: { organizationId_kind: { organizationId: input.organizationId, kind: input.kind } },
    create: { organizationId: input.organizationId, kind: input.kind, balance: input.count },
    update: { balance: { increment: input.count } },
  });
  return true;
}

/**
 * Charges `count` tokens for a generation. Throws 402 INSUFFICIENT_TOKENS when
 * the balance is short, which rolls back the caller's transaction (and so the
 * asset it was about to create). Returns the number actually charged.
 */
export async function spend(
  tx: Tx,
  input: { organizationId: string; kind: TokenKind; count: number; assetId: string; userId: string },
): Promise<number> {
  if (await isUnmetered(input.organizationId, tx)) {
    await tx.tokenLedger.create({
      data: {
        organizationId: input.organizationId,
        kind: input.kind,
        delta: 0,
        reason: "SPEND",
        assetId: input.assetId,
        createdById: input.userId,
        note: `INTERNAL plan: ${input.count} ${input.kind.toLowerCase()} token(s) not charged`,
      },
    });
    return 0;
  }

  const taken = await tx.tokenBalance.updateMany({
    where: { organizationId: input.organizationId, kind: input.kind, balance: { gte: input.count } },
    data: { balance: { decrement: input.count } },
  });
  if (taken.count !== 1) {
    const row = await tx.tokenBalance.findUnique({
      where: { organizationId_kind: { organizationId: input.organizationId, kind: input.kind } },
      select: { balance: true },
    });
    const have = row?.balance ?? 0;
    const noun = input.kind === "IMAGE" ? "image" : "video";
    throw new ApiError(
      402,
      "INSUFFICIENT_TOKENS",
      `This needs ${input.count} ${noun} token${input.count === 1 ? "" : "s"}; you have ${have}. Buy tokens to continue.`,
      { kind: input.kind, needed: input.count, balance: have },
    );
  }

  await tx.tokenLedger.create({
    data: {
      organizationId: input.organizationId,
      kind: input.kind,
      delta: -input.count,
      reason: "SPEND",
      assetId: input.assetId,
      createdById: input.userId,
    },
  });
  return input.count;
}

/**
 * Returns the tokens a failed generation was charged. Safe to call more than
 * once (the worker may retry): the REFUND row is unique per asset, and the
 * check and the credit share one transaction.
 */
export async function refund(assetId: string, note: string): Promise<number> {
  try {
    return await refundOnce(assetId, note);
  } catch (e) {
    // Two refunds racing: the unique (assetId, reason) key stopped the second.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return 0;
    throw e;
  }
}

async function refundOnce(assetId: string, note: string): Promise<number> {
  return db.$transaction(async (tx) => {
    const charge = await tx.tokenLedger.findFirst({
      where: { assetId, reason: "SPEND" },
      select: { organizationId: true, kind: true, delta: true },
    });
    if (!charge || charge.delta >= 0) return 0;

    const already = await tx.tokenLedger.findFirst({ where: { assetId, reason: "REFUND" }, select: { id: true } });
    if (already) return 0;

    const count = -charge.delta;
    await tx.tokenLedger.create({
      data: { organizationId: charge.organizationId, kind: charge.kind, delta: count, reason: "REFUND", assetId, note },
    });
    await tx.tokenBalance.upsert({
      where: { organizationId_kind: { organizationId: charge.organizationId, kind: charge.kind } },
      create: { organizationId: charge.organizationId, kind: charge.kind, balance: count },
      update: { balance: { increment: count } },
    });
    return count;
  });
}

export async function recentLedger(organizationId: string, take = 20) {
  return db.tokenLedger.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, delta: true, reason: true, note: true, assetId: true, createdAt: true },
  });
}
