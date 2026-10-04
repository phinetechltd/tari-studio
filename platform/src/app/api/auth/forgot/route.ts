import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { requestPasswordReset } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** Starts a password reset by email (link and code) or SMS (code). The answer is the same whether or not the account exists. */
export const POST = handler({ public: true }, async ({ request }) => {
  const { identifier } = await parseBody(request, z.object({ identifier: z.string().trim().min(3).max(254) }));
  await requestPasswordReset(identifier);
  return { sent: true };
});
