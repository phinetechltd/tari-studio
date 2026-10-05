import "server-only";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { assistantConfigSchema, defaultAssistantConfig, normaliseAssistantConfig, type AssistantConfig, type Tier } from "@/lib/assistant-config";
import { db } from "@/lib/db";
import type { Principal } from "@/lib/rbac";

/**
 * The assistant's settings (stored as one JSON row, like the price list) and which tier a team is on.
 * A team is "paid" when it has an active paid plan, or bought credits in the last 90 days.
 */

const KEY = "ASSISTANT_CONFIG";
const REFRESH_MS = 10_000;
export const PAID_WINDOW_DAYS = 90;

let cache: { at: number; config: AssistantConfig } | null = null;

export async function getAssistantConfig(force = false): Promise<AssistantConfig> {
  if (!force && cache && Date.now() - cache.at < REFRESH_MS) return cache.config;
  let config = defaultAssistantConfig();
  try {
    const row = await db.platformSetting.findUnique({ where: { key: KEY } });
    if (row?.value) config = normaliseAssistantConfig(JSON.parse(row.value));
  } catch (e) {
    console.error("[assistant] stored settings unreadable, using defaults:", e instanceof Error ? e.message : e);
  }
  cache = { at: Date.now(), config };
  return config;
}

export function forgetAssistantConfig(): void {
  cache = null;
}

export async function assistantConfigStatus(): Promise<{ config: AssistantConfig; custom: boolean; updatedAt: string | null; updatedBy: string | null }> {
  const config = await getAssistantConfig(true);
  const row = await db.platformSetting.findUnique({ where: { key: KEY }, select: { updatedAt: true, updatedById: true } });
  const by = row?.updatedById ? await db.user.findUnique({ where: { id: row.updatedById }, select: { name: true } }) : null;
  return { config, custom: Boolean(row), updatedAt: row?.updatedAt.toISOString() ?? null, updatedBy: by?.name ?? null };
}

export async function saveAssistantConfig(principal: Principal, raw: unknown, request?: Request): Promise<AssistantConfig> {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only platform admins manage the assistant.");
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing the assistant.");
  const parsed = assistantConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 400));
  }
  const before = await getAssistantConfig(true);
  const value = JSON.stringify(parsed.data);
  await db.platformSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value, updatedById: principal.userId },
    update: { value, updatedById: principal.userId },
  });
  forgetAssistantConfig();
  const changed = (Object.keys(parsed.data) as Array<keyof AssistantConfig>).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(parsed.data[k]));
  await audit({ userId: principal.userId, action: "ASSISTANT_CONFIG_UPDATE", entity: "PlatformSetting", entityId: KEY, changes: { changed }, request });
  return parsed.data;
}

export async function resetAssistantConfig(principal: Principal, request?: Request): Promise<AssistantConfig> {
  if (principal.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only platform admins manage the assistant.");
  if (!principal.mfa) throw new ApiError(403, "MFA_REQUIRED", "Turn on two-factor authentication before changing the assistant.");
  await db.platformSetting.deleteMany({ where: { key: KEY } });
  forgetAssistantConfig();
  await audit({ userId: principal.userId, action: "ASSISTANT_CONFIG_UPDATE", entity: "PlatformSetting", entityId: KEY, changes: { reset: true }, request });
  return defaultAssistantConfig();
}

/** Whether a team gets the premium assistant, and why. */
export async function tierFor(organizationId: string, now = new Date()): Promise<{ tier: Tier; reason: string }> {
  const [org, sub] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { plan: true } }),
    db.subscription.findUnique({ where: { organizationId }, select: { status: true, plan: true, currentPeriodEnd: true } }),
  ]);
  if (org?.plan === "INTERNAL") return { tier: "paid", reason: "internal team" };
  if (sub && sub.status !== "EXPIRED" && sub.currentPeriodEnd.getTime() > now.getTime()) return { tier: "paid", reason: `${sub.plan.toLowerCase()} plan` };
  const since = new Date(now.getTime() - PAID_WINDOW_DAYS * 86_400_000);
  const bought = await db.tokenLedger.count({ where: { organizationId, reason: "PURCHASE", createdAt: { gte: since } } });
  if (bought > 0) return { tier: "paid", reason: "credits bought in the last 90 days" };
  return { tier: "free", reason: "no plan or recent purchase" };
}
