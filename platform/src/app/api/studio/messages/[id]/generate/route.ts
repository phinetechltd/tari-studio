import { handler } from "@/lib/api";
import { can } from "@/lib/rbac";
import { orgIdOf } from "@/lib/tenant";
import { generateFromQuote } from "@/server/studio";

export const dynamic = "force-dynamic";

/** Spends the tokens and starts the generation. A second press returns the same generation. */
export const POST = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, params }) => {
  return generateFromQuote(orgIdOf(principal), principal.userId, params.id, {
    mayProduceOrders: can(principal, "order:write"),
  });
});
