import { handler } from "@/lib/api";
import { recheckPayment } from "@/server/platform-admin";

export const dynamic = "force-dynamic";

/** Asks M-Pesa or Paystack again about one payment and applies the verdict (once). */
export const POST = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, params, request }) =>
  recheckPayment(principal, params.id, request),
);
