import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { nextNumber as nextDocumentNumber } from "@/lib/numbering";
import { encryptFor } from "@/lib/secrets";
import { generateSecret } from "@/lib/totp";

/**
 * One-off demo tenant for the TikTok review video. Camera-facing, first-tenant content:
 * Real user (password sign-in + 2FA enrolled), one cafe brand, 100 studio credits.
 * NOT the seed file — production never runs db:seed.
 */
async function main() {
  const email = "demo@taristudio.africa";
  const password = process.env.DEMO_PASSWORD!;
  if (!password || password.length < 10) throw new Error("set DEMO_PASSWORD");

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log(JSON.stringify({ reused: true, userId: existing.id }));
    await db.$disconnect();
    return;
  }

  const org = await db.organization.create({
    data: { name: "Demo Café", slug: `demo-cafe-${Date.now().toString(36)}`, plan: "TRIAL", status: "ACTIVE" },
  });
  const user = await db.user.create({
    data: {
      email,
      name: "Demo Team",
      passwordHash: await hashPassword(password),
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      activeOrganizationId: org.id,
    },
  });
  await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
  for (const moduleKey of ["AI_CONTENT", "SOCIAL_PUBLISHING"]) {
    await db.organizationModule.create({ data: { organizationId: org.id, moduleKey, enabled: true } });
  }
  await db.tokenBalance.create({ data: { organizationId: org.id, kind: "CREDIT", balance: 100 } });

  // 2FA enrolled at creation: the connect/post step is MFA-gated by design.
  const seed = generateSecret();
  const sealed = encryptFor(user.id, seed);
  await db.user.update({
    where: { id: user.id },
    data: { totpCipher: sealed.cipherText, totpIv: sealed.iv, totpTag: sealed.authTag, totpEnabledAt: new Date(), totpLastCounter: null },
  });

  const brand = await db.brand.create({
    data: {
      organizationId: org.id,
      slug: "demo-cafe",
      name: "Demo Café",
      brandNumber: await nextDocumentNumber(org.id, "BRAND"),
      slogan: "Nyama tamu, kila siku",
      createdById: user.id,
      ...(await (async () => ({}))()),
    },
  });

  console.log(JSON.stringify({ ok: true, orgId: org.id, userId: user.id, brandId: brand.id, seed }));
  await db.$disconnect();
}
main().catch((e) => {
  console.error("DEMO-ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
