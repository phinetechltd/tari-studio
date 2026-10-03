import { handler } from "@/lib/api";
import { IMAGE_TOKEN_CENTS, VIDEO_TOKEN_CENTS } from "@/lib/pricing";
import { orgIdOf } from "@/lib/tenant";
import { balances, recentLedger } from "@/server/tokens";

export const dynamic = "force-dynamic";

/** The organisation's token balances and recent movements. */
export const GET = handler({ permission: "ai:generate" }, async ({ principal }) => {
  const organizationId = orgIdOf(principal);
  const [balance, ledger] = await Promise.all([balances(organizationId), recentLedger(organizationId, 30)]);
  return {
    balance,
    prices: { imageTokenCents: IMAGE_TOKEN_CENTS, videoTokenCents: VIDEO_TOKEN_CENTS, videoTokenSeconds: 10 },
    ledger: ledger.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
  };
});
