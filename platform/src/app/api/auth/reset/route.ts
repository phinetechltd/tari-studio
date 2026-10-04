import { handler, parseBody } from "@/lib/api";
import { startSession } from "@/lib/auth";
import { resetPassword, resetSchema } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** Sets a new password from a reset code or link, ends every other session, and signs the person in. */
export const POST = handler({ public: true }, async ({ request }) => {
  const input = await parseBody(request, resetSchema);
  const user = await resetPassword(input, request);
  const { next } = await startSession(user);
  return { next };
});
