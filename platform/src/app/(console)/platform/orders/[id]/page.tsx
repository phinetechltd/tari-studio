import type { Metadata } from "next";
import Link from "next/link";

import { OrderAdminForm, type AdminOrderValues } from "@/components/platform/order-admin";
import { OrderActions } from "@/components/studio/order-actions";
import { Badge, Notice, PageHeader, formatDateTime } from "@/components/ui";
import { env } from "@/lib/env";
import { formatKES } from "@/lib/money";
import { ORDER_STATUS_TONE } from "@/lib/order-status";
import { requirePlatform } from "@/lib/session";
import { getOrder, STATUS_LABEL } from "@/server/platform-orders";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

export default async function PlatformOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatform();
  const { id } = await params;
  const { order, readyFiles, pricedByName } = await getOrder(id);

  const locked = !["REQUESTED", "PENDING_PAYMENT", "PAYMENT_FAILED"].includes(order.status);
  const initial: AdminOrderValues = {
    id: order.id,
    kind: (order.kind as AdminOrderValues["kind"]) ?? "IMAGE",
    images: Math.max(1, order.imageTokens),
    seconds: order.videoSeconds || 10,
    aspectRatio: order.aspectRatio ?? (order.kind === "VIDEO" ? "9:16" : "1:1"),
    brief: order.brief,
    extras: Array.isArray(order.extras) ? (order.extras as string[]) : [],
    referenceLink: order.referenceLink ?? "",
    name: order.customerName,
    phone: order.customerPhone,
    email: order.customerEmail ?? "",
    business: order.businessName ?? "",
    adminNote: order.adminNote ?? "",
    priceKes: order.amountCents ? String(order.amountCents / 100) : "",
  };
  const customerUrl = `${env().APP_BASE_URL.replace(/\/$/, "")}/order/${order.publicToken}`;

  return (
    <>
      <Link href="/platform/orders" className="mb-3 inline-flex text-sm text-muted hover:text-ink">
        All orders
      </Link>
      <PageHeader
        title={`${order.number}: ${order.customerName}`}
        subtitle={`${order.source === "ADMIN" ? "Entered by an admin" : "Requested on the website"} ${formatDateTime(order.createdAt)}${pricedByName ? `. Priced by ${pricedByName}` : ""}`}
        actions={<Badge tone={ORDER_STATUS_TONE[order.status] ?? "neutral"}>{STATUS_LABEL[order.status] ?? order.status}</Badge>}
      />

      {order.status === "REQUESTED" && (
        <div className="mb-4">
          <Notice tone="warning" title="Waiting for your price">
            Set the price below and submit. The customer then receives a link to pay. Nothing is charged before that.
          </Notice>
        </div>
      )}
      {locked && order.status !== "CANCELLED" && (
        <div className="mb-4">
          <Notice tone="info" title="Paid orders are fixed">
            The price and details cannot change once the customer has paid. You can still keep an internal note.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <OrderAdminForm
            mode="edit"
            initial={initial}
            status={order.status}
            estimateKes={order.suggestedCents ? order.suggestedCents / 100 : undefined}
            locked={locked}
          />
        </div>

        <aside className="space-y-6">
          <section className="card p-5 text-sm">
            <h2 className="font-semibold text-ink">Customer link</h2>
            <p className="mt-2 break-all font-mono text-xs text-muted">{customerUrl}</p>
            <p className="mt-2 text-xs text-muted">They pay and follow the order here. Share it yourself if the SMS did not reach them.</p>
          </section>

          <section className="card p-5 text-sm">
            <h2 className="font-semibold text-ink">Production</h2>
            <div className="mt-3">
              <OrderActions orderId={order.id} status={order.status} readyFiles={readyFiles} canWrite />
            </div>
            {order.studioThreads[0] ? (
              <p className="mt-3 text-xs text-muted">
                Work happens in the Studio of {order.organization.name}. Switch to that organisation (top of the side menu) to open the project.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              {readyFiles} finished file{readyFiles === 1 ? "" : "s"} attached.
            </p>
          </section>

          <section className="card p-5 text-sm">
            <h2 className="font-semibold text-ink">Payments</h2>
            {order.paymentIntents.length === 0 ? (
              <p className="mt-2 text-muted">No payment attempts.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {order.paymentIntents.map((p) => (
                  <li key={p.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{formatKES(p.amountCents)}</span>
                      <Badge tone={p.status === "SUCCEEDED" ? "success" : p.status === "FAILED" ? "danger" : "warning"}>{p.status.toLowerCase()}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {p.provider.startsWith("PAYSTACK") ? "Paystack" : "M-Pesa"}
                      {p.provider.endsWith("SIMULATOR") || p.provider === "SIMULATOR" ? " (simulated)" : ""} · {formatDateTime(p.createdAt)}
                    </p>
                    {p.receiptRef && <p className="mt-1 text-xs text-ink">Receipt {p.receiptRef}</p>}
                    {p.failureReason && <p className="mt-1 text-xs text-danger">{p.failureReason}</p>}
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/platform/payments?purpose=ORDER&q=${order.number}`} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
              Open in Payments (recheck, export)
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
