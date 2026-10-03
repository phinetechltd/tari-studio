import "server-only";
import { db } from "@/lib/db";
import { generateSecret, totpAt } from "@/lib/totp";
import { beginEnrolment, confirmEnrolment } from "@/server/mfa";

async function main() {
  // Get owner
  const user = await db.user.findUnique({
    where: { email: "owner@demo.test" },
    select: { id: true, email: true, totpEnabledAt: true },
  });

  if (!user) {
    console.error("Owner not found");
    process.exit(1);
  }

  console.log("Owner:", user.id, user.email, "TOTP:", user.totpEnabledAt);

  // If already enrolled, skip
  if (user.totpEnabledAt) {
    console.log("TOTP already enabled, getting current code...");
    // We need to get the secret to generate a code
    const { decryptFor } = await import("@/lib/secrets");
    const { totpAt } = await import("@/lib/totp");
    const u = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, totpCipher: true, totpIv: true, totpTag: true },
    });
    if (!u || !u.totpCipher || !u.totpIv || !u.totpTag) {
      console.error("Missing TOTP fields");
      process.exit(1);
    }
    const seed = decryptFor(user.id, {
      cipherText: u.totpCipher,
      iv: u.totpIv,
      authTag: u.totpTag,
    });
    if (seed) {
      const code = totpAt(seed, Date.now());
      console.log("Current TOTP code:", code);
      console.log("export OWNER_TOTP=" + code);
    } else {
      console.error("Failed to decrypt seed");
      process.exit(1);
    }
    await db.$disconnect();
    return;
  }

  // Begin enrolment
  const { secret, uri } = await beginEnrolment(user.id);
  console.log("Generated secret:", secret);
  console.log("OTP URI:", uri);

  // Generate a code for right now
  const code = totpAt(secret, Date.now());
  console.log("Current TOTP code:", code);

  // Confirm enrolment
  await confirmEnrolment(user.id, code);
  console.log("TOTP enabled!");

  console.log("");
  console.log("export OWNER_TOTP=" + code);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
