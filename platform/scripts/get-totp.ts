import { PrismaClient } from "@prisma/client";
import { totpAt } from "@/lib/totp";
import { decryptFor } from "@/lib/secrets";

async function main() {
  const db = new PrismaClient();
  try {
    const u = await db.user.findFirst({
      where: { email: "owner@demo.test" },
      select: { id: true, totpCipher: true, totpIv: true, totpTag: true },
    });
    if (!u || !u.totpCipher || !u.totpIv || !u.totpTag) {
      console.log("NO_TOTP");
      process.exit(1);
    }
    const seed = decryptFor(u.id, { cipherText: u.totpCipher, iv: u.totpIv, authTag: u.totpTag });
    if (!seed) {
      console.log("NO_TOTP");
      process.exit(1);
    }
    const code = totpAt(seed, Date.now());
    console.log("TOTP_CODE=" + code);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
