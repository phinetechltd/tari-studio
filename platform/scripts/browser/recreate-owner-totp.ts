import { db } from "@/lib/db";
import { generateSecret, totpAt, verifyTotp } from "@/lib/totp";
import { encryptFor, decryptFor } from "@/lib/secrets";

async function main() {
  const user = await db.user.findUnique({
    where: { email: "owner@demo.test" },
    select: { id: true, email: true, totpEnabledAt: true },
  });

  if (!user) {
    console.error("Not found");
    process.exit(1);
  }

  console.log("User:", user.id, user.totpEnabledAt);

  // Generate new secret
  const secret = generateSecret();
  console.log("New secret:", secret);

  // Encrypt with current key
  const sealed = encryptFor(user.id, secret);
  console.log("Sealed:", sealed);

  // Store pending enrolment
  await db.user.update({
    where: { id: user.id },
    data: {
      totpCipher: sealed.cipherText,
      totpIv: sealed.iv,
      totpTag: sealed.authTag,
      totpEnabledAt: null as any,
    },
  });

  // Generate code for now
  const code = totpAt(secret, Date.now());
  console.log("Current TOTP code:", code);

  // Verify
  const seed = decryptFor(user.id, sealed);
  if (seed) {
    const check = verifyTotp(seed, code);
    console.log("Verify:", check);

    // Confirm enrolment
    if (check.ok) {
      await db.user.update({
        where: { id: user.id },
        data: { totpEnabledAt: new Date(), totpLastCounter: check.counter },
      });
      console.log("TOTP enabled!");
    }
  }

  console.log("");
  console.log('export OWNER_TOTP="' + code + '"');

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
