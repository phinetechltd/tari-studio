import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { denialReason, type Permission, type Principal } from "@/lib/rbac";

/**
 * The getting-started wizard (/setup). Each step is done when the real thing
 * exists (a brand, a catalogue item, a connected channel…), not when someone
 * clicks "done", so the checklist never claims more than is true. Owners can
 * skip a step or put the whole wizard away; that choice is all we store
 * (Organization.setupState).
 */

export type StepKey = "profile" | "brand" | "brandProfile" | "catalogue" | "plan" | "channels" | "team" | "generate";

export interface SetupStep {
  key: StepKey;
  title: string;
  description: string;
  href: string;
  action: string;
  done: boolean;
  skipped: boolean;
}

export interface SetupState {
  seenAt?: string;
  dismissed?: boolean;
  skipped?: StepKey[];
}

const STEP_KEYS: StepKey[] = ["profile", "brand", "brandProfile", "catalogue", "plan", "channels", "team", "generate"];

const STEPS: Array<Omit<SetupStep, "done" | "skipped"> & { permission?: Permission }> = [
  {
    key: "profile",
    title: "Add your mobile number",
    description: "Urgent alerts (a failed renewal, credits running out) can reach you by SMS.",
    href: "/account",
    action: "Open your profile",
  },
  {
    key: "brand",
    title: "Create your first brand",
    description: "Name, colours, tone and logo. Every ad, caption and reply uses it.",
    href: "/app/brands/new",
    action: "Create a brand",
    permission: "brand:write",
  },
  {
    key: "brandProfile",
    title: "Finish your brand profile",
    description: "A slogan and a cover picture. Captions, videos and Autopilot use them to look like your brand.",
    href: "/app/brands",
    action: "Open your brands",
    permission: "brand:write",
  },
  {
    key: "catalogue",
    title: "Add a product",
    description: "What you sell, with pictures and a price. The Studio, Autopilot and WhatsApp replies draw on it.",
    href: "/app/products/new",
    action: "Add a product",
    permission: "product:write",
  },
  {
    key: "plan",
    title: "Choose a plan or top up credits",
    description: "Credits pay for images and videos. A plan adds monthly credits and more generations at once.",
    href: "/billing",
    action: "See plans",
    permission: "token:buy",
  },
  {
    key: "channels",
    title: "Connect Facebook, Instagram or WhatsApp",
    description: "Publish posts, and answer WhatsApp messages from one inbox.",
    href: "/app/social",
    action: "Connect a channel",
    permission: "channel:read",
  },
  {
    key: "team",
    title: "Invite your team",
    description: "Give marketers and managers their own sign-in, with the right role.",
    href: "/app/team",
    action: "Invite someone",
    permission: "member:write",
  },
  {
    key: "generate",
    title: "Make your first image or video",
    description: "Describe it in the Studio, check the quote, generate.",
    href: "/content",
    action: "Open the Studio",
    permission: "ai:generate",
  },
];

const parseState = (raw: Prisma.JsonValue | null | undefined): SetupState => {
  const s = (raw ?? {}) as SetupState;
  return { seenAt: typeof s.seenAt === "string" ? s.seenAt : undefined, dismissed: s.dismissed === true, skipped: Array.isArray(s.skipped) ? s.skipped.filter((k) => STEP_KEYS.includes(k)) : [] };
};

export interface SetupProgress {
  steps: SetupStep[];
  done: number;
  total: number;
  complete: boolean;
  dismissed: boolean;
  seen: boolean;
  /** This person has switched the setup guide off for themselves */
  guideOff: boolean;
}

/** Where an organisation is with getting started, from what actually exists. */
export async function setupProgress(principal: Principal & { organizationId: string }): Promise<SetupProgress> {
  const orgId = principal.organizationId;
  const [org, me, brands, profiled, items, sub, purchases, channels, members, invites, assets] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { setupState: true, plan: true } }),
    db.user.findUnique({ where: { id: principal.userId }, select: { phone: true, setupGuideOff: true } }),
    db.brand.count({ where: { organizationId: orgId } }),
    db.brand.count({ where: { organizationId: orgId, status: "ACTIVE", slogan: { not: null }, coverImageKey: { not: null } } }),
    db.catalogueItem.count({ where: { organizationId: orgId } }),
    db.subscription.findUnique({ where: { organizationId: orgId }, select: { status: true } }),
    db.tokenLedger.count({ where: { organizationId: orgId, reason: { in: ["PURCHASE", "GRANT"] } } }),
    db.socialChannel.count({ where: { organizationId: orgId, status: "ACTIVE", archivedAt: null } }),
    db.membership.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
    db.invite.count({ where: { organizationId: orgId } }),
    db.generatedAsset.count({ where: { organizationId: orgId } }),
  ]);
  const state = parseState(org.setupState);
  const done: Record<StepKey, boolean> = {
    profile: Boolean(me?.phone),
    brand: brands > 0,
    brandProfile: profiled > 0,
    catalogue: items > 0,
    plan: org.plan === "INTERNAL" || (sub !== null && sub.status !== "EXPIRED") || purchases > 0,
    channels: channels > 0,
    team: members > 1 || invites > 0,
    generate: assets > 0,
  };
  const steps = STEPS.filter((s) => {
    if (!s.permission) return true;
    const reason = denialReason(principal, s.permission);
    return reason === null || reason === "mfa"; // two-factor is asked for on the step itself
  }).map(({ permission: _p, ...s }) => ({ ...s, done: done[s.key], skipped: !done[s.key] && state.skipped!.includes(s.key) }));
  const finished = steps.filter((s) => s.done || s.skipped).length;
  return {
    steps,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    complete: finished === steps.length,
    dismissed: state.dismissed === true,
    seen: Boolean(state.seenAt),
    guideOff: me?.setupGuideOff === true,
  };
}

/**
 * Should this visit to the dashboard go to the wizard first? Only for people
 * who can set the workspace up, only the first time, and never once the
 * wizard was seen or put away.
 */
export async function shouldOpenWizard(principal: Principal & { organizationId: string }): Promise<boolean> {
  // Owners only: a platform admin visiting the workspace must not use up the Owner's first visit.
  if (principal.role !== "OWNER") return false;
  const me = await db.user.findUnique({ where: { id: principal.userId }, select: { setupGuideOff: true } });
  if (me?.setupGuideOff) return false;
  const org = await db.organization.findUnique({ where: { id: principal.organizationId }, select: { setupState: true } });
  const state = parseState(org?.setupState);
  return !state.seenAt && !state.dismissed;
}

/** Remembers that the wizard was shown, so the dashboard stops sending people to it. */
export async function markWizardSeen(organizationId: string): Promise<void> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { setupState: true } });
  const state = parseState(org?.setupState);
  if (state.seenAt) return;
  await db.organization.update({ where: { id: organizationId }, data: { setupState: { ...state, seenAt: new Date().toISOString() } as Prisma.InputJsonValue } });
}

export const setupPatchSchema = z.union([
  z.object({ skip: z.enum(STEP_KEYS as [StepKey, ...StepKey[]]) }),
  z.object({ unskip: z.enum(STEP_KEYS as [StepKey, ...StepKey[]]) }),
  z.object({ dismissed: z.boolean() }),
  /** Personal: switch the setup guide off (or back on) for me, in every team */
  z.object({ guideOff: z.boolean() }),
]);

export async function updateSetup(principal: Principal & { organizationId: string }, raw: unknown, request?: Request): Promise<SetupProgress> {
  const input = setupPatchSchema.parse(raw);
  if ("guideOff" in input) {
    // Anyone may put the guide away for themselves; it changes nothing for the team.
    await db.user.update({ where: { id: principal.userId }, data: { setupGuideOff: input.guideOff } });
    return setupProgress(principal);
  }
  if (principal.role !== "OWNER" && principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only an Owner changes the setup checklist.");
  const org = await db.organization.findUniqueOrThrow({ where: { id: principal.organizationId }, select: { setupState: true } });
  const state = parseState(org.setupState);
  if ("skip" in input) state.skipped = Array.from(new Set([...(state.skipped ?? []), input.skip]));
  if ("unskip" in input) state.skipped = (state.skipped ?? []).filter((k) => k !== input.unskip);
  if ("dismissed" in input) state.dismissed = input.dismissed;
  state.seenAt ??= new Date().toISOString();
  await db.organization.update({ where: { id: principal.organizationId }, data: { setupState: state as Prisma.InputJsonValue } });
  await audit({ organizationId: principal.organizationId, userId: principal.userId, action: "SETUP_UPDATE", entity: "Organization", entityId: principal.organizationId, changes: input, request });
  return setupProgress(principal);
}
