export {};
import { PrismaClient } from '@prisma/client';
import { decryptFor } from '@/lib/secrets';
import { totpAt } from '@/lib/totp';

async function main() {
  const db = new PrismaClient();
  
  const user = await db.user.findUnique({
    where: { email: 'owner@demo.test' },
    select: { id: true, totpCipher: true, totpIv: true, totpTag: true, totpEnabledAt: true }
  });

  if (!user) {
    console.error('Owner user not found');
    await db.$disconnect();
    process.exit(1);
  }

  console.log('Owner TOTP data:', JSON.stringify(user, null, 2));

  if (user.totpCipher && user.totpIv && user.totpTag) {
    const secret = decryptFor(user.id, {
      cipherText: user.totpCipher,
      iv: user.totpIv,
      authTag: user.totpTag
    });
    if (!secret) {
      console.error('Failed to decrypt TOTP secret');
      await db.$disconnect();
      process.exit(1);
    }
    console.log('Decrypted TOTP secret (base32):', secret);

    const now = Date.now();
    const code = totpAt(secret, now);
    console.log('Current TOTP code:', code);

    const code1 = totpAt(secret, now + 30000);
    const code2 = totpAt(secret, now + 60000);
    console.log('Next code (+30s):', code1);
    console.log('Next code (+60s):', code2);

    console.log('');
    console.log('export OWNER_TOTP="' + code + '"');
  }

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
