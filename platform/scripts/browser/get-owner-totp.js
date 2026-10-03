// Decrypt TOTP secret and generate codes - uses tsx for TS support
const crypto = require('crypto');

async function main() {
  // Use tsx to require TS modules
  const { createRequire } = require('module');
  const requireTs = createRequire(import.meta.url || __filename);
  
  // Load via tsx
  const { decryptFor } = await import('tsx/dist/config').then(async () => {
    // Use dynamic import with tsx
    return null;
  }).catch(() => null);
  
  // Direct approach: read and eval the secrets module
  const secretsPath = require('path').resolve(__dirname, 'src/lib/secrets.ts');
  const { PrismaClient } = require('@prisma/client');
  
  const db = new PrismaClient();
  
  const user = await db.user.findUnique({
    where: { email: 'owner@demo.test' },
    select: { id: true, totpCipher: true, totpIv: true, totpTag: true, totpEnabledAt: true }
  });
  
  console.log('Owner TOTP data:', JSON.stringify(user, null, 2));
  
  if (user.totpCipher && user.totpIv && user.totpTag) {
    // Use tsx to run the decryption
    const { execSync } = require('child_process');
    const script = `
const { decryptFor } = require(${JSON.stringify(secretsPath)});
const secret = decryptFor(${JSON.stringify(user.id)}, {
  cipherText: ${JSON.stringify(user.totpCipher)},
  iv: ${JSON.stringify(user.totpIv)},
  authTag: ${JSON.stringify(user.totpTag)}
});
console.log(secret);
`;
    try {
      const result = execSync(`npx tsx -e "${script.replace(/"/g, '\\"')}"`, { encoding: 'utf8', timeout: 15000 });
      const secret = result.trim();
      console.log('Decrypted TOTP secret (base32):', secret);
      
      // Generate codes
      const { totpAt } = await import('tsx').then(() => require('./src/lib/totp'));
      const now = Date.now();
      const code = totpAt(secret, now);
      console.log('Current TOTP code:', code);
    } catch(e) {
      console.error('Error:', e.message);
    }
  }
  
  await db.\$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
