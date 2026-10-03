import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Hint } from "@/components/hints/hint";
import { PaymentStatus } from "@/components/platform/billing-bits";
import { EmptyState, PageHeader, TableWrap, formatDateTime } from "@/components/ui";
import { db } from "@/lib/db";
import { formatKES } from "@/lib/money";
import { requirePlatform } from "@/lib/session";
import { listPayments, type PaymentFilters } from "@/server/platform-admin";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const KEYS = ["status", "purpose", "method", "org", "q", "from", "to"] as const;

function query(f: PaymentFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const k of KEYS) if (f[k]) params.set(k, f[k]!);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Every payment across every organisation: plans, top-ups and done-for-you orders. */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<PaymentFilters & { page?: string }> }) {
  await requirePlatform();
  const sp = await searchParams;
  const f: PaymentFilters = Object.fromEntries(KEYS.map((k) => [k, sp[k] || undefined]));
  const page = Math.max(1, Number(sp.page) || 1);
  const [result, orgName] = await Promise.all([
    listPayments(f, page),
    f.org ? db.organization.findUnique({ where: { id: f.org }, select: { name: true } }) : null,
  ]);
  const filtered = KEYS.some((k) => f[k]);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle={orgName ? `Payments by ${orgName.name}.` : "Every payment across every organisation: plans, top-ups and done-for-you orders."}
        actions={
          <>
            <Link href="/platform/subscriptions" className="btn-quiet">
              Subscriptions
            </Link>
            <a href={`/api/platform/payments/export${query(f)}`} className="btn-primary">
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </>
        }
      />
      <Hint id="platform.payments" title="Every payment, from every organisation">
        A payment stuck on Waiting can be re-checked with M-Pesa or Paystack from its detail page. Export to CSV for accounts.
      </Hint>

      <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" method="get">
        {f.org ? <input type="hidden" name="org" value={f.org} /> : null}
        <div className="xl:col-span-2">
          <label className="label" htmlFor="pay-q">Search</label>
          <input id="pay-q" name="q" className="input" defaultValue={f.q ?? ""} placeholder="Organisation, receipt, email, phone" />
        </div>
        <div>
          <label className="label" htmlFor="pay-status">Status</label>
          <select id="pay-status" name="status" className="input" defaultValue={f.status ?? ""}>
            <option value="">Any</option>
            <option value="SUCCEEDED">Paid</option>
            <option value="FAILED">Failed</option>
            <option value="PROCESSING">Waiting</option>
            <option value="PENDING">Pending</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pay-purpose">For</label>
          <select id="pay-purpose" name="purpose" className="input" defaultValue={f.purpose ?? ""}>
            <option value="">Anything</option>
            <option value="SUBSCRIPTION">Plans</option>
            <option value="CREDITS">Top-ups</option>
            <option value="ORDER">Done-for-you orders</option>
            <option value="TOKENS">Tokens (old)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pay-method">Method</label>
          <select id="pay-method" name="method" className="input" defaultValue={f.method ?? ""}>
            <option value="">Any</option>
            <option value="MPESA">M-Pesa</option>
            <option value="PAYSTACK">Paystack</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pay-from">From</label>
          <input id="pay-from" name="from" type="date" className="input" defaultValue={f.from ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="pay-to">To</label>
          <input id="pay-to" name="to" type="date" className="input" defaultValue={f.to ?? ""} />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary w-full">Filter</button>
          {filtered ? (
            <Link href="/platform/payments" className="btn-quiet">Clear</Link>
          ) : null}
        </div>
      </form>

      <p className="mt-4 text-sm text-muted">
        {result.total.toLocaleString("en-KE")} payment{result.total === 1 ? "" : "s"}
        {filtered ? " match" : ""} · <span className="font-medium text-ink">{formatKES(result.collectedCents)}</span> collected from{" "}
        {result.collectedCount.toLocaleString("en-KE")} paid
      </p>

      <div className="mt-3">
        {result.rows.length === 0 ? (
          <EmptyState title="No payments match">Try a wider date range or clear the filters.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Organisation</th>
                  <th className="px-4 py-2 font-medium">For</th>
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Link href={`/platform/payments/${p.id}`} className="text-primary underline-offset-2 hover:underline">
                        {formatDateTime(p.createdAt)}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/platform/orgs/${p.organizationId}`} className="hover:underline">
                        {p.organizationName}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{p.description}</td>
                    <td className="px-4 py-2 text-muted">{p.method}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatKES(p.amountCents)}</td>
                    <td className="px-4 py-2">
                      <PaymentStatus status={p.status} />
                      {p.status === "FAILED" && p.failureReason ? (
                        <p className="mt-0.5 max-w-[220px] truncate text-xs text-muted" title={p.failureReason}>
                          {p.failureReason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted">{p.reference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>

      {result.pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
          <span className="text-muted">
            Page {page} of {result.pages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={`/platform/payments${query(f, { page: String(page - 1) })}`} className="btn-quiet">
                Newer
              </Link>
            ) : null}
            {page < result.pages ? (
              <Link href={`/platform/payments${query(f, { page: String(page + 1) })}`} className="btn-quiet">
                Older
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
