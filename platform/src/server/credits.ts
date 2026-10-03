import "server-only";

import { Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { db, type Tx } from "@/lib/db";
import { LEGACY_IMAGE_TOKEN_CREDITS, LEGACY_VIDEO_TOKEN_CREDITS } from "@/lib/pricing";

/**
 * The credit wallet: bought with plans and top-ups, spent on images and videos.
 *
 * Two tables, two jobs. `TokenLedger` is the append-only history (every grant,
 * purchase, debit and refund, with what caused it). `TokenBalance` is the
 * running total a spend decrements; the decrement carries `balance >= n` in its
 * WHERE clause, so concurrent generations cannot overdraw an organisation, and
 * there is no read-then-write window to race through. (Both tables keep their
 * token-era names; since 2 Oct 2026 every row is kind CREDIT.)
 *
 * Idempotency is enforced by unique keys on the ledger: a payment credits once,
 * a plan grant happens once (grantKey), a generation is charged once and
 * refunded once. Callers pass a transaction so the ledger row and the balance
 * move together or not at all.
 *
 * INTERNAL-plan organisations (the operator's own agency, which fulfils public
 * orders that were already paid for) are not charged. Their generations still
 * get a zero-value SPEND row, so usage stays visible in the ledger.
 */

export const CREDIT = "CREDIT";

export async function isUnmetered(organizationId: string, client: Tx | typeof db = db): Promise<boolean> {
  const org = await client.organization.findUnique({ where: { id: organizationId }, select: { plan: true } });
  return org?.plan === "INTERNAL";
}

export interface Wallet {
  credits: number;
  /** True for INTERNAL-plan organisations, which generate without spending credits */
  unmetered: boolean;
}

export async function wallet(organizationId: string): Promise<Wallet> {
  const [row, unmetered] = await Promise.all([
    db.tokenBalance.findUnique({
      where: { organizationId_kind: { organizationId, kind: CREDIT } },
      select: { balance: true },
    }),
    isUnmetered(organizationId),
  ]);
  return { credits: row?.balance ?? 0, unmetered };
}

async function addToBalance(tx: Tx, organizationId: string, credits: number) {
  await tx.tokenBalance.upsert({
    where: { organizationId_kind: { organizationId, kind: CREDIT } },
    create: { organizationId, kind: CREDIT, balance: credits },
    update: { balance: { increment: credits } },
  });
}

/** Credits a payment once. Returns false when it was already credited. */
export async function creditPayment(
  tx: Tx,
  input: { organizationId: string; credits: number; paymentIntentId: string; createdById?: string | null; note?: string },
): Promise<boolean> {
  if (input.credits <= 0) return false;
  const already = await tx.tokenLedger.findFirst({
    where: { paymentIntentId: input.paymentIntentId, kind: CREDIT, reason: "PURCHASE" },
    select: { id: true },
  });
  if (already) return false;

  await tx.tokenLedger.create({
    data: {
      organizationId: input.organizationId,
      kind: CREDIT,
      delta: input.credits,
      reason: "PURCHASE",
      paymentIntentId: input.paymentIntentId,
      createdById: input.createdById ?? null,
      note: input.note ?? null,
    },
  });
  await addToBalance(tx, input.organizationId, input.credits);
  return true;
}

/**
 * A plan's monthly credits, granted once per `grantKey`. Returns false when that
 * grant already happened (a retried worker tick, two workers at once).
 */
export async function grantCredits(
  tx: Tx,
  input: { organizationId: string; credits: number; grantKey: string; note: string; paymentIntentId?: string | null },
): Promise<boolean> {
  if (input.credits <= 0) return false;
  const already = await tx.tokenLedger.findUnique({ where: { grantKey: input.grantKey }, select: { id: true } });
  if (already) return false;
  await tx.tokenLedger.create({
    data: {
      organizationId: input.organizationId,
      kind: CREDIT,
      delta: input.credits,
      reason: "GRANT",
      grantKey: input.grantKey,
      paymentIntentId: input.paymentIntentId ?? null,
      note: input.note,
    },
  });
  await addToBalance(tx, input.organizationId, input.credits);
  return true;
}

/**
 * A platform admin adding or removing credits by hand (goodwill, a refund made
 * outside the system, a correction). Never takes the balance below zero; the
 * reason is kept on the ledger row. Returns the new balance.
 */
export async function adjustCredits(input: {
  organizationId: string;
  delta: number;
  note: string;
  createdById: string;
}): Promise<number> {
  if (!Number.isInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > 10_000_000) {
    throw new ApiError(422, "VALIDATION_FAILED", "Enter a whole number of credits to add or remove.");
  }
  return db.$transaction(async (tx) => {
    if (input.delta < 0) {
      const taken = await tx.tokenBalance.updateMany({
        where: { organizationId: input.organizationId, kind: CREDIT, balance: { gte: -input.delta } },
        data: { balance: { decrement: -input.delta } },
      });
      if (taken.count !== 1) {
        const row = await tx.tokenBalance.findUnique({
          where: { organizationId_kind: { organizationId: input.organizationId, kind: CREDIT } },
          select: { balance: true },
        });
        throw new ApiError(409, "INSUFFICIENT_CREDITS", `They have ${row?.balance ?? 0} credits; you cannot remove ${-input.delta}.`);
      }
    } else {
      await addToBalance(tx, input.organizationId, input.delta);
    }
    await tx.tokenLedger.create({
      data: {
        organizationId: input.organizationId,
        kind: CREDIT,
        delta: input.delta,
        reason: "ADJUST",
        createdById: input.createdById,
        note: input.note.slice(0, 300),
      },
    });
    const after = await tx.tokenBalance.findUnique({
      where: { organizationId_kind: { organizationId: input.organizationId, kind: CREDIT } },
      select: { balance: true },
    });
    return after?.balance ?? 0;
  });
}

/**
 * Charges `credits` for a generation. Throws 402 INSUFFICIENT_CREDITS when the
 * balance is short, which rolls back the caller's transaction (and so the
 * asset it was about to create). Returns the number actually charged.
 */
export async function spend(
  tx: Tx,
  input: { organizationId: string; credits: number; assetId: string; userId: string },
): Promise<number> {
  if (await isUnmetered(input.organizationId, tx)) {
    await tx.tokenLedger.create({
      data: {
        organizationId: input.organizationId,
        kind: CREDIT,
        delta: 0,
        reason: "SPEND",
        assetId: input.assetId,
        createdById: input.userId,
        note: `INTERNAL plan: ${input.credits} credit(s) not charged`,
      },
    });
    return 0;
  }

  const taken = await tx.tokenBalance.updateMany({
    where: { organizationId: input.organizationId, kind: CREDIT, balance: { gte: input.credits } },
    data: { balance: { decrement: input.credits } },
  });
  if (taken.count !== 1) {
    const row = await tx.tokenBalance.findUnique({
      where: { organizationId_kind: { organizationId: input.organizationId, kind: CREDIT } },
      select: { balance: true },
    });
    const have = row?.balance ?? 0;
    throw new ApiError(
      402,
      "INSUFFICIENT_CREDITS",
      `This needs ${input.credits} credits; you have ${have}. Top up or choose a plan to continue.`,
      { needed: input.credits, balance: have },
    );
  }

  await tx.tokenLedger.create({
    data: {
      organizationId: input.organizationId,
      kind: CREDIT,
      delta: -input.credits,
      reason: "SPEND",
      assetId: input.assetId,
      createdById: input.userId,
    },
  });
  return input.credits;
}

/** Credits that a charge recorded in the token era is worth today. */
function asCredits(kind: string, count: number): number {
  if (kind === "IMAGE") return count * LEGACY_IMAGE_TOKEN_CREDITS;
  if (kind === "VIDEO") return count * LEGACY_VIDEO_TOKEN_CREDITS;
  return count;
}

/**
 * Returns what a failed generation was charged. Safe to call more than once
 * (the worker may retry): the REFUND row is unique per asset, and the check and
 * the credit share one transaction. A generation charged in tokens before the
 * switch is refunded in credits at the conversion rate.
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

    const credits = asCredits(charge.kind, -charge.delta);
    await tx.tokenLedger.create({
      data: { organizationId: charge.organizationId, kind: CREDIT, delta: credits, reason: "REFUND", assetId, note },
    });
    await addToBalance(tx, charge.organizationId, credits);
    return credits;
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

/** Converts a token-era purchase (a TOKENS intent that settles after the switch) into credits. */
export function legacyTokensAsCredits(imageTokens: number, videoTokens: number): number {
  return asCredits("IMAGE", imageTokens) + asCredits("VIDEO", videoTokens);
}
