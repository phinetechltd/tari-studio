import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { confirmPhoneVerification, requestPhoneVerification } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** Sends a code to the phone number on your profile, to prove it is yours. */
export const POST = handler({ account: true }, async ({ account }) => {
  await requestPhoneVerification(account!.userId);
  return { sent: true };
});

/** Confirms the code. A confirmed phone can receive password-recovery codes. */
export const PUT = handler({ account: true }, async ({ account, request }) => {
  const { code } = await parseBody(request, z.object({ code: z.string().trim().max(10) }));
  await confirmPhoneVerification(account!.userId, code, request);
  return { verified: true };
});
