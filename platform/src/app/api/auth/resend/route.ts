import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { resendVerification } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** Sends a new verification message. Always answers the same, so it cannot be used to find out who has an account. */
export const POST = handler({ public: true }, async ({ request }) => {
  const { email } = await parseBody(request, z.object({ email: z.string().trim().max(254) }));
  await resendVerification(email);
  return { sent: true };
});
