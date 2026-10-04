import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { moderateTemplate } from "@/server/templates";

export const dynamic = "force-dynamic";

/** Hides an organisation's public template from everyone else (with a reason it sees), or shows it again. */
export const PATCH = handler<{ id: string }>({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request, params }) => {
  const input = await parseBody(request, z.object({ hidden: z.boolean(), reason: z.string().max(300).nullable().optional() }));
  await moderateTemplate(principal, params.id, input, request);
  return { hidden: input.hidden };
});
