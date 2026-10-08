import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Hint } from "@/components/hints/hint";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatKES } from "@/lib/money";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listProducts } from "@/server/products";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

const chip = (on: boolean) =>
  `min-h-[36px] rounded-full border px-3 py-1.5 text-sm ${on ? "border-primary bg-primary/10 text-primary" : "border-line bg-raised text-muted hover:text-ink"}`;

/** What each brand sells: pictures, prices, details and (optionally) stock. */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ brand?: string; q?: string; filter?: string }> }) {
  const { principal, organizationId } = await requirePermission("product:read");
  const { brand, q, filter } = await searchParams;
  const canWrite = can(principal, "product:write");
  const [brands, products, tracked] = await Promise.all([
    db.brand.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listProducts(organizationId, { brandId: brand, q: q?.slice(0, 80), includeArchived: filter === "archived", onlyLowStock: filter === "low" }),
    db.catalogueItem.count({ where: { organizationId, status: "ACTIVE", trackStock: true } }),
  ]);
  const shown = filter === "archived" ? products.filter((p) => p.archived) : products;
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { brand, q, filter, ...over };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/products${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="What you sell, with pictures and prices. The Studio and Autopilot use these, and AI captions may only quote what is written here."
        actions={
          canWrite ? (
            <Link href={brand ? `/app/products/new?brandId=${brand}` : "/app/products/new"} className="btn-primary">
              <Plus className="h-4 w-4" /> New product
            </Link>
          ) : null
        }
      />
      <Hint id="products.intro" title="Pictures make better content">
        Add a clear photo of each product. Pick the product in the Studio and its photo can be the first frame of a video.
      </Hint>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <label className="sr-only" htmlFor="pq">Search products</label>
        <input id="pq" name="q" defaultValue={q ?? ""} className="input max-w-xs" placeholder="Search by name, SKU or category" />
        {brand && <input type="hidden" name="brand" value={brand} />}
        {filter && <input type="hidden" name="filter" value={filter} />}
        <button className="btn-quiet" type="submit">Search</button>
      </form>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter products">
        <Link href={href({ filter: undefined })} className={chip(!filter)}>Active</Link>
        {tracked > 0 && <Link href={href({ filter: "low" })} className={chip(filter === "low")}>Low or out of stock</Link>}
        <Link href={href({ filter: "archived" })} className={chip(filter === "archived")}>Archived</Link>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
        <Link href={href({ brand: undefined })} className={chip(!brand)}>All brands</Link>
        {brands.map((b) => (
          <Link key={b.id} href={href({ brand: b.id })} className={chip(brand === b.id)}>{b.name}</Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        brands.length === 0 ? (
          <EmptyState title="Add a brand first" action={<Link href="/app/brands/new" className="btn-primary">Create a brand</Link>}>
            Products belong to a brand.
          </EmptyState>
        ) : (
          <EmptyState
            title={filter === "archived" ? "Nothing archived" : filter === "low" ? "Nothing is running low" : q ? "No products match" : "No products yet"}
            action={!filter && !q && canWrite ? <Link href="/app/products/new" className="btn-primary">Add your first product</Link> : undefined}
          >
            {filter || q ? "Try another filter." : "Add what you sell, with a photo and a price."}
          </EmptyState>
        )
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((p) => (
            <li key={p.id}>
              <Link href={`/app/products/${p.id}`} className="card group block overflow-hidden transition-colors hover:border-primary/50">
                <div className="relative aspect-square overflow-hidden bg-surface">
                  {p.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl font-semibold text-primary/50">{p.name.slice(0, 1)}</div>
                  )}
                  {(p.outOfStock || p.lowStock) && (
                    <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.outOfStock ? "bg-danger text-onprimary" : "bg-warning text-onprimary"}`}>
                      {p.outOfStock ? "Out of stock" : "Running low"}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate font-semibold text-ink">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.priceCents !== null ? formatKES(p.priceCents, { decimals: p.priceCents % 100 !== 0 }) : "Price on request"}
                    {p.trackStock ? ` · ${p.stockQty} in stock` : ""}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                    {p.brandName}
                    {p.archived && <Badge tone="neutral">Archived</Badge>}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
