// Test all seeded roles in browser — login, screenshot dashboard, check permissions
// Run: node scripts/browser/test-roles.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

// ── Config ──
const BASE = process.env.SITE_URL || 'http://localhost:3400';
const PROJECT_DIR = __dirname;
const SCREENSHOT_DIR = path.resolve(PROJECT_DIR, '.screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ── Helpers ──
function screenshot(page, name) {
  const p = path.join(SCREENSHOT_DIR, `${name}-${ts}.png`);
  return page.screenshot({ path: p, fullPage: true }).then(() => console.log('  📸', p.replace(/.*\//g, '')));
}

async function launchBrowser() {
  const execPath = path.resolve(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
  return chromium.launch({ executablePath: execPath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
}

// ── TOTP (reimplemented from src/lib/totp.ts + src/lib/secrets.ts) ──
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(input) {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0, value = 0; const bytes = [];
  for (const ch of clean) { const idx = BASE32.indexOf(ch); if (idx === -1) throw new Error('bad b32'); value = (value << 5) | idx; bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; } }
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
const CREDENTIALS_KEY_BASE64 = 'GeQiiRjMUNca8q2alutlKm0wRBy90xyahT30VlfJWwU=';
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

async function getTotpCodeForUser(userId) {
  const db = new PrismaClient();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, totpCipher: true, totpIv: true, totpTag: true, totpEnabledAt: true }
  });
  await db.$disconnect();
  if (!user || !user.totpCipher) return null;
  const secret = decryptFor(user.id, { cipherText: user.totpCipher, iv: user.totpIv, authTag: user.totpTag });
  if (!secret) return null;
  return { code: totpAt(secret, Date.now()), enabled: !!user.totpEnabledAt };
}

// ── Test users ──
const USERS = [
  { email: 'platform-admin@demo.test', name: 'Platform Admin', role: 'SUPER_ADMIN', path: '/platform', note: 'Platform admin — no org' },
  { email: 'owner@demo.test', name: 'Amina Otieno', role: 'OWNER', path: '/app', note: 'Owner — Demo Agency, all 4 modules' },
  { email: 'approver@demo.test', name: 'Brian Mwangi', role: 'APPROVER', path: '/app', note: 'Approver — can approve content' },
  { email: 'designer@demo.test', name: 'Christine Wanjiru', role: 'DESIGNER', path: '/app', note: 'Designer — task:work only' },
  { email: 'marketer@demo.test', name: 'David Kamau', role: 'MARKETER', path: '/app', note: 'Marketer — content + campaigns' },
  { email: 'analyst@demo.test', name: 'Esther Njeri', role: 'ANALYST', path: '/app', note: 'Analyst — read-only reports' },
  { email: 'bare-owner@demo.test', name: 'Grace Achieng', role: 'OWNER', path: '/app', note: 'Owner — Bare Agency, NO modules' },
  { email: 'freelancer@demo.test', name: 'Felix Odhiambo', role: 'DESIGNER', path: '/app', note: 'Designer — in BOTH orgs' },
];

const PASSWORD = 'Demo@2026-Agency';

(async () => {
  console.log('═══════════════════════════════════════════');
  console.log('  ROLE TEST — Agency Platform');
  console.log('═══════════════════════════════════════════');
  console.log('Target:', BASE);
  console.log('Screenshots:', SCREENSHOT_DIR);
  console.log('');

  // Pre-fetch TOTP codes for all users
  console.log('Pre-fetching TOTP states...');
  const db = new PrismaClient();
  const allUsers = await db.user.findMany({
    where: { email: { in: USERS.map(u => u.email) } },
    select: { email: true, id: true, totpEnabledAt: true, totpCipher: true, totpIv: true, totpTag: true }
  });
  await db.$disconnect();

  const totpMap = {};
  for (const u of allUsers) {
    if (u.totpCipher) {
      const secret = decryptFor(u.id, { cipherText: u.totpCipher, iv: u.totpIv, authTag: u.totpTag });
      if (secret) {
        totpMap[u.email] = { code: totpAt(secret, Date.now()), enabled: !!u.totpEnabledAt };
      }
    }
  }
  console.log('TOTP status:', Object.entries(totpMap).map(([e, v]) => `  ${e}: ${v.enabled ? 'ENABLED (code: ' + v.code + ')' : 'not enabled'}`).join('\n'));
  console.log('');

  const browser = await launchBrowser();
  const results = [];

  for (const user of USERS) {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const t = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    try {
      console.log(`\n── ${user.email} (${user.role}) ──`);

      // Login
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await page.locator('input[name="email"]').fill(user.email);
      await page.locator('input[name="password"]').fill(PASSWORD);
      await screenshot(page, `${user.email.replace(/[^a-z0-9]/gi, '-')}-login`);

      // Submit
      await page.locator('button[type="submit"]').click();

      const totp = totpMap[user.email];
      if (totp?.enabled) {
        console.log(`  → TOTP required, using code: ${totp.code}`);
        await page.waitForSelector('input[name="totp"]', { timeout: 10000 });
        await page.locator('input[name="totp"]').fill(totp.code);
        await screenshot(page, `${user.email.replace(/[^a-z0-9]/gi, '-')}-totp`);
        await page.locator('button[type="submit"]').click();
      }

      // Wait for redirect
      const expectedPath = user.path;
      await page.waitForURL(`**${expectedPath}`, { timeout: 20000 });
      await page.waitForLoadState('networkidle');
      await screenshot(page, `${user.email.replace(/[^a-z0-9]/gi, '-')}-dashboard`);

      const url = page.url();
      const heading = await page.locator('h1').first().textContent().catch(() => '(no h1)');
      const subtitle = await page.locator('p').first().textContent().catch(() => '(no p)');
      
      // Check for MFA warning
      const hasMfaWarning = await page.locator('text=two-factor authentication').count();
      
      // Count module cards
      const moduleCards = await page.locator('h3.font-medium').allTextContents().catch(() => []);

      console.log(`  ✅ Login OK → ${url}`);
      console.log(`  📋 Heading: ${heading}`);
      console.log(`  📦 Modules visible: ${moduleCards.length} (${moduleCards.slice(0, 5).join(', ')}${moduleCards.length > 5 ? '...' : ''})`);
      console.log(`  🔒 MFA warning shown: ${hasMfaWarning > 0}`);

      results.push({ email: user.email, role: user.role, status: 'ok', url, heading, modules: moduleCards.length, mfaWarning: hasMfaWarning > 0 });
    } catch (e) {
      console.log(`  ❌ FAILED: ${e.message.substring(0, 100)}`);
      try { await screenshot(page, `${user.email.replace(/[^a-z0-9]/gi, '-')}-error`); } catch {}
      results.push({ email: user.email, role: user.role, status: 'fail', error: e.message.substring(0, 200) });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // Summary
  console.log('\n═══════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════');
  const ok = results.filter(r => r.status === 'ok').length;
  const fail = results.filter(r => r.status === 'fail').length;
  console.log(`  Passed: ${ok}/${results.length}`);
  console.log(`  Failed: ${fail}/${results.length}`);
  console.log('');
  for (const r of results) {
    if (r.status === 'ok') {
      console.log(`  ✅ ${r.email.padEnd(30)} → ${r.heading}`);
    } else {
      console.log(`  ❌ ${r.email.padEnd(30)} → ${r.error}`);
    }
  }
  console.log('');
  console.log('Screenshots saved to:', SCREENSHOT_DIR);
  for (const f of fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith('.png')).sort()) {
    const stat = fs.statSync(path.join(SCREENSHOT_DIR, f));
    console.log(`  ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
