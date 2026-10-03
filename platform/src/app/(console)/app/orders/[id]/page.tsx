import { ArrowLeft, ExternalLink, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderActions } from "@/components/studio/order-actions";
import { Badge, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatKES } from "@/lib/money";
import { ORDER_STATUS_TONE, statusLabel } from "@/lib/order-status";
import { EXTRAS } from "@/lib/pricing";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { assetView } from "@/server/generation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order" };

const when = (d: Date | null) =>
  d ? d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }) : "-";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { principal, organizationId } = await requirePermission("order:read");
  const { id } = await params;

  const order = await db.order.findFirst({
    where: { id, organizationId },
    include: {
      paymentIntents: { orderBy: { createdAt: "desc" } },
      assets: { where: { archivedAt: null }, orderBy: { createdAt: "desc" } },
      studioThreads: { where: { archivedAt: null }, select: { id: true, title: true } },
    },
  });
  if (!order) notFound();

  const files = order.assets.map(assetView);
  const ready = files.filter((f) => f.status === "READY").length;
  const extras = Array.isArray(order.extras) ? (order.extras as string[]) : [];
  const extraLabels = extras.map((k) => EXTRAS.find((x) => x.key === k)?.label ?? k);

  return (
    <>
      <Link href="/app/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All orders
      </Link>
      <PageHeader
        title={`${order.number}: ${order.kind === "VIDEO" ? `${order.videoSeconds}-second video` : order.kind === "IMAGE" ? `${order.imageTokens} image${order.imageTokens === 1 ? "" : "s"}` : "Quote request"}`}
        subtitle={`Placed ${when(order.createdAt)} by ${order.customerName}${order.businessName ? `, ${order.businessName}` : ""}`}
        actions={<Badge tone={ORDER_STATUS_TONE[order.status] ?? "neutral"}>{statusLabel(order.status)}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold text-ink">Brief</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{order.brief}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Shape</dt>
                <dd className="text-ink">{order.aspectRatio ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted">Credits</dt>
                <dd className="text-ink">
                  {order.credits ? `${order.credits} credits` : order.videoTokens ? `${order.videoTokens} video token(s), before credits` : order.kind === "IMAGE" ? `${order.imageTokens} image token(s), before credits` : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Amount</dt>
                <dd className="font-semibold text-ink">{order.amountCents ? formatKES(order.amountCents) : "Not priced yet"}</dd>
              </div>
            </dl>
            {extraLabels.length > 0 && (
              <p className="mt-4 text-sm">
                <span className="text-muted">Also asked for (price on request): </span>
                <span className="text-ink">{extraLabels.join(", ")}</span>
              </p>
            )}
            {order.referenceLink && (
              <a
                href={order.referenceLink}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Reference files <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </section>

          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-ink">Production</h2>
              {order.studioThreads[0] && (
                <Link href={`/content?project=${order.studioThreads[0].id}`} className="text-sm font-medium text-primary hover:underline">
                  Studio project: {order.studioThreads[0].title}
                </Link>
              )}
            </div>
            <div className="mt-4">
              <OrderActions orderId={order.id} status={order.status} readyFiles={ready} canWrite={can(principal, "order:write")} />
            </div>
            {files.length > 0 ? (
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {files.map((f) => (
                  <li key={f.id} className="overflow-hidden rounded-lg border border-line">
                    <Link href={`/content/assets/${f.id}`} className="block bg-neutral-950">
                      {f.status === "READY" && f.fileUrl ? (
                        f.mediaType === "VIDEO" ? (
                          <video src={f.fileUrl} muted playsInline preload="metadata" className="aspect-video w-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.fileUrl} alt={f.prompt} className="aspect-video w-full object-cover" />
                        )
                      ) : (
                        <div className="flex aspect-video items-center justify-center text-sm text-ink/60">
                          {f.status === "GENERATING" ? "Generating…" : "Failed"}
                        </div>
                      )}
                    </Link>
                    <p className="line-clamp-2 p-3 text-xs text-muted">{f.prompt}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">
                {order.status === "PAID" || order.status === "IN_PRODUCTION"
                  ? "No files yet. Start in the Studio; everything generated in the order's project is attached here."
                  : "Files appear here once the order is paid and in production."}
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-5 text-sm">
            <h2 className="font-semibold text-ink">Customer</h2>
            <p className="mt-2 text-ink">{order.customerName}</p>
            {order.businessName && <p className="text-muted">{order.businessName}</p>}
            <a href={`tel:+${order.customerPhone}`} className="mt-2 inline-flex items-center gap-1 text-primary hover:underline">
              <Phone className="h-3.5 w-3.5" /> +{order.customerPhone}
            </a>
            {order.customerEmail && (
              <p className="mt-1">
                <a href={`mailto:${order.customerEmail}`} className="text-primary hover:underline">
                  {order.customerEmail}
                </a>
              </p>
            )}
            <p className="mt-3 text-xs text-muted">
              Customer&apos;s order page: <span className="break-all font-mono">/order/{order.publicToken.slice(0, 6)}…</span> (they hold the full link)
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
                      <Badge tone={p.status === "SUCCEEDED" ? "success" : p.status === "FAILED" ? "danger" : "warning"}>
                        {p.status.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {p.provider === "SIMULATOR" ? "Simulated" : "M-Pesa"} to +{p.phone} · {when(p.createdAt)}
                    </p>
                    {p.receiptRef && <p className="mt-1 text-xs text-ink">Receipt {p.receiptRef}</p>}
                    {p.failureReason && <p className="mt-1 text-xs text-danger">{p.failureReason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5 text-sm">
            <h2 className="font-semibold text-ink">Timeline</h2>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between gap-3"><dt className="text-muted">Placed</dt><dd className="text-ink">{when(order.createdAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Paid</dt><dd className="text-ink">{when(order.paidAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Delivered</dt><dd className="text-ink">{when(order.deliveredAt)}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
