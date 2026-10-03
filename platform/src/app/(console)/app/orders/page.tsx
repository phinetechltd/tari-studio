import Link from "next/link";

import { Badge, EmptyState, PageHeader, TableWrap } from "@/components/ui";
import { db } from "@/lib/db";
import { formatKES } from "@/lib/money";
import { ORDER_STATUS_TONE, statusLabel } from "@/lib/order-status";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

const FILTERS = [
  { key: "open", label: "To do", statuses: ["PAID", "IN_PRODUCTION", "REQUESTED"] },
  { key: "unpaid", label: "Awaiting payment", statuses: ["PENDING_PAYMENT", "PAYMENT_FAILED"] },
  { key: "done", label: "Delivered", statuses: ["DELIVERED"] },
  { key: "all", label: "All", statuses: [] as string[] },
] as const;

/** Orders placed on the public landing page, for the team that produces them. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { organizationId } = await requirePermission("order:read");
  const { show } = await searchParams;
  const filter = FILTERS.find((f) => f.key === show) ?? FILTERS[0];

  const [orders, counts] = await Promise.all([
    db.order.findMany({
      where: { organizationId, ...(filter.statuses.length ? { status: { in: [...filter.statuses] } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        number: true,
        kind: true,
        status: true,
        customerName: true,
        customerPhone: true,
        businessName: true,
        amountCents: true,
        imageTokens: true,
        videoSeconds: true,
        createdAt: true,
        paidAt: true,
      },
    }),
    db.order.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
  ]);
  const countFor = (statuses: readonly string[]) =>
    counts.filter((c) => statuses.length === 0 || statuses.includes(c.status)).reduce((n, c) => n + c._count._all, 0);

  return (
    <>
      <PageHeader title="Orders" subtitle="Image and video orders from the website. A platform admin sets each price before the customer pays." />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter orders">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/app/orders?show=${f.key}`}
            className={`min-h-[36px] rounded-full border px-3 py-1.5 text-sm ${
              f.key === filter.key ? "border-primary bg-primary/10 text-primary" : "border-line bg-raised text-muted hover:text-ink"
            }`}
            aria-current={f.key === filter.key ? "page" : undefined}
          >
            {f.label} <span className="tabular-nums">({countFor(f.statuses)})</span>
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <EmptyState title="No orders here">Orders placed on the website appear in this list.</EmptyState>
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">What</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/app/orders/${o.id}`} className="font-medium text-primary hover:underline">
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{o.customerName}</p>
                    <p className="text-xs text-muted">{o.businessName ?? `+${o.customerPhone}`}</p>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {o.kind === "VIDEO" ? `${o.videoSeconds} s video` : o.kind === "IMAGE" ? `${o.imageTokens} image${o.imageTokens === 1 ? "" : "s"}` : "Quote request"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{o.amountCents ? formatKES(o.amountCents) : "-"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={ORDER_STATUS_TONE[o.status] ?? "neutral"}>{statusLabel(o.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {o.createdAt.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })}
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
