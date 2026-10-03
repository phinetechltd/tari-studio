// Login flow test: sign in as owner (with TOTP), screenshot dashboard + team page
// Screenshots land in platform/.screenshots/
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ── Config ──
const BASE = process.env.SITE_URL || 'http://localhost:3400';
const PROJECT_DIR = __dirname;
const SCREENSHOT_DIR = path.resolve(PROJECT_DIR, '.screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function screenshot(page, name) {
  const p = path.join(SCREENSHOT_DIR, `${name}-${ts}.png`);
  return page.screenshot({ path: p, fullPage: true }).then(() => { console.log('screenshot:', p); });
}

async function launchBrowser() {
  const execPath = path.resolve(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
  return chromium.launch({
    executablePath: execPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
}

// ── TOTP + decryption (reimplemented from src/lib/totp.ts + src/lib/secrets.ts) ──
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(bytes);
}

function totpAt(secretB32, atMs) {
  const STEP_SECONDS = 30;
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1000000).padStart(6, '0');
}

// Exact copy of src/lib/secrets.ts decryptFor logic
const ALGORITHM = 'aes-256-gcm';
const CREDENTIALS_KEY_BASE64 = 'GeQiiRjMUNca8q2alutlKm0wRBy90xyahT30VlfJWwU='; // from .env

function decryptFor(scopeId, sealed) {
  const key = Buffer.from(CREDENTIALS_KEY_BASE64, 'base64');
  if (key.length !== 32) return null;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, 'base64'));
    decipher.setAAD(Buffer.from(scopeId, 'utf8'));
    decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.cipherText, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

// ── Main ──
(async () => {
  console.log('Starting login flow test against', BASE);
  console.log('CREDENTIALS_KEY:', CREDENTIALS_KEY_BASE64);

  // Get owner's TOTP sealed secret from DB
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  const user = await db.user.findUnique({
    where: { email: 'owner@demo.test' },
    select: { id: true, totpCipher: true, totpIv: true, totpTag: true }
  });
  
  if (!user || !user.totpCipher) {
    console.error('Owner account has no TOTP set up');
    await db.$disconnect();
    process.exit(1);
  }
  
  console.log('User ID:', user.id);
  console.log('Sealed:', { cipherText: user.totpCipher, iv: user.totpIv, authTag: user.totpTag });
  
  const secret = decryptFor(user.id, {
    cipherText: user.totpCipher,
    iv: user.totpIv,
    authTag: user.totpTag
  });
  
  if (!secret) {
    console.error('Failed to decrypt TOTP secret — check CREDENTIALS_KEY');
    await db.$disconnect();
    process.exit(1);
  }
  
  console.log('Decrypted TOTP secret (base32):', secret);
  const totpCode = totpAt(secret, Date.now());
  console.log('Current TOTP code:', totpCode);
  await db.$disconnect();

  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  try {
    // 1. Load login page
    console.log('\n1. Loading login page...');
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await screenshot(page, 'login');
    console.log('   Title:', await page.title());

    // 2. Fill email + password
    console.log('\n2. Filling credentials...');
    await page.locator('input[name="email"]').fill('owner@demo.test');
    await page.locator('input[name="password"]').fill('Demo@2026-Agency');
    await screenshot(page, 'login-credentials');

    // 3. Submit → TOTP step
    console.log('\n3. Submitting (TOTP step expected)...');
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('input[name="totp"]', { timeout: 10000 });
    await screenshot(page, 'login-totp-prompt');
    console.log('   TOTP field visible');

    // 4. Enter TOTP code
    console.log('\n4. Entering TOTP code:', totpCode);
    await page.locator('input[name="totp"]').fill(totpCode);
    await screenshot(page, 'login-with-totp');
    await page.locator('button[type="submit"]').click();

    // 5. Wait for dashboard
    console.log('\n5. Waiting for dashboard...');
    await page.waitForURL('**/app', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'dashboard');
    console.log('   URL:', page.url());

    // 6. Check content
    console.log('\n6. Dashboard content:');
    const heading = await page.locator('h1').first().textContent().catch(() => '(no h1)');
    console.log('   Heading:', heading);

    // 7. Team page
    console.log('\n7. Team page...');
    await page.goto(`${BASE}/app/team`, { waitUntil: 'networkidle' });
    await screenshot(page, 'team');

    // 8. Security page
    console.log('\n8. Security page...');
    await page.goto(`${BASE}/security`, { waitUntil: 'networkidle' });
    await screenshot(page, 'security');

    console.log('\n✓ Done. Screenshots:');
    for (const f of fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'))) {
      console.log('  -', f);
    }
  } catch (e) {
    console.error('\n✗ FAILED:', e.message);
    try { await screenshot(page, 'error'); } catch {}
    throw e;
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
