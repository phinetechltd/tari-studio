import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { claimsFor, readSessionClaims, setSessionCookie } from "@/lib/auth";
import { changePassword } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** Change your password (or set one, if you signed up with Google). Other devices are signed out; this one stays in. */
export const POST = handler({ account: true }, async ({ account, request }) => {
  const { current, password } = await parseBody(request, z.object({ current: z.string().max(200).optional(), password: z.string().min(1).max(200) }));
  const user = await changePassword(account!.userId, current, password, request);
  const claims = await readSessionClaims();
  await setSessionCookie(claimsFor(user, claims?.org ?? null));
  return { changed: true };
});
