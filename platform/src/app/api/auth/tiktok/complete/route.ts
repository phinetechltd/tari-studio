import { cookies } from "next/headers";
import { z } from "zod";

import { ApiError, handler, parseBody } from "@/lib/api";
import { completeTiktokSignup, readTiktokPending, TIKTOK_PENDING_COOKIE } from "@/server/oauth-tiktok";

export const dynamic = "force-dynamic";

const body = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(10).max(200),
  name: z.string().trim().min(2).max(120).optional(),
});

/**
 * The second half of a TikTok sign-up: the pending ticket (signed cookie) plus the email and
 * password the person chooses. The account exists only after this, still needs the email code
 * like any other sign-up before first use.
 */
export const POST = handler({ public: true }, async ({ request }) => {
  const jar = await cookies();
  const pending = await readTiktokPending(jar.get(TIKTOK_PENDING_COOKIE)?.value);
  if (!pending) throw new ApiError(409, "TIKTOK_PENDING_GONE", "The TikTok sign-up took too long. Start again.");
  const input = await parseBody(request, body);
  const { email } = await completeTiktokSignup(pending, { email: input.email, password: input.password, name: input.name }, request);
  return { email, next: `/verify?email=${encodeURIComponent(email)}` };
});
