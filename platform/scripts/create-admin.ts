// Creates (or promotes) the first platform administrator on a fresh deployment.
//   ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" npx tsx --tsconfig scripts/tsconfig.json scripts/create-admin.ts
// The account has no password: sign in once through "Forgot your password?" (an emailed code), set one, then
// enrol an authenticator app (production requires it for admin actions). Safe to run again.
import { randomBytes } from "node:crypto";

import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { normaliseEmail } from "@/lib/identity";

async function main() {
  const raw = process.env.ADMIN_EMAIL;
  if (!raw) throw new Error("Set ADMIN_EMAIL.");
  const email = normaliseEmail(raw);
  if (!email) throw new Error("ADMIN_EMAIL is not a valid email address.");
  const name = process.env.ADMIN_NAME?.trim() || "Platform Admin";
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { isPlatformAdmin: true, status: "ACTIVE", emailVerifiedAt: new Date() } });
    console.log(`Promoted ${email} to platform admin.`);
  } else {
    await db.user.create({
      data: {
        email,
        name,
        passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
        hasPassword: false,
        emailVerifiedAt: new Date(),
        isPlatformAdmin: true,
      },
    });
    console.log(`Created platform admin ${email}. Open /forgot-password to set a password.`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
