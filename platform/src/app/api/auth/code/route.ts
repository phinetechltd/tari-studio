import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { requestLoginCode, verifyLoginCode } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** Step 1 of signing in with a code: ask for one by email or SMS. Same answer whether or not the account exists. */
export const POST = handler({ public: true }, async ({ request }) => {
  const { identifier } = await parseBody(request, z.object({ identifier: z.string().trim().min(3).max(254) }));
  await requestLoginCode(identifier);
  return { sent: true };
});

/** Step 2: send the code back to sign in. */
export const PUT = handler({ public: true }, async ({ request }) => {
  const { identifier, code } = await parseBody(request, z.object({ identifier: z.string().trim().min(3).max(254), code: z.string().trim().max(10) }));
  const user = await verifyLoginCode(identifier, code, request);
  const { next } = await startSession(user);
  return { next };
});
