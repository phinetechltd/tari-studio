/**
 * Development seed: a small, realistic world to click around in.
 *
 *   platform admin        platform-admin@demo.test   (platform mode)
 *   Demo Agency           every shipped module, INTERNAL plan
 *     owner / approver / designer / marketer / analyst @demo.test
 *   Bare Agency           NO modules — exists only to prove the licence gate
 *     bare-owner@demo.test
 *   freelancer@demo.test  a Designer in BOTH agencies (exercises the switcher)
 *
 * It only ever upserts. It never deletes or resets, and it refuses to run in
 * production: a seed that wipes and recreates every row is precisely what must
 * not be possible here. Re-running it is safe and changes nothing that already
 * exists.
 */

try {
  process.loadEnvFile(".env");
} catch {
  // Environment may already be provided by the shell.
}

import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ModuleKey } from "@/lib/modules";
import { setModuleEnabled } from "@/server/organizations";

const PASSWORD = process.env.SEED_PASSWORD ?? "Demo@2026-Agency";
// Dependency order: a module is enabled only after the ones it requires.
const MODULES: ModuleKey[] = ["CONTENT_STUDIO", "SOCIAL_PUBLISHING", "CAMPAIGN_TRACKING", "AI_CONTENT", "LEADS_CRM", "WHATSAPP_AI"];

async function user(email: string, name: string, over: { isPlatformAdmin?: boolean } = {}) {
  return db.user.upsert({
    where: { email },
    create: { email, name, passwordHash: await hashPassword(PASSWORD), isPlatformAdmin: over.isPlatformAdmin ?? false },
    update: {},
  });
}

async function org(slug: string, name: string, plan: string) {
  return db.organization.upsert({ where: { slug }, create: { slug, name, plan }, update: {} });
}

async function member(userId: string, organizationId: string, role: string) {
  await db.membership.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    create: { userId, organizationId, role },
    update: {},
  });
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Refusing to seed demo data in production.");
  }

  await user("platform-admin@demo.test", "Platform Admin", { isPlatformAdmin: true });

  const demo = await org("demo-agency", "Demo Agency", "INTERNAL");
  const bare = await org("bare-agency", "Bare Agency", "TRIAL");

  const people: Array<[string, string, string]> = [
    ["owner@demo.test", "Amina Otieno", "OWNER"],
    ["approver@demo.test", "Brian Mwangi", "APPROVER"],
    ["designer@demo.test", "Christine Wanjiru", "DESIGNER"],
    ["marketer@demo.test", "David Kamau", "MARKETER"],
    ["analyst@demo.test", "Esther Njeri", "ANALYST"],
  ];
  for (const [email, name, role] of people) {
    const u = await user(email, name);
    await member(u.id, demo.id, role);
    await db.user.update({ where: { id: u.id }, data: { activeOrganizationId: demo.id } });
  }

  const bareOwner = await user("bare-owner@demo.test", "Grace Achieng");
  await member(bareOwner.id, bare.id, "OWNER");
  await db.user.update({ where: { id: bareOwner.id }, data: { activeOrganizationId: bare.id } });

  const freelancer = await user("freelancer@demo.test", "Felix Odhiambo");
  await member(freelancer.id, demo.id, "DESIGNER");
  await member(freelancer.id, bare.id, "DESIGNER");
  await db.user.update({ where: { id: freelancer.id }, data: { activeOrganizationId: demo.id } });

  // Through the real rules, in dependency order, so the seed cannot drift from them.
  for (const key of MODULES) {
    await setModuleEnabled({ organizationId: demo.id, moduleKey: key, enabled: true, byUserId: null });
  }

  console.log("Seeded. Every account's password:", PASSWORD);
  console.log("Sign in as platform-admin@demo.test, owner@demo.test, approver@demo.test, designer@demo.test,");
  console.log("bare-owner@demo.test (no modules) or freelancer@demo.test (two organisations).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
