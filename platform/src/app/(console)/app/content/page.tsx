import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { KanbanBoard, type BoardBrand, type BoardMember, type BoardTask } from "@/components/content/kanban-board";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Task board" };
export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const { principal, organizationId } = await requirePermission("content:read");

  const [tasks, memberships, brands] = await Promise.all([
    db.contentTask.findMany({
      where: { organizationId, status: { not: "ARCHIVED" } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: {
        brand: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    }),
    db.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { role: "asc" },
    }),
    db.brand.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const boardTasks: BoardTask[] = tasks.map((t) => ({
    id: t.id,
    taskNumber: t.taskNumber,
    title: t.title,
    description: t.description,
    contentType: t.contentType,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    targetPlatform: t.targetPlatform,
    brandId: t.brandId,
    brandName: t.brand.name,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
  }));

  const members: BoardMember[] = memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
  }));

  const brandsList: BoardBrand[] = brands.map((b) => ({ id: b.id, name: b.name }));

  return (
    <>
      <PageHeader
        title="Task board"
        subtitle="Drag work across the workflow and hand each task to a teammate."
        actions={<Link href="/app/content/new" className="btn-primary">+ New Task</Link>}
      />
      <KanbanBoard tasks={boardTasks} members={members} brands={brandsList} canWrite={can(principal, "task:write")} />
    </>
  );
}
