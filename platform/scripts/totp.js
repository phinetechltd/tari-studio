const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

// Simple AES-256-GCM decrypt
function decryptFor(scopeId, cipherText, iv, authTag) {
  const raw = process.env.CREDENTIALS_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) return null;
  
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAAD(Buffer.from(scopeId, 'utf8'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherText, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

// Base32 decode
function base32Decode(encoded) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output = [];
  for (let i = 0; i < encoded.length; i++) {
    const idx = alphabet.indexOf(encoded[i].toUpperCase());
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

// Generate TOTP code
function totpAt(seed, now) {
  const counter = Math.floor(now / 30000);
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
  require('dotenv').config();
  const db = new PrismaClient();
  
  const u = await db.user.findFirst({
    where: { email: 'owner@demo.test' },
    select: { id: true, totpCipher: true, totpIv: true, totpTag: true },
  });
  
  if (!u || !u.totpCipher) {
    console.log('NO_TOTP');
    process.exit(1);
  }
  
  const seed = decryptFor(u.id, u.totpCipher, u.totpIv, u.totpTag);
  if (!seed) {
    console.log('NO_TOTP');
    process.exit(1);
  }
  
  const code = totpAt(seed, Date.now());
  console.log(code);
  
  await db.$disconnect();
}

main().catch(() => process.exit(1));
