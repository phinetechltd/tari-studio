import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { archiveTask, getTask, updateTask } from "@/server/content";

const UpdateBody = z.object({
  title: z.string().trim().min(2).max(300).optional(),
  description: z.string().max(3000).optional(),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "PUBLISHED", "ARCHIVED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueAt: z.union([z.string().datetime(), z.null()]).optional(),
  targetPlatform: z.string().max(100).optional(),
  assigneeId: z.union([z.string(), z.null()]).optional(),
});

export const GET = handler<{ id: string }>({ permission: "content:read" }, async ({ principal, params }) => {
  return { task: await getTask(principal, params.id) };
});

export const PATCH = handler<{ id: string }>({ permission: "task:write" }, async ({ principal, params, request }) => {
  const input = await parseBody(request, UpdateBody);
  return {
    task: await updateTask(principal, params.id, {
      ...input,
      dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
    }),
  };
});

/** DELETE archives the task (soft delete — history is kept, it just leaves the board). */
export const DELETE = handler<{ id: string }>({ permission: "task:write" }, async ({ principal, params, request }) => {
  const task = await archiveTask(principal, params.id, request);
  return { task };
});
