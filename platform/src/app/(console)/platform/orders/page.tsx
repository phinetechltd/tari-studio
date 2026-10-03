import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge, EmptyState, PageHeader, TableWrap, formatDateTime } from "@/components/ui";
import { formatKES } from "@/lib/money";
import { ORDER_STATUS_TONE } from "@/lib/order-status";
import { requirePlatform } from "@/lib/session";
import { listOrders, ORDER_STATUSES, STATUS_LABEL, type AdminOrderFilters } from "@/server/platform-orders";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

function what(o: { kind: string; imageTokens: number; videoSeconds: number }): string {
  if (o.kind === "VIDEO") return `${o.videoSeconds}-second video`;
  if (o.kind === "IMAGE") return `${o.imageTokens} image${o.imageTokens === 1 ? "" : "s"}`;
  return "Custom request";
}

/** Every done-for-you order: requests waiting for a price first. The admin prices, edits and submits them. */
export default async function PlatformOrdersPage({ searchParams }: { searchParams: Promise<AdminOrderFilters & { page?: string }> }) {
  await requirePlatform();
  const sp = await searchParams;
  const f: AdminOrderFilters = { status: sp.status || undefined, source: sp.source || undefined, q: sp.q || undefined };
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, pageSize, counts } = await listOrders(f, page);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (f.status) p.set("status", f.status);
    if (f.source) p.set("source", f.source);
    if (f.q) p.set("q", f.q);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const pill = (active: boolean) =>
    `min-h-[36px] rounded-full border px-3 py-1.5 text-sm ${active ? "border-primary bg-primary/10 text-primary" : "border-line bg-raised text-muted hover:text-ink"}`;

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Requests from the website and orders you enter yourself. You set the price, then submit it to the customer."
        actions={
          <Link href="/platform/orders/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New order
          </Link>
        }
      />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter by status">
        <Link href="/platform/orders" className={pill(!f.status)}>
          All
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={`/platform/orders${link({ status: s, page: "1" })}`} className={pill(f.status === s)}>
            {STATUS_LABEL[s]} <span className="tabular-nums opacity-70">{counts[s] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]" method="get">
        {f.status ? <input type="hidden" name="status" value={f.status} /> : null}
        <input name="q" className="input" defaultValue={f.q ?? ""} placeholder="Search number, name, phone, email, business" aria-label="Search orders" />
        <select name="source" className="input" defaultValue={f.source ?? ""} aria-label="Source">
          <option value="">Any source</option>
          <option value="PUBLIC">Website</option>
          <option value="ADMIN">Entered by admin</option>
        </select>
        <button className="btn-quiet" type="submit">
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No orders here">Requests from the landing page and orders you enter will appear in this list.</EmptyState>
      ) : (
        <TableWrap>
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Customer</th>
                <th className="p-3">What</th>
                <th className="p-3 text-right">Estimate</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3">Status</th>
                <th className="p-3">Placed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-line hover:bg-wash/[0.04]">
                  <td className="p-3">
                    <Link href={`/platform/orders/${o.id}`} className="font-medium text-primary hover:underline">
                      {o.number}
                    </Link>
                    {o.source === "ADMIN" ? <span className="ml-2 text-xs text-muted">admin</span> : null}
                  </td>
                  <td className="p-3">
                    <p className="text-ink">{o.customerName}</p>
                    <p className="text-xs text-muted">+{o.customerPhone}</p>
                  </td>
                  <td className="p-3 text-ink">{what(o)}</td>
                  <td className="p-3 text-right tabular-nums text-muted">{o.suggestedCents ? formatKES(o.suggestedCents) : "-"}</td>
                  <td className="p-3 text-right font-medium tabular-nums text-ink">{o.amountCents ? formatKES(o.amountCents) : "-"}</td>
                  <td className="p-3">
                    <Badge tone={ORDER_STATUS_TONE[o.status] ?? "neutral"}>{STATUS_LABEL[o.status] ?? o.status}</Badge>
                  </td>
                  <td className="p-3 text-muted">{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            Page {page} of {pages} · {total} orders
          </span>
          <span className="flex gap-2">
            {page > 1 && (
              <Link className="btn-quiet" href={`/platform/orders${link({ page: String(page - 1) })}`}>
                Previous
              </Link>
            )}
            {page < pages && (
              <Link className="btn-quiet" href={`/platform/orders${link({ page: String(page + 1) })}`}>
                Next
              </Link>
            )}
          </span>
        </div>
      )}
    </>
  );
}
