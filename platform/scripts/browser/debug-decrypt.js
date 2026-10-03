const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const db = new PrismaClient();
  const user = await db.user.findUnique({
    where: { email: 'owner@demo.test' },
    select: { id: true, totpCipher: true, totpIv: true, totpTag: true, totpEnabledAt: true }
  });
  if (!user) { console.error('User not found'); process.exit(1); }

  console.log('User ID:', user.id);
  console.log('totpEnabledAt:', user.totpEnabledAt);

  // Try decrypt with explicit key from .env
  const key = Buffer.from('kLU42qU//D+r8L+EBO8XibaUkwz62qSGjaMjrmo8tDY=', 'base64');
  console.log('Key length:', key.length);

  const sealed = {
    cipherText: user.totpCipher,
    iv: user.totpIv,
    authTag: user.totpTag
  };

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(user.totpIv, 'base64'));
    decipher.setAAD(Buffer.from(user.id, 'utf8'));
    decipher.setAuthTag(Buffer.from(user.totpTag, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(user.totpCipher, 'base64')), decipher.final()]);
    console.log('Decrypted secret:', decrypted.toString('utf8'));
  } catch (e) {
    console.error('Decryption failed:', e.message);
  }

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
