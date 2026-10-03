import { z } from "zod";

import { handler, parseBody, parseQuery } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { createThread, listThreads } from "@/server/studio";

export const dynamic = "force-dynamic";

const query = z.object({ archived: z.enum(["0", "1"]).optional(), q: z.string().trim().max(100).optional() });

export const GET = handler({ permission: "ai:generate" }, async ({ principal, searchParams }) => {
  const f = parseQuery(searchParams, query);
  return listThreads(orgIdOf(principal), { archived: f.archived === "1", q: f.q || undefined });
});

const body = z.object({ title: z.string().trim().max(120).optional() });

export const POST = handler({ permission: "ai:generate" }, async ({ principal, request }) => {
  const { title } = await parseBody(request, body);
  return createThread(orgIdOf(principal), principal.userId, title);
});
