import { Plus, Share2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Hint } from "@/components/hints/hint";
import { ChannelActions, Composer, PostActions } from "@/components/social/social-controls";
import { TikTokCommentControls } from "@/components/social/tiktok-controls";
import { Badge, EmptyState, Notice, PageHeader, SectionTitle, formatDateTime } from "@/components/ui";
import { titleCase } from "@/lib/campaign-labels";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { configuredProviderName } from "@/lib/providers";
import { cn } from "@/lib/utils";
import { isSimulated } from "@/server/meta";
import { tikTokCommentsAvailable } from "@/server/tiktok";
import { listChannels, listPosts } from "@/server/social";

export const metadata: Metadata = { title: "Social" };
export const dynamic = "force-dynamic";

const PLATFORM: Record<string, { label: string; className: string }> = {
  FACEBOOK: { label: "Facebook", className: "bg-[#1877F2]/15 text-[#6ea8ff]" },
  INSTAGRAM: { label: "Instagram", className: "bg-[#E1306C]/15 text-[#ff7ab6]" },
  WHATSAPP: { label: "WhatsApp", className: "bg-[#25D366]/15 text-[#5DF3D7]" },
  TIKTOK: { label: "TikTok", className: "bg-white/10 text-ink" },
};

const POST_TONE: Record<string, "success" | "danger" | "warning" | "neutral" | "info"> = {
  PUBLISHED: "success",
  FAILED: "danger",
  PUBLISHING: "info",
  SCHEDULED: "warning",
};

export default async function SocialPage({ searchParams }: { searchParams: Promise<{ connect?: string; count?: string; reason?: string; platform?: string; comments?: string }> }) {
  const { principal, organizationId } = await requirePermission("channel:read");
  const { connect, count, reason, platform, comments } = await searchParams;
  const network = platform === "tiktok" ? "TikTok" : "Facebook";
  const canPost = can(principal, "post:schedule");
  const canConnect = can(principal, "channel:connect");

  const [channels, posts, assets, campaigns, commentLinks] = await Promise.all([
    listChannels(principal),
    can(principal, "post:read") ? listPosts(principal) : Promise.resolve([]),
    canPost && can(principal, "ai:generate")
      ? db.generatedAsset.findMany({
          where: { organizationId, status: "READY", archivedAt: null },
          orderBy: { readyAt: "desc" },
          take: 60,
          select: { id: true, mediaType: true, prompt: true },
        })
      : Promise.resolve([]),
    canPost
      ? db.campaign.findMany({ where: { organizationId, status: { in: ["DRAFT", "ACTIVE", "PAUSED"] } }, select: { id: true, name: true, brandId: true }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    db.externalAccount.findMany({ where: { organizationId, provider: "TIKTOK_BUSINESS", status: "ACTIVE" }, select: { channelId: true, handle: true, metadata: true } }),
  ]);
  const commentsFor = new Map(commentLinks.map((l) => [l.channelId ?? "", l]));
  const commentsAvailable = tikTokCommentsAvailable();
  const tiktokSimulated = configuredProviderName("TIKTOK") === "simulator";
  const publishable = channels
    .filter((c) => c.status === "ACTIVE" && c.platform !== "WHATSAPP")
    .map((c) => ({ id: c.id, name: c.name, platform: c.platform, brandId: c.brandId, brandName: c.brand.name }));

  return (
    <>
      <PageHeader
        title="Social"
        subtitle="Your Facebook Pages, Instagram, TikTok accounts and WhatsApp numbers, and everything scheduled to go out."
        actions={
          canConnect ? (
            <Link href="/app/social/new" className="btn-primary">
              <Plus className="h-4 w-4" /> Connect
            </Link>
          ) : null
        }
      />
      <Hint id="social.intro" title="Connect a page, then schedule">
        Connect your Facebook and Instagram pages, then schedule posts straight from your Library.
      </Hint>

      {connect === "ok" ? <Notice tone="success" title={`Connected ${count ?? ""} account${count === "1" ? "" : "s"}.`} /> : null}
      {connect === "cancelled" ? <Notice tone="warning" title={`${network} connection was cancelled.`} /> : null}
      {connect === "expired" ? <Notice tone="warning" title="That connection link expired or was started elsewhere. Try again." /> : null}
      {connect === "nopages" ? <Notice tone="warning" title="No Facebook Pages were shared. Choose at least one Page when Facebook asks." /> : null}
      {connect === "failed" ? <Notice tone="danger" title="The connection did not complete.">{reason}</Notice> : null}
      {comments === "ok" ? <Notice tone="success" title="TikTok comment replies are on. New comments are checked every few minutes." /> : null}
      {comments === "failed" || comments === "expired" || comments === "cancelled" ? (
        <Notice tone="warning" title="TikTok comment replies were not switched on.">{comments === "failed" ? reason : comments === "expired" ? "The sign-in took too long or was started elsewhere. Try again." : "The sign-in was cancelled."}</Notice>
      ) : null}
      {tiktokSimulated && channels.some((c) => c.platform === "TIKTOK") ? (
        <Notice tone="info" title="TikTok is in simulator mode">Posts and comments are simulated. A platform admin switches TikTok to Live in Settings → TikTok.</Notice>
      ) : null}
      {isSimulated() ? (
        <Notice tone="info" title="Meta is in simulator mode">
          Connections and posts are simulated so you can try everything end to end. Set META_PROVIDER=graph with your Meta app to go live.
        </Notice>
      ) : null}

      {channels.length === 0 ? (
        <EmptyState
          title="Nothing connected yet"
          icon={<Share2 className="h-5 w-5" />}
          action={
            canConnect ? (
              <Link href="/app/social/new" className="btn-primary">
                Connect Facebook, Instagram or WhatsApp
              </Link>
            ) : null
          }
        >
          Connect a brand&apos;s Facebook Page (its Instagram account comes with it) to publish, and its WhatsApp Business number to
          answer customers in the inbox.
        </EmptyState>
      ) : (
        <section aria-labelledby="accounts" className="mb-8">
          <SectionTitle id="accounts">Connected accounts</SectionTitle>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {channels.map((c) => {
              const meta = (c.metadata ?? {}) as { lastCheck?: { at: string; ok: boolean; detail: string } };
              const p = PLATFORM[c.platform] ?? { label: c.platform, className: "bg-wash/10 text-ink" };
              return (
                <li key={c.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn("rounded-lg px-2 py-1 text-[11px] font-bold", p.className)}>{p.label}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{c.name}</p>
                        <p className="truncate text-xs text-muted">
                          {c.brand.name}
                          {c.handle ? ` · ${c.handle}` : ""}
                        </p>
                      </div>
                    </div>
                    <Badge tone={c.status === "ACTIVE" ? "success" : "danger"}>{c.status === "ACTIVE" ? "Connected" : titleCase(c.status)}</Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {c.platform === "WHATSAPP" ? `${c._count.conversations} conversation${c._count.conversations === 1 ? "" : "s"}` : `${c._count.posts} post${c._count.posts === 1 ? "" : "s"}`}
                    {meta.lastCheck ? ` · checked ${formatDateTime(meta.lastCheck.at)}` : ""}
                  </p>
                  {c.platform === "TIKTOK" && c.status === "ACTIVE" ? (
                    <TikTokCommentControls
                      channelId={c.id}
                      connected={commentsFor.has(c.id)}
                      handle={commentsFor.get(c.id)?.handle ?? null}
                      lastError={((commentsFor.get(c.id)?.metadata ?? {}) as { lastError?: string | null }).lastError ?? null}
                      available={commentsAvailable}
                      canConnect={canConnect}
                    />
                  ) : null}
                  <ChannelActions channelId={c.id} canDisconnect={canConnect} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {canPost && publishable.length > 0 ? (
        <div className="mb-8">
          <Composer channels={publishable} assets={assets} campaigns={campaigns} canUseAi={can(principal, "ai:generate")} />
        </div>
      ) : null}

      {posts.length > 0 ? (
        <section aria-labelledby="queue">
          <SectionTitle id="queue">Posts</SectionTitle>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Post</th>
                  <th className="px-4 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => {
                  const content = post.content as { text?: string; assetId?: string | null };
                  return (
                    <tr key={post.id} className="border-b border-line/60 align-top last:border-0">
                      <td className="max-w-md px-4 py-3">
                        <p className="line-clamp-2 text-ink">{content.text || <span className="italic text-muted">(media only)</span>}</p>
                        {post.campaign ? (
                          <Link href={`/app/campaigns/${post.campaign.id}`} className="text-xs text-primary hover:underline">
                            {post.campaign.name}
                          </Link>
                        ) : null}
                        {post.error ? <p className="mt-1 text-xs text-danger">{post.error}</p> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{post.channel.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(post.publishedAt ?? post.scheduledAt)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={POST_TONE[post.status] ?? "neutral"}>{titleCase(post.status)}</Badge>
                        {post.externalUrl ? (
                          <a href={post.externalUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-primary hover:underline">
                            View post
                          </a>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">{canPost ? <PostActions postId={post.id} status={post.status} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
