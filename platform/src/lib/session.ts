import "server-only";

import { redirect } from "next/navigation";

import { accountFromClaims, getSessionPrincipal, readSessionClaims, type AccountSession, type SessionClaims } from "./auth";
import { refreshPlatformConfig } from "./platform-config";
import type { Permission, Principal } from "./rbac";
import { can } from "./rbac";

/**
 * Page-level guards for the console.
 *
 * Server components call these first; an unauthenticated or wrongly-scoped
 * visitor is redirected before any query runs, so a page cannot leak data by
 * rendering ahead of its own auth check.
 */

export interface ConsoleSession {
  principal: Principal;
  claims: SessionClaims;
}

export async function requireSession(): Promise<ConsoleSession> {
  const [principal, claims] = await Promise.all([getSessionPrincipal(), readSessionClaims(), refreshPlatformConfig()]);
  if (!claims) redirect("/login");
  if (!principal) {
    // Signed in, but not inside a team (new account, or removed from the team): the welcome screen handles it.
    const account = await accountFromClaims(claims);
    redirect(account ? "/welcome" : "/login");
  }
  return { principal, claims };
}

/** Pages for a signed-in person who may not be in a team yet (the welcome screen, account setup). */
export async function requireAccount(): Promise<AccountSession> {
  const claims = await readSessionClaims();
  if (!claims) redirect("/login");
  const account = await accountFromClaims(claims);
  if (!account) redirect("/login");
  return account;
}

/** Platform admins in platform mode only. */
export async function requirePlatform(): Promise<ConsoleSession> {
  const session = await requireSession();
  if (session.principal.organizationId !== null) redirect("/app");
  return session;
}

/** Any principal working inside an organisation. */
export async function requireTenant(): Promise<ConsoleSession & { organizationId: string }> {
  const session = await requireSession();
  if (!session.principal.organizationId) redirect("/platform");
  return { ...session, organizationId: session.principal.organizationId };
}

/**
 * A tenant page that needs a specific permission. Unlicensed modules and
 * insufficient roles are sent to the dashboard rather than shown a broken page.
 */
export async function requirePermission(
  permission: Permission,
): Promise<ConsoleSession & { organizationId: string }> {
  const session = await requireTenant();
  if (!can(session.principal, permission)) redirect("/app?denied=" + encodeURIComponent(permission));
  return session;
}
