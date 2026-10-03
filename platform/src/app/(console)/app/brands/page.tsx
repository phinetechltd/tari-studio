import type { Metadata } from "next";
import Link from "next/link";
import { Hint } from "@/components/hints/hint";
import { PageHeader, Badge, EmptyState, TableWrap } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Brands" };

const statusTone: Record<string, "success" | "neutral"> = { ACTIVE: "success", ARCHIVED: "neutral" };

export default async function BrandsPage() {
  const { principal, organizationId } = await requirePermission("brand:read");

  const brands = await db.brand.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { catalogueItems: true, tasks: true, channels: true, campaigns: true, posts: true } },
      creator: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Brands"
        subtitle={`${organizationId} · manage client brands and their catalogues`}
        actions={
          <Link
            href="/app/brands/new"
            className="btn-primary"
          >
            + New Brand
          </Link>
        }
      />
      <Hint id="brands.intro" title="A brand keeps everything on-message">
        Name, colours, tone and logo. The Studio, captions and WhatsApp replies all use the brand you pick.
      </Hint>

      {brands.length === 0 ? (
        <EmptyState title="No brands yet">
          Create your first brand to start building a catalogue and content calendar.
        </EmptyState>
      ) : (
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-4 py-2 font-medium">Brand</th>
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Catalogue</th>
                <th className="px-4 py-2 font-medium">Content</th>
                <th className="px-4 py-2 font-medium">Channels</th>
                <th className="px-4 py-2 font-medium">Campaigns</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/app/brands/${b.id}`}
                      className="inline-flex min-h-[44px] items-center font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {b.name}
                    </Link>
                    <div className="text-muted">{b.slug}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{b.brandNumber}</td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone[b.status] ?? "neutral"}>
                      {b.status === "ACTIVE" ? "Active" : "Archived"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-muted">{b._count.catalogueItems}</td>
                  <td className="px-4 py-2 text-muted">{b._count.tasks}</td>
                  <td className="px-4 py-2 text-muted">{b._count.channels}</td>
                  <td className="px-4 py-2 text-muted">{b._count.campaigns}</td>
                  <td className="px-4 py-2 text-muted whitespace-nowrap">
                    {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(b.createdAt)}
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
