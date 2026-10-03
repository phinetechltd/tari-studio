import { handler, parseBody } from "@/lib/api";
import { createQuoteRequest, quoteRequestSchema } from "@/server/orders";

export const dynamic = "force-dynamic";

/** A request for services priced on request (voice-over, music, captions ...). No payment. */
export const POST = handler({ public: true }, async ({ request }) => {
  const input = await parseBody(request, quoteRequestSchema);
  return createQuoteRequest(input, request);
});
