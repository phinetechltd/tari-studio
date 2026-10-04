import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Switch the setup guide off (or back on) for yourself. */
export const PATCH = handler({ account: true }, async ({ account, request }) => {
  const { off } = await parseBody(request, z.object({ off: z.boolean() }));
  await db.user.update({ where: { id: account!.userId }, data: { setupGuideOff: off } });
  return { off };
});
