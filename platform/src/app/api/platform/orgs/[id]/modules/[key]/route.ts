import { z } from "zod";

import { handler, notFound, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { setModuleEnabled } from "@/server/organizations";

const body = z.object({ enabled: z.boolean() });

export const PUT = handler<{ id: string; key: string }>(
  { permission: "platform:manage", allowPlatform: true },
  async ({ principal, params, request }) => {
    const { enabled } = await parseBody(request, body);
    const exists = await db.organization.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) throw notFound("No such organisation.");

    await setModuleEnabled({
      organizationId: params.id,
      moduleKey: params.key,
      enabled,
      byUserId: principal.userId,
    });
    return { moduleKey: params.key, enabled };
  },
);
