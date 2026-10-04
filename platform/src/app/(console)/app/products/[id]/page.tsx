import type { Metadata } from "next";
import Link from "next/link";

import { ProductForm, priceText } from "@/components/products/product-form";
import { StockPanel } from "@/components/products/stock-panel";
import { Badge, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatKES } from "@/lib/money";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getProduct, listMovements } from "@/server/products";

export const metadata: Metadata = { title: "Product" };
export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { principal, organizationId } = await requirePermission("product:read");
  const { id } = await params;
  const p = await getProduct(principal, id);
  const canWrite = can(principal, "product:write");
  const canStock = can(principal, "product:stock");
  const [brands, movements] = await Promise.all([
    db.brand.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    p.trackStock ? listMovements(principal, id) : Promise.resolve([]),
  ]);

  return (
    <>
      <Link href="/app/products" className="mb-3 inline-flex text-sm text-muted hover:text-ink">All products</Link>
      <PageHeader
        title={p.name}
        subtitle={`${p.brandName ?? ""}${p.priceCents !== null ? ` · ${formatKES(p.priceCents, { decimals: p.priceCents % 100 !== 0 })}` : ""}`}
        actions={p.archived ? <Badge tone="neutral">Archived</Badge> : null}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {canWrite ? (
          <ProductForm
            initial={{
              id: p.id,
              brandId: p.brandId,
              name: p.name,
              sku: p.sku ?? "",
              description: p.description ?? "",
              price: priceText(p.priceCents),
              category: p.category ?? "",
              unit: p.unit ?? "",
              url: p.url ?? "",
              details: Object.entries(p.attributes).map(([name, value]) => ({ name, value })),
              trackStock: p.trackStock,
              stockQty: String(p.stockQty ?? 0),
              lowStockAt: p.lowStockAt === null ? "" : String(p.lowStockAt),
              archived: p.archived,
              images: p.images,
            }}
            brands={brands}
          />
        ) : (
          <section className="card p-5">
            <p className="whitespace-pre-wrap text-sm text-ink">{p.description || "No description."}</p>
            <ul className="mt-4 grid grid-cols-3 gap-3">
              {p.images.map((img) => (
                <li key={img.id} className="overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={p.name} className="aspect-square w-full object-cover" loading="lazy" />
                </li>
              ))}
            </ul>
          </section>
        )}
        <aside className="space-y-6">
          <section className="card p-5 text-sm">
            <h2 className="font-semibold text-ink">Use it</h2>
            <p className="mt-2 text-muted">Pick this product in the Studio and its name, description and price go into your prompt. Its first picture can start a video.</p>
            <Link href={`/content?brand=${p.brandId}&product=${p.id}`} className="btn-primary mt-3">Make something with it</Link>
            <Link href={`/app/autopilot/new?brand=${p.brandId}&product=${p.id}`} className="btn-quiet mt-2">Post it automatically</Link>
          </section>
          {p.trackStock && <StockPanel productId={p.id} qty={p.stockQty ?? 0} lowStockAt={p.lowStockAt} movements={movements} canAdjust={canStock} />}
        </aside>
      </div>
    </>
  );
}
