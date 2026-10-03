import "server-only";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { nextNumber as nextDocumentNumber } from "@/lib/numbering";
import { scope } from "@/lib/tenant";
import type { Principal } from "@/lib/rbac";
import type { Prisma } from "@prisma/client";

/**
 * Content Studio: tasks, submissions, and comments.
 *
 * Workflow: DRAFT → IN_REVIEW → APPROVED → PUBLISHED
 * (or REJECTED back to designer for rework)
 */

export async function createTask(input: {
  organizationId: string;
  brandId: string;
  title: string;
  description?: string;
  contentType: string;
  priority?: string;
  dueAt?: Date;
  targetPlatform?: string;
  assigneeId?: string;
  aiBrief?: Record<string, unknown>;
  createdById: string;
  request?: Request;
}) {
  const title = input.title.trim();
  if (title.length < 2) throw new ApiError(422, "VALIDATION_FAILED", "Enter the task title.");

  // Verify brand ownership
  const brand = await db.brand.findUnique({ where: { id: input.brandId }, select: { id: true, organizationId: true } });
  if (!brand || brand.organizationId !== input.organizationId) {
    throw new ApiError(403, "FORBIDDEN", "Not your brand.");
  }

  const taskNumber = await nextDocumentNumber(input.organizationId, "TASK");

  const task = await db.contentTask.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      taskNumber,
      title,
      description: input.description ?? null,
      contentType: input.contentType,
      priority: input.priority ?? "MEDIUM",
      dueAt: input.dueAt ?? null,
      targetPlatform: input.targetPlatform ?? null,
      assigneeId: input.assigneeId ?? null,
      aiBrief: (input.aiBrief as Prisma.InputJsonValue) ?? undefined,
      createdById: input.createdById,
    },
  });

  await audit({
    organizationId: input.organizationId,
    userId: input.createdById,
    action: "CREATE",
    entity: "ContentTask",
    entityId: task.id,
    changes: { title, contentType: input.contentType },
    request: input.request,
  });

  return task;
}

export async function listTasks(principal: Principal, filters?: { brandId?: string; status?: string; assigneeId?: string }) {
  const where: Record<string, unknown> = scope(principal);
  if (filters?.brandId) where.brandId = filters.brandId;
  if (filters?.status) where.status = filters.status;
  if (filters?.assigneeId) where.assigneeId = filters.assigneeId;
  return db.contentTask.findMany({
    where,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: {
      brand: { select: { name: true } },
      assignee: { select: { name: true, email: true } },
      creator: { select: { name: true } },
      _count: { select: { submissions: true, comments: true } },
    },
  });
}

export async function getTask(principal: Principal, taskId: string) {
  const task = await db.contentTask.findUnique({
    where: { id: taskId },
    include: {
      brand: { select: { name: true } },
      assignee: { select: { name: true, email: true } },
      creator: { select: { name: true } },
      submissions: {
        orderBy: { createdAt: "desc" },
        include: { comments: { include: { author: { select: { name: true } } } } },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!task) throw new ApiError(404, "NOT_FOUND", "Task not found.");
  if (task.organizationId !== principal.organizationId) throw new ApiError(403, "FORBIDDEN", "Not your task.");
  return task;
}

export async function updateTask(
  principal: Principal,
  taskId: string,
  updates: Partial<{ title: string; description: string; status: string; priority: string; dueAt: Date; assigneeId: string; targetPlatform: string }>,
) {
  const existing = await db.contentTask.findUnique({ where: { id: taskId }, select: { id: true, organizationId: true } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Task not found.");
  if (existing.organizationId !== principal.organizationId) throw new ApiError(403, "FORBIDDEN", "Not your task.");

  return db.contentTask.update({
    where: { id: taskId },
    data: {
      title: updates.title?.trim(),
      description: updates.description ?? undefined,
      status: updates.status ?? undefined,
      priority: updates.priority ?? undefined,
      dueAt: updates.dueAt ?? undefined,
      assigneeId: updates.assigneeId ?? undefined,
      targetPlatform: updates.targetPlatform ?? undefined,
    },
  });
}

export async function createSubmission(principal: Principal, input: {
  taskId: string;
  title: string;
  description?: string;
  caption?: string;
  assetId?: string;
  aspectRatio?: string;
  altText?: string;
}) {
  const task = await db.contentTask.findUnique({ where: { id: input.taskId }, select: { id: true, organizationId: true, status: true } });
  if (!task || task.organizationId !== principal.organizationId) throw new ApiError(404, "NOT_FOUND", "Task not found.");

  return db.contentSubmission.create({
    data: {
      organizationId: task.organizationId,
      taskId: input.taskId,
      title: input.title.trim(),
      description: input.description ?? null,
      caption: input.caption ?? null,
      assetId: input.assetId ?? null,
      aspectRatio: input.aspectRatio ?? null,
      altText: input.altText ?? null,
      status: "IN_REVIEW",
      createdById: principal.userId,
    },
  });
}

export async function addComment(principal: Principal, input: {
  taskId?: string;
  submissionId?: string;
  body: string;
}) {
  if (!input.taskId && !input.submissionId) throw new ApiError(422, "VALIDATION_FAILED", "Attach to a task or submission.");
  const body = input.body.trim();
  if (body.length < 1) throw new ApiError(422, "VALIDATION_FAILED", "Write a comment.");

  return db.comment.create({
    data: {
      authorId: principal.userId,
      taskId: input.taskId ?? null,
      submissionId: input.submissionId ?? null,
      body,
    },
  });
}
