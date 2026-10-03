import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PaymentStatus } from "@/components/platform/billing-bits";
import { PageHeader, formatDateTime } from "@/components/ui";
import { formatKES } from "@/lib/money";
import { requirePlatform } from "@/lib/session";
import { methodLabel, paymentDetail, purposeLabel } from "@/server/platform-admin";

import { RecheckButton } from "./recheck-button";

export const metadata: Metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

/** One payment, everything support needs: who, what, how, the provider's last word, what it paid for. */
export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatform();
  const { id } = await params;
  const p = await paymentDetail(id);
  if (!p) notFound();

  const rows: Array<[string, ReactNode]> = [
    ["Organisation", <Link key="o" href={`/platform/orgs/${p.organization.id}`} className="text-primary hover:underline">{p.organization.name}</Link>],
    ["For", purposeLabel(p)],
    ["Amount", formatKES(p.amountCents, { decimals: true })],
    ["Method", methodLabel(p.provider, p.channel)],
    ["Payer", p.phone ? `+${p.phone}` : (p.email ?? "—")],
    ["Started", formatDateTime(p.createdAt)],
    ["Finished", formatDateTime(p.completedAt)],
    ["Receipt", p.receiptRef ?? "—"],
    ["Provider reference", p.providerRef ?? "—"],
    ["Charged automatically", p.automatic ? "Yes (card renewal)" : "No"],
  ];
  if (p.failureReason) rows.push(["Why it failed", p.failureReason]);
  if (p.order) rows.push(["Order", <Link key="ord" href={`/app/orders/${p.order.id}`} className="text-primary hover:underline">{p.order.number} · {p.order.customerName}</Link>]);

  return (
    <>
      <PageHeader
        title={`${formatKES(p.amountCents)} · ${purposeLabel(p)}`}
        subtitle={`Payment ${p.id}`}
        back={{ href: "/platform/payments", label: "All payments" }}
        actions={<PaymentStatus status={p.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <dl className="card divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[11rem_1fr] gap-3 px-4 py-3 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="font-medium text-ink">Check with the provider</h2>
            <p className="mt-1 text-sm text-muted">
              Asks {p.provider.startsWith("PAYSTACK") ? "Paystack" : "M-Pesa"} again and applies its answer once. Use it for a payment stuck on
              &ldquo;waiting&rdquo; or one a customer says went through.
            </p>
            <div className="mt-3">
              <RecheckButton id={p.id} disabled={p.status === "SUCCEEDED" || p.status === "FAILED"} />
            </div>
          </div>
          {p.ledger.length > 0 ? (
            <div className="card p-4">
              <h2 className="font-medium text-ink">Credits it added</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {p.ledger.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span className="text-muted">{l.reason.toLowerCase()} {l.note ? `· ${l.note}` : ""}</span>
                    <span className="tabular-nums text-success">+{l.delta}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {p.providerPayload ? (
            <details className="card p-4 text-sm">
              <summary className="cursor-pointer font-medium text-ink">Provider&apos;s last response</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/40 p-3 text-xs text-muted">{p.providerPayload}</pre>
            </details>
          ) : null}
        </div>
      </div>
    </>
  );
}
