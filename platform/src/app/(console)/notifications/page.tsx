import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

/** Everything the bell has said, inside the current organisation (or platform mode). */
export default async function NotificationsPage() {
  const { principal } = await requireSession();
  const where = { userId: principal.userId, organizationId: principal.organizationId };
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
    db.notification.count({ where: { ...where, readAt: null } }),
  ]);
  const home = principal.organizationId ? "/app" : "/platform";

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Payments, plan reminders, orders and alerts. Choose which also reach you by email or SMS in your profile."
        actions={
          <Link href="/account#notifications" className="btn-quiet">
            Email and SMS settings
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState title="Nothing yet">When something needs your attention, it shows up here and on the bell.</EmptyState>
      ) : (
        <NotificationList
          initial={items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))}
          initialUnread={unread}
          home={home}
        />
      )}
    </>
  );
}
