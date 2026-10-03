import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { beginEnrolment, confirmEnrolment, disableMfa } from "@/server/mfa";

const body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("begin") }),
  z.object({ step: z.literal("confirm"), code: z.string().min(6).max(12) }),
  z.object({ step: z.literal("disable"), password: z.string().min(1).max(200) }),
]);

// The caller's own security settings: any signed-in user, in any mode. Each
// step audits itself inside src/server/mfa.ts.
export const POST = handler({ authOnly: true, allowPlatform: true }, async ({ principal, request }) => {
  const input = await parseBody(request, body);

  if (input.step === "begin") return beginEnrolment(principal.userId);
  if (input.step === "confirm") {
    await confirmEnrolment(principal.userId, input.code);
    return { enabled: true };
  }
  await disableMfa(principal.userId, input.password);
  return { enabled: false };
});
