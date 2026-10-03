import { handler } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { requote } from "@/server/studio";

export const dynamic = "force-dynamic";

/** Offers the same settings again as a new quote (another take, or after a failure). */
export const POST = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, params }) => {
  return requote(orgIdOf(principal), params.id);
});
