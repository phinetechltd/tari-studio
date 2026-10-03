const {PrismaClient} = require("@prisma/client");
const {totpAt} = require("./src/lib/totp");
const {decryptFor} = require("./src/lib/secrets");

async function main() {
  const db = new PrismaClient();
  try {
    const u = await db.user.findFirst({
      where: {email: "owner@demo.test"},
      select: {id: true, totpCipher: true, totpIv: true, totpTag: true},
    });
    if (!u || !u.totpCipher) {
      console.log("NO_TOTP");
      process.exit(1);
    }
    const seed = decryptFor(u.id, {cipherText: u.totpCipher, iv: u.totpIv, authTag: u.totpTag});
    const code = totpAt(seed, Date.now());
    console.log("TOTP_CODE=" + code);
  } finally {
    await db.disconnect();
  }
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
