import { PrismaClient } from "@prisma/client";
import { totpAt } from "@/lib/totp";
import { decryptFor } from "@/lib/secrets";
async function main() {
  const db = new PrismaClient();
  const u = await db.user.findFirst({
    where: { email: "owner@demo.test" },
    select: { id: true, totpCipher: true, totpIv: true, totpTag: true },
  });
  if (u && u.totpCipher && u.totpIv && u.totpTag) {
    const seed = decryptFor(u.id, { cipherText: u.totpCipher, iv: u.totpIv, authTag: u.totpTag });
    if (seed) {
      console.log(totpAt(seed, Date.now()));
    }
  }
  await db.$disconnect();
}
main().catch(() => {});
