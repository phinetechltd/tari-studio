// Set up TOTP for owner using the API (avoids module resolution issues)
const { chromium } = require('playwright');
const path = require('path');
const crypto = require('crypto');

const BASE = 'http://localhost:3400';
const execPath = path.resolve(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');

// TOTP implementation (matches src/lib/totp.ts)
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(input) {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0, value = 0; const bytes = [];
  for (const ch of clean) { const idx = BASE32.indexOf(ch); if (idx === -1) throw new Error('bad'); value = (value << 5) | idx; bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; } }
  return Buffer.from(bytes);
}
function totpAt(secretB32, atMs) {
  const counter = Math.floor(atMs / 1000 / 30);
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1000000).padStart(6, '0');
}

// AES-256-GCM decrypt (matches src/lib/secrets.ts)
const ALGORITHM = 'aes-256-gcm';
function decryptFor(scopeId, sealed, key) {
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, 'base64'));
    decipher.setAAD(Buffer.from(scopeId, 'utf8'));
    decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.cipherText, 'base64')), decipher.final()]).toString('utf8');
  } catch { return null; }
}

async function main() {
  // Read CREDENTIALS_KEY from .env
  const fs = require('fs');
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const match = envContent.match(/^CREDENTIALS_KEY="([^"]+)"/m);
  if (!match) {
    console.error('CREDENTIALS_KEY not found in .env');
    process.exit(1);
  }
  const credentialsKey = Buffer.from(match[1], 'base64');
  if (credentialsKey.length !== 32) {
    console.error('CREDENTIALS_KEY is not 32 bytes');
    process.exit(1);
  }
  console.log('Using CREDENTIALS_KEY from .env');

  // Step 1: Login as owner and get session
  const browser = await chromium.launch({ executablePath: execPath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  try {
    // Login
    console.log('\n[1] Logging in as owner@demo.test...');
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await page.locator('input[name="email"]').fill('owner@demo.test');
    await page.locator('input[name="password"]').fill('Demo@2026-Agency');
    await page.locator('button[type="submit"]').click();

    // Wait for TOTP field
    await page.waitForSelector('input[name="totp"]', { timeout: 10000 });
    console.log('TOTP field found');

    // Get the pending TOTP secret from database via API
    // First, let's call the MFA begin endpoint
    console.log('\n[2] Calling MFA begin endpoint...');
    
    // We need to get the session cookie first. Let's check if there's a way to do this via API.
    // Actually, let's use the database directly to set up TOTP.
    
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient();
    
    const user = await db.user.findUnique({
      where: { email: 'owner@demo.test' },
      select: { id: true, email: true, totpEnabledAt: true, totpCipher: true, totpIv: true, totpTag: true }
    });
    
    if (!user) { console.error('Owner not found'); process.exit(1); }
    console.log('Owner:', user.id, user.email, 'TOTP enabled:', user.totpEnabledAt);
    
    if (user.totpEnabledAt) {
      // Already enrolled - decrypt and generate code
      const seed = decryptFor(user.id, { cipherText: user.totpCipher, iv: user.totpIv, authTag: user.totpTag }, credentialsKey);
      if (!seed) {
        console.error('Failed to decrypt TOTP seed with current CREDENTIALS_KEY');
        console.error('The seed was encrypted with a different key. Re-running seed...');
        await db.$disconnect();
        await browser.close();
        process.exit(1);
      }
      const code = totpAt(seed, Date.now());
      console.log('\n✅ TOTP already enabled!');
      console.log('Current code:', code);
      console.log('export OWNER_TOTP="' + code + '"');
    } else {
      console.log('TOTP not yet enabled');
    }
    
    await db.$disconnect();
    
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
