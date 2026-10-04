"use client";

import {
  Bell,
  Building,
  CircleUserRound,
  Clapperboard,
  Cpu,
  CreditCard,
  House,
  Images,
  Inbox,
  Layers,
  LayoutTemplate,
  ListChecks,
  Megaphone,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  Repeat,
  Rocket,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  UsersRound,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { PRODUCT_NAME } from "@/lib/brand";
import type { Principal } from "@/lib/rbac";
import { cn } from "@/lib/utils";

import { BrandLogo } from "./brand-logo";
import type { NavIcon, NavItem } from "./console-shell";
import { callApi } from "./json-form";
import { OrgSwitcher, SignOutButton, ThemeToggle } from "./shell-controls";

const COLLAPSED_KEY = "console-sidebar-collapsed";

const ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  studio: Clapperboard,
  library: Images,
  campaigns: Megaphone,
  social: Share2,
  inbox: Inbox,
  leads: UsersRound,
  automations: Workflow,
  autopilot: Repeat,
  brands: Layers,
  catalogue: Package,
  templates: LayoutTemplate,
  teams: UsersRound,
  characters: UserRound,
  orders: Receipt,
  tasks: ListChecks,
  team: Users,
  organisations: Building,
  billing: CreditCard,
  settings: Settings,
  security: ShieldCheck,
  ai: Cpu,
  bell: Bell,
  profile: CircleUserRound,
  setup: Rocket,
};

export interface SidebarProps {
  items: NavItem[];
  platformMode: boolean;
  orgName?: string;
  principal: Principal;
  userName: string;
  isPlatformAdmin: boolean;
  memberships: { organizationId: string; organization: { name: string } }[];
  tokens: { credits: number; unmetered: boolean } | null;
  unread: number;
  canCreate: boolean;
  canBuy: boolean;
}

/** The nav item a path belongs to: the longest href that matches, so /app does not light up on /app/orders. */
function activeHref(items: NavItem[], pathname: string): string | null {
  const matches = items.filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.href ?? null;
}

/**
 * The console frame: a black navigation rail (collapsible on desktop, a drawer
 * on phones), a slim top bar with the token balance, notifications and the
 * Create button, and the page. It owns the content padding, so collapsing the
 * rail really gives the page more room.
 */
export function ConsoleFrame(props: SidebarProps & { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  // The Studio fills the screen with the side menu folded away. Opening the menu there is a visit, not a saved choice.
  const immersive = pathname === "/content";
  const [openHere, setOpenHere] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      /* storage blocked: stay expanded */
    }
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
    setOpenHere(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [drawerOpen]);

  const railCollapsed = immersive ? !openHere : collapsed;
  const toggleCollapsed = () => {
    if (immersive) {
      setOpenHere((o) => !o);
      return;
    }
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const current = props.items.find((i) => i.href === activeHref(props.items, pathname));
  const railWidth = railCollapsed ? "lg:pl-[76px]" : "lg:pl-[232px]";

  return (
    <div className="min-h-screen bg-surface">
      <div
        aria-hidden
        onClick={() => setDrawerOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <Rail
        {...props}
        collapsed={railCollapsed}
        drawerOpen={drawerOpen}
        onToggleCollapsed={toggleCollapsed}
        onCloseDrawer={() => setDrawerOpen(false)}
        pathname={pathname}
      />

      <header
        className={cn(
          "sticky top-0 z-30 flex h-[60px] items-center gap-3 bg-surface/80 px-4 backdrop-blur-xl transition-[padding] duration-200 sm:px-6",
          railWidth,
        )}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-wash/[0.06] lg:hidden"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="console-rail"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="truncate text-[15px] font-semibold text-ink">{current?.label ?? PRODUCT_NAME}</span>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {props.tokens ? <TokenPill tokens={props.tokens} canBuy={props.canBuy} /> : null}
          <NotificationBell initialUnread={props.unread} home={props.platformMode ? "/platform" : "/app"} />
          {props.canCreate ? (
            <Link href="/content" className="btn-primary hidden min-h-[36px] px-4 sm:inline-flex">
              <Plus className="h-4 w-4" /> Create
            </Link>
          ) : null}
        </div>
      </header>

      <main className={cn("transition-[padding] duration-200", railWidth)}>
        {immersive ? (
          <div className="h-[calc(100dvh-60px)] min-h-[420px] w-full overflow-hidden">{props.children}</div>
        ) : (
          <div className="mx-auto max-w-[1320px] px-4 pb-28 pt-4 sm:px-6 lg:pt-6">{props.children}</div>
        )}
      </main>
    </div>
  );
}

function TokenPill({ tokens, canBuy }: { tokens: NonNullable<SidebarProps["tokens"]>; canBuy: boolean }) {
  const label = tokens.unmetered ? "Unmetered" : `${tokens.credits.toLocaleString("en-KE")} credits`;
  return (
    <Link
      href={canBuy ? "/billing" : "/content"}
      className="pill-gradient h-8 text-sm"
      title={
        tokens.unmetered
          ? "Your organisation's plan is not charged credits."
          : `${tokens.credits} credits in your wallet.${canBuy ? " Top up or change plan in Billing." : ""}`
      }
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  );
}

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

function NotificationBell({ initialUnread, home }: { initialUnread: number; home: string }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setUnread(initialUnread), [initialUnread]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void callApi<{ items: NotificationItem[]; unread: number }>("/api/notifications", "GET").then((r) => {
      if (cancelled || !r.ok || !r.data) return;
      setItems(r.data.items);
      setUnread(r.data.unread);
    });
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAll = async () => {
    const r = await callApi("/api/notifications", "PATCH", {});
    if (r.ok) {
      setUnread(0);
      setItems((list) => list?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-ink/80 hover:bg-wash/[0.06] hover:text-ink"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-onprimary">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="glass absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between border-b border-wash/[0.08] px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 ? (
              <button type="button" onClick={markAll} className="text-xs font-medium text-primary hover:underline">
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <li className="px-4 py-6 text-center text-sm text-muted">Loading…</li>
            ) : items.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted">Nothing yet. Payments, plan reminders and alerts show up here.</li>
            ) : (
              items.map((n) => (
                <li key={n.id} className="border-b border-wash/[0.05] last:border-0">
                  <Link
                    href={n.href ?? home}
                    onClick={() => setOpen(false)}
                    className={cn("block px-4 py-3 hover:bg-wash/[0.04]", n.readAt ? "opacity-60" : "")}
                  >
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    {n.body ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p> : null}
                    <p className="mt-1 text-[11px] text-muted">{new Date(n.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </Link>
                </li>
              ))
            )}
          </ul>
          <div className="flex items-center justify-between border-t border-white/[0.08] px-4 py-2.5 text-xs">
            <Link href="/notifications" onClick={() => setOpen(false)} className="font-medium text-primary hover:underline">
              See all
            </Link>
            <Link href="/account#notifications" onClick={() => setOpen(false)} className="text-muted hover:text-ink">
              Email and SMS settings
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Rail(
  props: SidebarProps & {
    collapsed: boolean;
    drawerOpen: boolean;
    onToggleCollapsed: () => void;
    onCloseDrawer: () => void;
    pathname: string;
  },
) {
  const { items, platformMode, orgName, principal, userName, isPlatformAdmin, memberships, drawerOpen, pathname } = props;
  // The drawer on phones is always shown expanded.
  const collapsed = props.collapsed && !drawerOpen;
  const active = activeHref(items, pathname);
  const groups = Array.from(new Set(items.map((i) => i.group)));

  return (
    <aside
      id="console-rail"
      className={cn(
        "fixed left-0 top-0 z-50 flex h-[100dvh] flex-col bg-bg transition-[width,transform] duration-200",
        "w-[248px] lg:translate-x-0",
        drawerOpen ? "translate-x-0" : "-translate-x-full",
        props.collapsed ? "lg:w-[76px]" : "lg:w-[232px]",
      )}
      aria-label="Console"
    >
      <div className={cn("flex h-[60px] shrink-0 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
        <Link href={platformMode ? "/platform" : "/app"} className="flex min-w-0 items-center gap-2.5" title={PRODUCT_NAME}>
          {collapsed ? <BrandLogo tone="afro" variant="mark" height={34} priority /> : <BrandLogo tone="afro" height={30} priority />}
        </Link>
        <button
          type="button"
          onClick={props.onCloseDrawer}
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-wash/[0.06] hover:text-ink lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {!collapsed && orgName ? (
        <p className="truncate px-5 pb-2 text-xs text-muted" title={orgName}>
          {orgName}
        </p>
      ) : null}

      <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Main">
        {groups.map((group, gi) => (
          <div key={group} className={cn(gi > 0 && "mt-3 border-t border-wash/[0.06] pt-3")}>
            {!collapsed ? <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted/70">{group}</p> : null}
            <ul className="space-y-0.5">
              {items
                .filter((i) => i.group === group)
                .map((item) => {
                  const Icon = ICONS[item.icon];
                  const isActive = item.href === active;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "flex h-10 items-center gap-3 rounded-full px-3 text-sm transition-colors",
                          isActive ? "bg-wash/10 font-medium text-ink" : "text-ink/75 hover:bg-wash/[0.05] hover:text-ink",
                          collapsed && "justify-center px-0",
                        )}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2 : 1.6} aria-hidden />
                        {!collapsed ? (
                          <>
                            <span className="truncate">{item.label}</span>
                            {item.tag ? <span className={item.tag === "HOT" ? "tag-hot ml-auto" : "tag-new ml-auto"}>{item.tag}</span> : null}
                          </>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-wash/[0.06] px-3 py-3">
        {!collapsed ? (
          <OrgSwitcher
            current={principal.organizationId}
            options={memberships.map((m) => ({ id: m.organizationId, name: m.organization.name }))}
            canUsePlatform={isPlatformAdmin}
            collapsed={collapsed}
          />
        ) : null}
        <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wash/10 text-xs font-semibold text-ink"
            title={userName}
            aria-hidden
          >
            {userName
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? "")
              .join("")}
          </span>
          {!collapsed ? <span className="min-w-0 flex-1 truncate text-xs text-muted">{userName}</span> : null}
          {!collapsed ? <SignOutButton /> : null}
          <button
            type="button"
            onClick={props.onToggleCollapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-wash/[0.06] hover:text-ink lg:inline-flex"
            aria-label={props.collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {props.collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
