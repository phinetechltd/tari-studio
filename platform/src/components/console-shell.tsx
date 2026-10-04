import type { ReactNode } from "react";

import { activeMemberships } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, type Permission, type Principal } from "@/lib/rbac";
import { wallet } from "@/server/credits";

import { HintProvider } from "./hints/hint";
import { ConsoleFrame } from "./sidebar";

/**
 * The console's navigation, grouped the way the work flows: make things, get
 * them seen, talk to the people who respond, run the business. Items a
 * principal cannot use (role or licence) are not shown at all.
 */

export type NavIcon =
  | "home"
  | "studio"
  | "library"
  | "campaigns"
  | "social"
  | "inbox"
  | "leads"
  | "automations"
  | "autopilot"
  | "brands"
  | "catalogue"
  | "templates"
  | "teams"
  | "characters"
  | "orders"
  | "tasks"
  | "team"
  | "organisations"
  | "billing"
  | "settings"
  | "security"
  | "ai"
  | "bell"
  | "profile"
  | "setup";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  group: "Create" | "Grow" | "Business" | "Account";
  permission?: Permission;
  scope: "tenant" | "platform" | "both";
  tag?: "NEW" | "HOT";
}

export const NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: "home", group: "Create", scope: "tenant" },
  { href: "/content", label: "Studio", icon: "studio", group: "Create", permission: "ai:generate", scope: "tenant", tag: "HOT" },
  { href: "/content/assets", label: "Library", icon: "library", group: "Create", permission: "ai:generate", scope: "tenant" },
  { href: "/app/templates", label: "Templates", icon: "templates", group: "Create", permission: "template:read", scope: "tenant", tag: "NEW" },
  { href: "/app/characters", label: "Characters", icon: "characters", group: "Create", permission: "character:read", scope: "tenant", tag: "NEW" },
  { href: "/app/campaigns", label: "Campaigns", icon: "campaigns", group: "Grow", permission: "campaign:read", scope: "tenant" },
  { href: "/app/social", label: "Social", icon: "social", group: "Grow", permission: "channel:read", scope: "tenant" },
  { href: "/app/inbox", label: "Inbox", icon: "inbox", group: "Grow", permission: "inbox:read", scope: "tenant", tag: "NEW" },
  { href: "/app/leads", label: "Leads", icon: "leads", group: "Grow", permission: "lead:read", scope: "tenant" },
  { href: "/app/automations", label: "Automations", icon: "automations", group: "Grow", permission: "inbox:read", scope: "tenant", tag: "NEW" },
  { href: "/app/autopilot", label: "Autopilot", icon: "autopilot", group: "Grow", permission: "autopilot:read", scope: "tenant", tag: "NEW" },
  { href: "/app/brands", label: "Brands", icon: "brands", group: "Business", permission: "brand:read", scope: "tenant" },
  { href: "/app/products", label: "Products", icon: "catalogue", group: "Business", permission: "product:read", scope: "tenant" },
  { href: "/app/orders", label: "Orders", icon: "orders", group: "Business", permission: "order:read", scope: "tenant" },
  { href: "/app/content", label: "Tasks", icon: "tasks", group: "Business", permission: "content:read", scope: "tenant" },
  { href: "/platform", label: "Organisations", icon: "organisations", group: "Account", scope: "platform" },
  { href: "/platform/subscriptions", label: "Subscriptions", icon: "orders", group: "Account", scope: "platform" },
  { href: "/platform/payments", label: "Payments", icon: "billing", group: "Account", scope: "platform" },
  { href: "/platform/orders", label: "Orders", icon: "orders", group: "Account", scope: "platform" },
  { href: "/platform/templates", label: "Templates", icon: "templates", group: "Account", scope: "platform" },
  { href: "/platform/pricing", label: "Pricing", icon: "catalogue", group: "Account", scope: "platform" },
  { href: "/platform/ai", label: "AI & credits", icon: "ai", group: "Account", scope: "platform" },
  { href: "/platform/notifications", label: "Notifications", icon: "bell", group: "Account", scope: "platform" },
  { href: "/app/teams", label: "My teams", icon: "teams", group: "Account", scope: "tenant" },
  { href: "/app/team", label: "Team", icon: "team", group: "Account", permission: "member:read", scope: "tenant" },
  { href: "/billing", label: "Plan & billing", icon: "billing", group: "Account", permission: "org:read", scope: "tenant" },
  { href: "/setup", label: "Get started", icon: "setup", group: "Account", permission: "org:write", scope: "tenant" },
  { href: "/settings", label: "Settings", icon: "settings", group: "Account", scope: "both" },
  { href: "/account", label: "Profile", icon: "profile", group: "Account", scope: "both" },
  { href: "/security", label: "Security", icon: "security", group: "Account", scope: "both" },
];

export async function ConsoleShell(props: { principal: Principal; userName: string; children: ReactNode }) {
  const { principal, children } = props;
  const platformMode = principal.organizationId === null;

  const [memberships, org, me, tokenBalance, unread] = await Promise.all([
    activeMemberships(principal.userId),
    principal.organizationId
      ? db.organization.findUnique({ where: { id: principal.organizationId }, select: { name: true } })
      : null,
    db.user.findUnique({ where: { id: principal.userId }, select: { isPlatformAdmin: true, hintsEnabled: true, dismissedHints: true } }),
    principal.organizationId && can(principal, "ai:generate") ? wallet(principal.organizationId) : null,
    db.notification.count({ where: { userId: principal.userId, organizationId: principal.organizationId, readAt: null } }),
  ]);

  const items = NAV.filter((n) => {
    if (n.scope === "platform" && !platformMode) return false;
    if (n.scope === "tenant" && platformMode) return false;
    return !n.permission || can(principal, n.permission);
  });

  return (
    <ConsoleFrame
      items={items}
      platformMode={platformMode}
      orgName={org?.name}
      principal={principal}
      userName={props.userName}
      isPlatformAdmin={me?.isPlatformAdmin ?? false}
      memberships={memberships}
      tokens={tokenBalance}
      unread={unread}
      canCreate={can(principal, "ai:generate")}
      canBuy={can(principal, "token:buy")}
    >
      <HintProvider enabled={me?.hintsEnabled ?? true} dismissed={me?.dismissedHints ?? []}>
        {children}
      </HintProvider>
    </ConsoleFrame>
  );
}
