import { handler } from "@/lib/api";
import { retryDelivery } from "@/server/notify";

export const dynamic = "force-dynamic";

/** Queues a failed or held-back email or SMS again. */
export const POST = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, params, request }) => {
  return retryDelivery(principal, params.id, request);
});
