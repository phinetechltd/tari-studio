import { handler } from "@/lib/api";
import { orderStatus } from "@/server/orders";

export const dynamic = "force-dynamic";

/** The customer's order page polls this. The token is the only credential. */
export const GET = handler<{ token: string }>({ public: true }, async ({ params }) => {
  return orderStatus(params.token);
});
