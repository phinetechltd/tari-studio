import { ArrowRight, Clapperboard, ImageIcon, Inbox, Link2, MessageCircle, MousePointerClick, Send, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { HeroCarousel, type HeroSlide } from "@/components/dashboard/hero-carousel";
import { PromptBar } from "@/components/dashboard/prompt-bar";
import { Hint } from "@/components/hints/hint";
import { Notice, SectionTitle, StatCard, timeAgo } from "@/components/ui";
import { db } from "@/lib/db";
import { formatKES } from "@/lib/money";
import { creditsToCents, VIDEO_MAX_SECONDS, videoCreditsFor } from "@/lib/pricing";
import { can, MFA_PERMISSIONS, permissionsOf } from "@/lib/rbac";
import { requireTenant } from "@/lib/session";
import { CLIENT_CASE } from "@/lib/showcase";
import { wallet } from "@/server/credits";
import { getPricing } from "@/server/pricing-store";
import { countAwaiting } from "@/server/autopilot";
import { setupProgress, shouldOpenWizard } from "@/server/setup";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { principal, organizationId, claims } = await requireTenant();
  const { denied } = await searchParams;
  // A new workspace's Owner starts in the getting-started wizard, once.
  if (!denied && (await shouldOpenWizard({ ...principal, organizationId }))) redirect("/setup");
  const setup = can(principal, "org:write") ? await setupProgress({ ...principal, organizationId }) : null;

  const canCreate = can(principal, "ai:generate");
  const canCampaigns = can(principal, "campaign:read");
  const canInbox = can(principal, "inbox:read");
  const canLeads = can(principal, "lead:read");
  const canPosts = can(principal, "post:read");
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const canAutopilot = can(principal, "autopilot:read");
  const [tokens, clicks7d, leads7d, unreadConversations, scheduledPosts, recentAssets, attentionConversations, failedPosts, failedRuns, awaitingPosts] =
    await Promise.all([
      canCreate ? wallet(organizationId) : null,
      canCampaigns ? db.clickEvent.count({ where: { clickedAt: { gte: weekAgo }, link: { organizationId } } }) : null,
      canLeads ? db.contact.count({ where: { organizationId, createdAt: { gte: weekAgo } } }) : null,
      canInbox ? db.conversation.count({ where: { organizationId, unreadCount: { gt: 0 } } }) : null,
      canPosts ? db.socialPost.count({ where: { organizationId, status: "SCHEDULED" } }) : null,
      canCreate
        ? db.generatedAsset.findMany({
            where: { organizationId, status: "READY", archivedAt: null },
            orderBy: { readyAt: "desc" },
            take: 8,
            select: { id: true, mediaType: true, prompt: true, aspectRatio: true },
          })
        : [],
      canInbox
        ? db.conversation.findMany({
            where: { organizationId, unreadCount: { gt: 0 } },
            orderBy: { lastMessageAt: "desc" },
            take: 4,
            include: { contact: { select: { name: true, phone: true } } },
          })
        : [],
      canPosts
        ? db.socialPost.findMany({
            where: { organizationId, status: "FAILED" },
            orderBy: { updatedAt: "desc" },
            take: 3,
            include: { channel: { select: { name: true } } },
          })
        : [],
      canInbox
        ? db.automationRun.findMany({
            where: { organizationId, status: "FAILED", createdAt: { gte: weekAgo } },
            orderBy: { createdAt: "desc" },
            take: 3,
            include: { automation: { select: { name: true } } },
          })
        : [],
      canAutopilot ? countAwaiting(organizationId) : 0,
    ]);

  const pricing = await getPricing();
  const needsMfa = !principal.mfa && permissionsOf(principal.role).some((p) => MFA_PERMISSIONS.has(p));
  const [ad, spot, poster] = CLIENT_CASE.media;

  const slides: HeroSlide[] = [
    ...(canCreate
      ? [
          { title: "Make a video ad", subtitle: `Describe it, see the quote, generate. 10 seconds is ${videoCreditsFor(pricing, 10)} credits (${formatKES(creditsToCents(pricing, videoCreditsFor(pricing, 10)))}).`, href: "/content", video: { src: spot.src, poster: spot.poster! } },
          { title: "A launch poster in seconds", subtitle: `Product, offer and contacts on one image for ${pricing.imageCredits} credits.`, href: "/content", image: poster.src },
        ]
      : []),
    ...(canInbox ? [{ title: "Reply on WhatsApp while you sleep", subtitle: "Instant and AI answers from your own catalogue, with a person one tap away.", href: "/app/automations", art: "whatsapp" as const }] : []),
    ...(canCampaigns ? [{ title: "Know which post sold", subtitle: "Tracked links and WhatsApp ref codes credit every lead to its campaign.", href: "/app/campaigns", art: "campaign" as const }] : []),
    ...(canCreate ? [{ title: "The Tari launch ad", subtitle: `24 seconds, ${videoCreditsFor(pricing, 24)} credits. See what clients make.`, href: "/content", video: { src: ad.src, poster: ad.poster! } }] : []),
  ];

  const tools: Array<{ href: string; title: string; subtitle: string; icon: ReactNode; tag?: "Hot" | "New"; show: boolean }> = [
    { href: "/content", title: "Video ad", subtitle: `Up to ${VIDEO_MAX_SECONDS} s, with sound`, icon: <Clapperboard className="h-7 w-7" strokeWidth={1.4} />, tag: "Hot", show: canCreate },
    { href: "/content", title: "Image ad", subtitle: "Posters and product shots", icon: <ImageIcon className="h-7 w-7" strokeWidth={1.4} />, show: canCreate },
    { href: "/app/campaigns", title: "Tracked link", subtitle: "wa.me links with ref codes", icon: <Link2 className="h-7 w-7" strokeWidth={1.4} />, show: canCampaigns },
    { href: "/app/automations", title: "Auto-reply", subtitle: "Answer WhatsApp instantly", icon: <MessageCircle className="h-7 w-7" strokeWidth={1.4} />, tag: "New", show: canInbox },
    { href: "/app/social", title: "Schedule a post", subtitle: "Facebook and Instagram", icon: <Send className="h-7 w-7" strokeWidth={1.4} />, show: canPosts },
  ];
  const visibleTools = tools.filter((t) => t.show);
  const attention = attentionConversations.length + failedPosts.length + failedRuns.length;

  return (
    <div className="space-y-8">
      {denied ? (
        <Notice tone="warning" title="You don't have access to that">
          Your role or your organisation&apos;s plan doesn&apos;t include it. Ask an Owner if you think it should.
        </Notice>
      ) : null}
      <Hint id="home.welcome" title="Welcome. Here is how it fits together">
        Make an ad in the <strong>Studio</strong> (you see the credit cost before anything is made), keep it in the <strong>Library</strong>, post it from <strong>Social</strong>, and answer the replies in the <strong>Inbox</strong>. The bell at the top shows payments, reminders and alerts.
      </Hint>
      {setup && !setup.complete && !setup.dismissed && !setup.guideOff ? (
        <Link href="/setup" className="card flex flex-wrap items-center gap-4 p-5 hover:border-primary/40">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Finish setting up</p>
            <p className="mt-0.5 text-sm text-muted">
              {setup.done} of {setup.total} done. Next: {setup.steps.find((s) => !s.done && !s.skipped)?.title ?? "review skipped steps"}.
            </p>
            <div className="mt-3 h-1.5 max-w-md overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((setup.done / Math.max(1, setup.total)) * 100)}%` }} />
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            Continue <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      ) : null}
      {awaitingPosts > 0 && can(principal, "post:schedule") ? (
        <Link href="/app/autopilot" className="card flex flex-wrap items-center gap-4 border-warning/40 p-5 hover:border-warning">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{awaitingPosts} Autopilot post{awaitingPosts === 1 ? "" : "s"} waiting for your approval</p>
            <p className="mt-0.5 text-sm text-muted">Look them over, change the caption if you like, then approve to post.</p>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            Review <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      ) : null}
      {needsMfa ? (
        <Notice tone="warning" title="Turn on two-factor authentication">
          Your role can connect channels, approve content and manage your team. Those actions stay locked until you{" "}
          <Link href="/security" className="font-medium underline">
            set up two-factor authentication
          </Link>
          .
        </Notice>
      ) : null}

      {slides.length > 0 ? (
        <HeroCarousel slides={slides} />
      ) : (
        <div className="panel p-8">
          <h1 className="text-2xl font-semibold">Welcome, {claims.name.split(" ")[0]}</h1>
          <p className="mt-2 text-sm text-muted">Your role opens the pages in the menu on the left.</p>
        </div>
      )}

      {visibleTools.length > 0 ? (
        <section aria-label="Start something" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Link
            href={canCreate ? "/content" : visibleTools[0]!.href}
            className="group relative col-span-2 flex min-h-[132px] flex-col justify-between overflow-hidden rounded-card bg-afro-gradient p-5 text-[#1e0c04] sm:col-span-3 lg:col-span-2"
          >
            <div>
              <p className="text-lg font-bold">Hi {claims.name.split(" ")[0]} — what are we making today?</p>
              <p className="mt-1 text-sm text-[#1e0c04]/80">Start in the Studio, then schedule it and track who replies.</p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              Open the Studio <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
          {visibleTools.slice(0, 4).map((t) => (
            <Link
              key={t.title}
              href={t.href}
              className="card relative flex min-h-[132px] flex-col items-center justify-center gap-2 p-4 text-center transition-colors hover:bg-wash/[0.07]"
            >
              {t.tag ? <span className={`absolute right-2 top-2 ${t.tag === "Hot" ? "tag-hot" : "tag-new"}`}>{t.tag}</span> : null}
              <span className="text-ink/90">{t.icon}</span>
              <span className="text-[15px] font-semibold text-ink">{t.title}</span>
              <span className="text-xs text-muted">{t.subtitle}</span>
            </Link>
          ))}
        </section>
      ) : null}

      <section aria-label="This week" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tokens ? (
          <StatCard
            label="Credits"
            value={tokens.unmetered ? "Unmetered" : tokens.credits.toLocaleString("en-KE")}
            hint={tokens.unmetered ? "Your plan is not charged" : "in your wallet"}
            href="/content"
          />
        ) : null}
        {clicks7d !== null ? <StatCard label="Link clicks, 7 days" value={clicks7d.toLocaleString("en-KE")} icon={<MousePointerClick className="h-4 w-4" />} href="/app/campaigns" /> : null}
        {leads7d !== null ? <StatCard label="New leads, 7 days" value={leads7d.toLocaleString("en-KE")} icon={<UsersRound className="h-4 w-4" />} href="/app/leads" /> : null}
        {unreadConversations !== null ? (
          <StatCard label="Unread conversations" value={unreadConversations.toLocaleString("en-KE")} icon={<Inbox className="h-4 w-4" />} href="/app/inbox" />
        ) : scheduledPosts !== null ? (
          <StatCard label="Posts scheduled" value={scheduledPosts.toLocaleString("en-KE")} icon={<Send className="h-4 w-4" />} href="/app/social" />
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {canCreate ? (
          <section aria-labelledby="recent" className="card p-5">
            <SectionTitle
              id="recent"
              action={
                <Link href="/content/assets" className="text-sm font-medium text-primary hover:underline">
                  Library
                </Link>
              }
            >
              Recent creations
            </SectionTitle>
            {recentAssets.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                Nothing yet. Describe an ad in the bar below and it will appear here once it is made.
              </p>
            ) : (
              <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
                {recentAssets.map((a) => (
                  <Link
                    key={a.id}
                    href={`/content/assets/${a.id}`}
                    className="group relative block break-inside-avoid overflow-hidden rounded-xl bg-wash/[0.04]"
                    title={a.prompt}
                  >
                    {a.mediaType === "VIDEO" ? (
                      <video src={`/api/content/assets/${a.id}/file`} muted playsInline preload="metadata" className="w-full" aria-label={a.prompt} />
                    ) : (
                      <img src={`/api/content/assets/${a.id}/file`} alt={a.prompt} loading="lazy" className="w-full" />
                    )}
                    <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">
                      {a.mediaType === "VIDEO" ? "Video" : "Image"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <section aria-labelledby="attention" className="card p-5">
          <SectionTitle id="attention">Needs attention</SectionTitle>
          {attention === 0 ? (
            <p className="py-10 text-center text-sm text-muted">All clear. Unread messages, failed posts and failed automations show up here.</p>
          ) : (
            <ul className="divide-y divide-wash/[0.06]">
              {attentionConversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/inbox?c=${c.id}`} className="flex items-start gap-3 py-3 hover:opacity-90">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                      <MessageCircle className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.contact.name ?? `+${c.contact.phone}`}</span>
                        <span className="shrink-0 text-[11px] text-muted">{timeAgo(c.lastMessageAt)}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">{c.lastMessagePreview}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {failedPosts.map((p) => (
                <li key={p.id}>
                  <Link href="/app/social" className="block py-3 hover:opacity-90">
                    <span className="text-sm font-medium text-danger">Post to {p.channel.name} failed</span>
                    <span className="block truncate text-xs text-muted">{p.error}</span>
                  </Link>
                </li>
              ))}
              {failedRuns.map((r) => (
                <li key={r.id}>
                  <Link href="/app/automations" className="block py-3 hover:opacity-90">
                    <span className="text-sm font-medium text-warning">Automation “{r.automation.name}” failed</span>
                    <span className="block truncate text-xs text-muted">{r.error}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {canCreate ? <PromptBar tokens={tokens} /> : null}
    </div>
  );
}
