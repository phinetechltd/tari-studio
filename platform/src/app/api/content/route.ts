import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { createTask, listTasks } from "@/server/content";

const CreateBody = z.object({
  brandId: z.string().min(1),
  title: z.string().trim().min(2).max(300),
  description: z.string().max(3000).optional(),
  contentType: z.enum(["IDEA", "BRIEF", "DESIGN", "COPY", "VIDEO", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueAt: z.string().datetime().optional(),
  targetPlatform: z.string().max(100).optional(),
  assigneeId: z.string().optional(),
});

export const GET = handler({ permission: "content:read" }, async ({ principal, searchParams }) => {
  const tasks = await listTasks(principal, {
    status: searchParams.get("status") ?? undefined,
    brandId: searchParams.get("brandId") ?? undefined,
  });
  return { tasks };
});

export const POST = handler({ permission: "task:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, CreateBody);
  const task = await createTask({
    ...input,
    dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
    organizationId: principal.organizationId!,
    createdById: principal.userId,
    request,
  });
  return { task };
});
