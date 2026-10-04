import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { verifyEmail } from "@/server/accounts";

export const dynamic = "force-dynamic";

const body = z.union([z.object({ email: z.string().trim().max(254), code: z.string().trim().max(10) }), z.object({ link: z.string().trim().max(80) })]);

/** Confirms an email by its 6-digit code (with the address) or its link, then signs the person in. */
export const POST = handler({ public: true }, async ({ request }) => {
  const input = await parseBody(request, body);
  const user = await verifyEmail(input, request);
  const { next } = await startSession(user);
  return { next };
});
