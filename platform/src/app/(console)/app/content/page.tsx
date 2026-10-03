import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Badge, EmptyState, TableWrap } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Content Studio" };

const statusTone: Record<string, "success" | "neutral" | "warning" | "danger"> = {
  DRAFT: "neutral",
  IN_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  PUBLISHED: "success",
  ARCHIVED: "neutral",
};

const priorityTone: Record<string, "success" | "neutral" | "warning" | "danger"> = {
  LOW: "neutral",
  MEDIUM: "neutral",
  HIGH: "warning",
  URGENT: "danger",
};

export default async function ContentPage() {
  const { principal, organizationId } = await requirePermission("content:read");

  const tasks = await db.contentTask.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      brand: { select: { name: true, brandNumber: true, id: true } },
      creator: { select: { name: true } },
      assignee: { select: { name: true } },
      _count: { select: { submissions: true, comments: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Content Studio"
        subtitle="Briefs for designers and writers: plan, review and approve work before it goes out."
        actions={
          <Link
            href="/app/content/new"
            className="btn-primary"
          >
            + New Task
          </Link>
        }
      />

      {tasks.length === 0 ? (
        <EmptyState title="No content tasks yet">Create your first content brief to start the production workflow.</EmptyState>
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-4 py-2 font-medium">Task</th>
                <th className="px-4 py-2 font-medium">Brand</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Assignee</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 font-medium">Subs</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">
                    <span className="font-medium text-ink">{t.title}</span>
                    <div className="text-muted text-xs font-mono">{t.taskNumber}</div>
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/app/brands/${t.brand.id}`} className="text-primary underline-offset-2 hover:underline">
                      {t.brand.name}
                    </Link>
                    <div className="text-muted text-xs font-mono">{t.brand.brandNumber}</div>
                  </td>
                  <td className="px-4 py-2"><Badge>{t.contentType}</Badge></td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone[t.status] ?? "neutral"}>
                      {t.status.charAt(0) + t.status.slice(1).toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={priorityTone[t.priority] ?? "neutral"}>{t.priority}</Badge>
                  </td>
                  <td className="px-4 py-2 text-muted">{t.assignee?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted whitespace-nowrap">
                    {t.dueAt ? new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(new Date(t.dueAt)) : "—"}
                  </td>
                  <td className="px-4 py-2 text-muted">{t._count.submissions}</td>
                  <td className="px-4 py-2 text-muted whitespace-nowrap">
                    {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(t.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
