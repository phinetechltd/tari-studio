import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Badge, EmptyState, TableWrap } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { brandAnalytics } from "@/server/brands";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await db.brand.findUnique({ where: { id }, select: { name: true } });
  return { title: brand ? `${brand.name} — Brand` : "Brand" };
}

const statusTone = { ACTIVE: "success", ARCHIVED: "neutral" } as const;

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { principal, organizationId } = await requirePermission("brand:read");
  const { id } = await params;

  const brand = await db.brand.findUnique({
    where: { id },
    include: {
      catalogueItems: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
      channels: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
      tasks: { where: { status: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" }, take: 20, include: { assignee: { select: { name: true, id: true } } } },
      campaigns: { where: { status: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" }, take: 10 },
      creator: { select: { name: true, email: true } },
      _count: { select: { catalogueItems: true, tasks: true, channels: true, campaigns: true, posts: true } },
    },
  });

  if (!brand || brand.organizationId !== organizationId) notFound();

  const teamMembers = await db.membership.findMany({
    where: { organizationId, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const analytics = await brandAnalytics(id);

  return (
    <>
      <PageHeader
        title={brand.name}
        subtitle={`${brand.brandNumber} · ${brand.slug} · ${brand.status === "ACTIVE" ? "Active" : "Archived"}`}
        avatarUrl={brand.avatarUrl ?? undefined}
        actions={
          <>
            <Link
              href={`/app/brands/${brand.id}/edit`}
              className="inline-flex min-h-[44px] items-center rounded-button border border-amber/40 bg-amber/10 px-4 py-2 text-sm font-medium text-amber transition-colors hover:bg-amber/20 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50"
            >
              Edit Brand
            </Link>
            <Link
              href={`/app/content/new?brandId=${brand.id}`}
              className="btn-primary"
            >
              + New Content Task
            </Link>
            <Link
              href={`/app/campaigns/new?brandId=${brand.id}`}
              className="btn-primary"
            >
              + New Campaign
            </Link>
            <Link
              href={`/app/catalogue/new?brandId=${brand.id}`}
              className="inline-flex min-h-[44px] items-center rounded-button border border-line bg-bg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink ml-2"
            >
              + Catalogue Item
            </Link>
            <Link
              href={`/app/social/new?brandId=${brand.id}`}
              className="inline-flex min-h-[44px] items-center rounded-button border border-line bg-bg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink ml-2"
            >
              Connect Channel
            </Link>
          </>
        }
      />

      {/* Quick stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { label: "Catalogue Items", count: brand._count.catalogueItems, href: `/app/brands/${brand.id}` },
          { label: "Content Tasks", count: brand._count.tasks, href: "/app/content" },
          { label: "Social Channels", count: brand._count.channels, href: "/app/social" },
          { label: "Campaigns", count: brand._count.campaigns, href: "/app/campaigns" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="text-2xl font-semibold">{s.count}</div>
            <div className="text-sm text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Brand settings summary */}
      {(brand.timezone || brand.defaultCurrency) && (
        <section aria-labelledby="settings" className="card mb-8 p-4">
          <h2 id="settings" className="mb-2 text-sm font-medium">Brand Settings</h2>
          <div className="space-y-1 text-sm">
            {brand.timezone && <div><span className="text-muted">Timezone:</span> {brand.timezone}</div>}
            {brand.defaultCurrency && <div><span className="text-muted">Default Currency:</span> {brand.defaultCurrency}</div>}
          </div>
        </section>
      )}

      {/* Contact info */}
      {(brand.contactName || brand.contactEmail || brand.contactPhone || brand.website) && (
        <section aria-labelledby="contact" className="card mb-8 p-4">
          <h2 id="contact" className="mb-2 text-sm font-medium">Contact</h2>
          <div className="space-y-1 text-sm">
            {brand.contactName && <div><span className="text-muted">Name:</span> {brand.contactName}</div>}
            {brand.contactEmail && <div><span className="text-muted">Email:</span> <a href={`mailto:${brand.contactEmail}`} className="underline text-primary">{brand.contactEmail}</a></div>}
            {brand.contactPhone && <div><span className="text-muted">Phone:</span> {brand.contactPhone}</div>}
            {brand.website && <div><span className="text-muted">Website:</span> <a href={brand.website} target="_blank" rel="noopener noreferrer" className="underline text-primary">{brand.website}</a></div>}
          </div>
        </section>
      )}

      {/* Analytics summary */}
      <section aria-labelledby="analytics" className="card mb-8 p-4">
        <h2 id="analytics" className="mb-3 text-lg font-medium">Analytics Summary</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-card border border-line bg-surface/50 p-3">
            <div className="text-2xl font-semibold">{analytics.publishedPosts} / {analytics.totalPosts}</div>
            <div className="text-sm text-muted">Posts published</div>
          </div>
          <div className="rounded-card border border-line bg-surface/50 p-3">
            <div className="text-2xl font-semibold">{analytics.clicks.toLocaleString("en-KE")}</div>
            <div className="text-sm text-muted">Tracked-link clicks</div>
          </div>
          <div className="rounded-card border border-line bg-surface/50 p-3">
            <div className="text-2xl font-semibold">{analytics.leads.toLocaleString("en-KE")}</div>
            <div className="text-sm text-muted">WhatsApp leads</div>
          </div>
          <div className="rounded-card border border-line bg-surface/50 p-3">
            <div className="text-2xl font-semibold">{analytics.engagement.total.toLocaleString("en-KE")}</div>
            <div className="text-sm text-muted">Engagement (likes, comments, shares)</div>
          </div>
        </div>
        {analytics.recentPosts.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-medium text-muted">Recent Posts</h3>
            {analytics.recentPosts.map(post => (
              <div key={post.id} className="flex items-center justify-between text-sm py-1 border-b border-line/50 last:border-0">
                <div>
                  <span className="font-medium">{post.channel?.name ?? "Unknown"}</span>
                  <span className="text-muted ml-2">{post.channel?.platform}</span>
                </div>
                <div className="text-muted text-xs">{post.status.charAt(0) + post.status.slice(1).toLowerCase()}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Team members */}
      <section aria-labelledby="team" className="mb-8">
        <h2 id="team" className="mb-3 text-lg font-medium">Team Members ({teamMembers.length})</h2>
        {teamMembers.length === 0 ? (
          <EmptyState title="No team members">Add members to your organization to collaborate on this brand.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Assigned Tasks</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.map(member => {
                  const assignedTasks = brand.tasks.filter(t => t.assignee?.id === member.user.id);
                  return (
                    <tr key={member.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 font-medium">{member.user.name}</td>
                      <td className="px-4 py-2 text-muted">{member.user.email}</td>
                      <td className="px-4 py-2"><Badge>{member.role}</Badge></td>
                      <td className="px-4 py-2 text-muted">{assignedTasks.length} task{assignedTasks.length !== 1 ? "s" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

      {/* Catalogue */}
      <section aria-labelledby="catalogue" className="mb-8">
        <h2 id="catalogue" className="mb-3 text-lg font-medium">Catalogue Items ({brand._count.catalogueItems})</h2>
        {brand.catalogueItems.length === 0 ? (
          <EmptyState title="No catalogue items">Add products and services for this brand.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {brand.catalogueItems.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium">{item.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted">{item.sku ?? "—"}</td>
                    <td className="px-4 py-2 text-muted">{item.category ?? "—"}</td>
                    <td className="px-4 py-2 text-muted">{item.priceCents ? `KES ${item.priceCents / 100}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

      {/* Channels */}
      <section aria-labelledby="channels" className="mb-8">
        <h2 id="channels" className="mb-3 text-lg font-medium">Social Channels ({brand._count.channels})</h2>
        {brand.channels.length === 0 ? (
          <EmptyState title="No channels connected">Connect Facebook, Instagram, WhatsApp or other accounts.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2 font-medium">Platform</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Handle</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {brand.channels.map((ch) => (
                  <tr key={ch.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">
                      <Badge tone={ch.status === "ACTIVE" ? "success" : "warning"}>{ch.platform}</Badge>
                    </td>
                    <td className="px-4 py-2 font-medium">{ch.name}</td>
                    <td className="px-4 py-2 text-muted">{ch.handle ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge tone={ch.status === "ACTIVE" ? "success" : "warning"}>
                        {ch.status === "ACTIVE" ? "Connected" : ch.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

      {/* Recent Tasks */}
      <section aria-labelledby="tasks" className="mb-8">
        <h2 id="tasks" className="mb-3 text-lg font-medium">Recent Content Tasks ({brand._count.tasks})</h2>
        {brand.tasks.length === 0 ? (
          <EmptyState title="No content tasks">Create a content brief to get started.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2 font-medium">Task</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Priority</th>
                  <th className="px-4 py-2 font-medium">Assignee</th>
                </tr>
              </thead>
              <tbody>
                {brand.tasks.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">
                      <span className="font-medium text-ink">{t.title}</span>
                      <div className="text-muted text-xs font-mono">{t.taskNumber}</div>
                    </td>
                    <td className="px-4 py-2"><Badge>{t.contentType}</Badge></td>
                    <td className="px-4 py-2"><Badge tone={t.status === "APPROVED" || t.status === "PUBLISHED" ? "success" : t.status === "REJECTED" ? "danger" : "neutral"}>{t.status}</Badge></td>
                    <td className="px-4 py-2"><Badge tone={t.priority === "URGENT" ? "danger" : t.priority === "HIGH" ? "warning" : "neutral"}>{t.priority}</Badge></td>
                    <td className="px-4 py-2 text-muted">{t.assignee?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

      {/* Recent Campaigns */}
      <section aria-labelledby="campaigns">
        <h2 id="campaigns" className="mb-3 text-lg font-medium">Recent Campaigns ({brand._count.campaigns})</h2>
        {brand.campaigns.length === 0 ? (
          <EmptyState title="No campaigns">Create a campaign to track marketing performance.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2 font-medium">Campaign</th>
                  <th className="px-4 py-2 font-medium">Number</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Budget</th>
                </tr>
              </thead>
              <tbody>
                {brand.campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/app/campaigns/${c.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted">{c.campaignNumber}</td>
                    <td className="px-4 py-2"><Badge>{c.source}</Badge></td>
                    <td className="px-4 py-2"><Badge tone={c.status === "ACTIVE" ? "success" : c.status === "COMPLETED" ? "neutral" : "warning"}>{c.status}</Badge></td>
                    <td className="px-4 py-2 text-muted">{c.budgetCents ? `KES ${c.budgetCents / 100}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </>
  );
}
