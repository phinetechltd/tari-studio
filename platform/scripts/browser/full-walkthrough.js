// Full interactive walkthrough via Playwright
// Launches visible browser, drives login -> TOTP -> dashboard -> team -> security
// Saves screenshots + console log to scratch/
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const execPath = path.resolve(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const BASE = 'http://localhost:3400';
const OUT = 'C:/Users/ondie/AppData/Local/hermes/cache/scratch';
const LOG = OUT + '/walkthrough-log.txt';
fs.writeFileSync(LOG, '=== BROWSER WALKTHROUGH LOG ===\n\n');

function log(msg) {
  console.log(msg);
  fs.appendFileSync(LOG, msg + '\n');
}

function ss(page, name) {
  const p = path.join(OUT, name + '.png');
  return page.screenshot({ path: p, fullPage: true }).then(() => {
    log('  📸 ' + p.replace(/.*\\/, ''));
  });
}

// TOTP helpers
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(input) {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0, value = 0; const bytes = [];
  for (const ch of clean) { const idx = BASE32.indexOf(ch); if (idx === -1) return null; value = (value << 5) | idx; bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; } }
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

async function main() {
  log('Launching visible browser (1400x1000)...');
  const browser = await chromium.launchPersistentContext(
    path.join(OUT, 'chrome-profile'),
    {
      executablePath: execPath,
      headless: false,
      viewport: { width: 1400, height: 1000 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ]
    }
  );
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  try {
    // ── 1. OPEN LOGIN PAGE ──
    log('\n=== STEP 1: Open login page ===');
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    log('  Title: ' + await page.title());
    log('  URL: ' + page.url());
    await ss(page, 'step1-login-page');

    // ── 2. FILL EMAIL ──
    log('\n=== STEP 2: Type email ===');
    log('  Typing: owner@demo.test into email field');
    await page.locator('input[name="email"]').click();
    await page.keyboard.type('owner@demo.test', { delay: 30 });
    await ss(page, 'step2-email-typed');

    // ── 3. FILL PASSWORD ──
    log('\n=== STEP 3: Type password ===');
    log('  Clicking password field...');
    await page.locator('input[name="password"]').click();
    log('  Typing: Demo@2026-Agency');
    await page.keyboard.type('Demo@2026-Agency', { delay: 30 });
    await ss(page, 'step3-password-typed');

    // ── 4. CLICK SIGN IN ──
    log('\n=== STEP 4: Click Sign in button ===');
    const btnBefore = await page.locator('button[type="submit"]').textContent();
    log('  Button text: "' + btnBefore + '"');
    await page.locator('button[type="submit"]').click();
    log('  Click sent!');
    await ss(page, 'step4-after-click');

    // ── 5. WAIT FOR RESPONSE ──
    log('\n=== STEP 5: Wait for response ===');
    await page.waitForTimeout(3000);  // Give server time to respond
    log('  URL now: ' + page.url());
    const bodyAfter = await page.locator('body').innerText();
    log('  Page text (first 500): ' + bodyAfter.substring(0, 500));

    // ── 6. CHECK IF TOTP FIELD APPEARED ──
    const totpField = page.locator('input[name="totp"]');
    const totpVisible = await totpField.isVisible().catch(() => false);
    log('\n=== STEP 6: TOTP check ===');
    log('  TOTP field visible: ' + totpVisible);

    if (totpVisible) {
      log('  *** TOTP REQUIRED ***');
      
      // ── 7. SCREENSHOT TOTP PROMPT ──
      await ss(page, 'step7-totp-prompt');

      // ── 8. COMPUTE + TYPE TOTP ──
      log('\n=== STEP 8: Compute and type TOTP code ===');
      const secret = 'PN5XPEGTOQ4SWWQ3ASDFG2EV4OY3POYX';
      const code = totpAt(secret, Date.now());
      log('  TOTP secret: ' + secret);
      log('  Code: ' + code);

      log('  Clicking TOTP field...');
      await totpField.click();
      log('  Typing code: ' + code);
      await page.keyboard.type(code, { delay: 50 });
      await ss(page, 'step8-totp-typed');

      // ── 9. CLICK VERIFY ──
      log('\n=== STEP 9: Click Verify and sign in ===');
      const verifyBtn = await page.locator('button[type="submit"]').textContent();
      log('  Button: "' + verifyBtn + '"');
      await page.locator('button[type="submit"]').click();
      log('  Click sent!');
      await ss(page, 'step9-verify-clicked');
      await page.waitForTimeout(3000);

      // ── 10. CHECK DASHBOARD ──
      log('\n=== STEP 10: Dashboard check ===');
      log('  URL: ' + page.url());

      if (page.url().includes('/login')) {
        const err = await page.locator('[role="alert"]').textContent().catch(() => '(no alert)');
        log('  *** LOGIN FAILED ***');
        log('  Error: ' + err);
        await ss(page, 'step10-login-failed');
      } else {
        log('  *** DASHBOARD LOADED ***');
        await ss(page, 'step10-dashboard');

        const h1 = await page.locator('h1').first().textContent().catch(() => '(no h1)');
        log('  H1: ' + h1);

        const cardCount = await page.locator('h3.font-medium').count();
        log('  Module cards: ' + cardCount);

        const cardNames = await page.locator('h3.font-medium').allTextContents();
        log('  Modules: ' + cardNames.join(', '));

        const mfa = await page.locator('text=two-factor').count() > 0;
        log('  MFA warning: ' + (mfa ? 'YES' : 'NO'));

        // ── 11. TEAM PAGE ──
        log('\n=== STEP 11: Navigate to team page ===');
        await page.goto(BASE + '/app/team', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => log('  Timeout/error: ' + e.message.substring(0, 80)));
        await page.waitForTimeout(2000);
        log('  URL: ' + page.url());
        await ss(page, 'step11-team');

        // ── 12. SECURITY PAGE ──
        log('\n=== STEP 12: Navigate to security page ===');
        await page.goto(BASE + '/security', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => log('  Timeout/error: ' + e.message.substring(0, 80)));
        await page.waitForTimeout(2000);
        log('  URL: ' + page.url());
        await ss(page, 'step12-security');

        const secH1 = await page.locator('h1').first().textContent().catch(() => '(no h1)');
        log('  H1: ' + secH1);
      }
    } else {
      // No TOTP field
      if (page.url().includes('/login')) {
        const err = await page.locator('[role="alert"]').textContent().catch(() => '(no alert)');
        log('\n  *** STILL ON LOGIN - CHECK ERROR ***');
        log('  Error/alert: ' + err);
        await ss(page, 'step6-still-login');
      } else {
        log('\n  *** LOGIN SUCCEEDED WITHOUT TOTP ***');
        await ss(page, 'step6-no-totp-dashboard');
        const h1 = await page.locator('h1').first().textContent().catch(() => '(no h1)');
        log('  H1: ' + h1);
      }
    }

    log('\n=== WALKTHROUGH COMPLETE ===');
    log('Screenshots saved to: ' + OUT);
    for (const f of fs.readdirSync(OUT).filter(f => f.startsWith('step') && f.endsWith('.png')).sort()) {
      const stat = fs.statSync(path.join(OUT, f));
      log('  ' + f + ' (' + (stat.size / 1024).toFixed(1) + ' KB)');
    }
  } catch (e) {
    log('\n*** UNEXPECTED ERROR: ' + e.message + ' ***');
    try { await ss(page, 'error-state'); } catch {}
  } finally {
    await browser.close();
    log('\nBrowser closed.');
  }
}

main().catch(e => { log('FATAL: ' + e); process.exit(1); });
