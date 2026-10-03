// Walk through all key pages as owner and screenshot each
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const BASE = process.env.SITE_URL || 'http://localhost:3400';
const PROJECT_DIR = __dirname;
const SCREENSHOT_DIR = path.resolve(PROJECT_DIR, '.screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function screenshot(page, name) {
  const p = path.join(SCREENSHOT_DIR, `${name}-${ts}.png`);
  return page.screenshot({ path: p, fullPage: true }).then(() => console.log('screenshot:', p));
}

async function launchBrowser() {
  const execPath = path.resolve(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
  return chromium.launch({ executablePath: execPath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
}

// Read CREDENTIALS_KEY from .env
const envPath = path.resolve(__dirname, '..', '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const keyMatch = envContent.match(/^CREDENTIALS_KEY="([^"]+)"/m);
if (!keyMatch) {
  console.error('CREDENTIALS_KEY not found in .env');
  process.exit(1);
}
const CREDENTIALS_KEY_BASE64 = keyMatch[1];

// TOTP helpers (reimplemented from src/lib/totp.ts + src/lib/secrets.ts)
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(input) {
  if (!input) throw new Error('null secret');
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
const ALGORITHM = 'aes-256-gcm';
function decryptFor(scopeId, sealed) {
  const key = Buffer.from(CREDENTIALS_KEY_BASE64, 'base64');
  if (key.length !== 32) return null;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, 'base64'));
    decipher.setAAD(Buffer.from(scopeId, 'utf8'));
    decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.cipherText, 'base64')), decipher.final()]).toString('utf8');
  } catch { return null; }
}

async function getTotpCode() {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  const user = await db.user.findUnique({
    where: { email: 'owner@demo.test' },
    select: { id: true, totpCipher: true, totpIv: true, totpTag: true }
  });
  if (!user || !user.totpCipher) throw new Error('No TOTP data');
  const secret = decryptFor(user.id, { cipherText: user.totpCipher, iv: user.totpIv, authTag: user.totpTag });
  if (!secret) throw new Error('Failed to decrypt TOTP secret');
  const code = totpAt(secret, Date.now());
  await db.$disconnect();
  return code;
}

(async () => {
  console.log('=== Full owner walkthrough test ===');
  console.log('Target:', BASE);

  const totpCode = await getTotpCode();
  console.log('TOTP code:', totpCode);

  const browser = await launchBrowser();
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  try {
    // 1. Login
    console.log('\n[1/8] Login...');
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await screenshot(page, 'login');

    await page.locator('input[name="email"]').fill('owner@demo.test');
    await page.locator('input[name="password"]').fill('Demo@2026-Agency');
    await screenshot(page, 'login-credentials');

    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('input[name="totp"]', { timeout: 10000 });
    await screenshot(page, 'login-totp-prompt');

    await page.locator('input[name="totp"]').fill(totpCode);
    await screenshot(page, 'login-with-totp');
    await page.locator('button[type="submit"]').click();

    await page.waitForURL('**/app', { timeout: 20000 });
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'dashboard');
    console.log('   Dashboard loaded:', await page.title());

    // 2. Check modules are visible
    console.log('\n[2/8] Dashboard modules check...');
    const moduleHeadings = await page.locator('h3.font-medium').allTextContents();
    console.log('   Modules visible:', moduleHeadings);

    // 3. Team page
    console.log('\n[3/8] Team page...');
    await page.goto(`${BASE}/app/team`, { waitUntil: 'networkidle' });
    await screenshot(page, 'team');
    const teamHeading = await page.locator('h1').first().textContent().catch(() => '(none)');
    console.log('   Heading:', teamHeading);

    // 4. Platform page (should redirect to /app for org users)
    console.log('\n[4/8] Platform page redirect check...');
    await page.goto(`${BASE}/platform`, { waitUntil: 'networkidle' });
    await screenshot(page, 'platform-redirect');
    console.log('   Redirected to:', page.url());

    // 5. Security page
    console.log('\n[5/8] Security page...');
    await page.goto(`${BASE}/security`, { waitUntil: 'networkidle' });
    await screenshot(page, 'security');
    const secHeading = await page.locator('h1').first().textContent().catch(() => '(none)');
    console.log('   Heading:', secHeading);

    // 6. Try API health
    console.log('\n[6/8] API health check...');
    const response = await page.goto(`${BASE}/api/health`, { waitUntil: 'networkidle' });
    const apiBody = await page.locator('body').innerText();
    console.log('   API response:', apiBody);

    // 7. Homepage redirect (logged in goes to /app)
    console.log('\n[7/8] Home page (logged in)...');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await screenshot(page, 'home-redirect');
    console.log('   URL after /:', page.url());

    // 8. Logout
    console.log('\n[8/8] Logout...');
    await page.goto(`${BASE}/api/auth/logout`, { waitUntil: 'networkidle' });
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await screenshot(page, 'post-logout-login');
    console.log('   Back at login:', await page.title());

    console.log('\n✓ Walkthrough complete. Screenshots:');
    for (const f of fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png'))) {
      const stat = fs.statSync(path.join(SCREENSHOT_DIR, f));
      console.log('  - ' + f + ' (' + (stat.size / 1024).toFixed(1) + ' KB)');
    }
  } catch (e) {
    console.error('\n✗ FAILED:', e.message);
    try { await screenshot(page, 'error'); } catch {}
    throw e;
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
