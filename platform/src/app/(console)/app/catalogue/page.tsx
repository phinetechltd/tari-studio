import type { Metadata } from "next";
import Link from "next/link";
import { Hint } from "@/components/hints/hint";
import { PageHeader, Badge, EmptyState, TableWrap } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Catalogue" };

export default async function CataloguePage() {
  const { principal, organizationId } = await requirePermission("catalogue:read");

  const brands = await db.brand.findMany({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    include: {
      catalogueItems: {
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
      },
      _count: { select: { catalogueItems: true } },
    },
  });

  const totalItems = brands.reduce((sum, b) => sum + b._count.catalogueItems, 0);

  return (
    <>
      <PageHeader
        title="Catalogue"
        subtitle={`${organizationId} · manage product and service catalogues across brands`}
        actions={
          <Link
            href="/app/catalogue/new"
            className="btn-primary"
          >
            + New Item
          </Link>
        }
      />
      <Hint id="catalogue.intro" title="What you sell, with prices">
        Products and services listed here feed captions, quotes and automatic replies.
      </Hint>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {brands.length} brand{brands.length !== 1 ? "s" : ""} · {totalItems} product{totalItems !== 1 ? "s" : ""}
        </p>
      </div>

      {brands.length === 0 ? (
        <EmptyState title="No brands with catalogues">
          Create a brand first, then add catalogue items to it.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {brands.map((brand) => (
            <section key={brand.id} aria-labelledby={`brand-${brand.id}`}>
              <h2
                id={`brand-${brand.id}`}
                className="mb-3 flex items-center gap-2 text-lg font-medium"
              >
                <span>{brand.name}</span>
                <Badge tone="neutral">{brand.brandNumber}</Badge>
                <span className="text-muted text-sm font-normal">({brand._count.catalogueItems} items)</span>
              </h2>

              {brand.catalogueItems.length === 0 ? (
                <EmptyState title={`No items in ${brand.name}`}>
                  Add products and services to this brand&apos;s catalogue.
                </EmptyState>
              ) : (
                <TableWrap>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-muted">
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">SKU</th>
                        <th className="px-4 py-2 font-medium">Category</th>
                        <th className="px-4 py-2 font-medium">Price</th>
                        <th className="px-4 py-2 font-medium">Tags</th>
                        <th className="px-4 py-2 font-medium">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brand.catalogueItems.map((item) => {
                        const tags = (item.tags as unknown as string[]) ?? [];
                        return (
                          <tr key={item.id} className="border-b border-line last:border-0">
                            <td className="px-4 py-2 font-medium">{item.name}</td>
                            <td className="px-4 py-2 font-mono text-xs text-muted">{item.sku ?? "—"}</td>
                            <td className="px-4 py-2 text-muted">{item.category ?? "—"}</td>
                            <td className="px-4 py-2 text-muted font-mono">
                              {item.priceCents ? `KES ${item.priceCents / 100}` : "On request"}
                            </td>
                            <td className="px-4 py-2">
                              {tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {tags.slice(0, 4).map((tag: string) => (
                                    <Badge key={tag} tone="neutral">{tag}</Badge>
                                  ))}
                                  {tags.length > 4 && <Badge tone="neutral">+{tags.length - 4}</Badge>}
                                </div>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-muted whitespace-nowrap text-xs">
                              {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(item.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
