const crypto = require('crypto');

// Base32 decode (matching the server's implementation)
function base32Decode(encoded) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output = [];
  
  for (let i = 0; i < encoded.length; i++) {
    const char = encoded[i].toUpperCase();
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(output);
}

function generateTOTP(seed, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(seed));
  hmac.update(msg);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const binary = ((hash[offset] & 0x7f) << 24) |
                 ((hash[offset + 1] & 0xff) << 16) |
                 ((hash[offset + 2] & 0xff) << 8) |
                 (hash[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, '0');
}

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  
  const u = await db.user.findFirst({
    where: { email: 'owner@demo.test' },
    select: { id: true, totpCipher: true, totpIv: true, totpTag: true },
  });
  
  if (!u || !u.totpCipher) {
    process.exit(1);
  }
  
  // Decrypt the seed
  const { decryptFor } = require('./src/lib/secrets');
  const seed = decryptFor(u.id, { cipherText: u.totpCipher, iv: u.totpIv, authTag: u.totpTag });
  
  if (!seed) {
    process.exit(1);
  }
  
  const now = Date.now();
  const counter = Math.floor(now / 30000);
  const code = generateTOTP(seed, counter);
  console.log(code);
  
  await db.$disconnect();
}

main().catch(() => process.exit(1));
