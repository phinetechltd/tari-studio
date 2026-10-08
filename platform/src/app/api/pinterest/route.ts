import { handler } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { accountView, activeAccount, disconnectAccount } from "@/server/external-accounts";
import { pinterestFeatures } from "@/server/pinterest";

export const dynamic = "force-dynamic";

/** What the Pinterest picker can offer this organisation, and which account is connected. */
export const GET = handler({ permission: "template:read" }, async ({ principal }) => {
  return { features: pinterestFeatures(), account: accountView(await activeAccount(orgIdOf(principal), "PINTEREST")) };
});

/** Disconnects the organisation's Pinterest account. Imported images stay. */
export const DELETE = handler({ permission: "template:write" }, async ({ principal }) => {
  const account = await activeAccount(orgIdOf(principal), "PINTEREST");
  if (account) await disconnectAccount(orgIdOf(principal), account.id);
  return { disconnected: Boolean(account) };
});
