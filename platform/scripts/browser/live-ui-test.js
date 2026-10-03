// Live UI test - owner walkthrough with screenshots
// Uses Playwright directly (not agent-browser) since agent-browser's Chromium is missing
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const execPath = path.resolve(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const BASE = 'http://localhost:3400';
const OUT = 'C:/Users/ondie/AppData/Local/hermes/cache/scratch';

async function main() {
  console.log('🚀 Launching browser at:', execPath);
  const browser = await chromium.launch({
    executablePath: execPath,
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1400,1000']
  });
  console.log('✅ Browser launched');

  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  try {
    // 1. Login page
    console.log('\n📱 1. Login page');
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    console.log('   Title:', await page.title());
    await page.screenshot({ path: OUT + '/ui-login-page.png', fullPage: true });
    console.log('   📸 ui-login-page.png');

    // 2. Fill credentials
    console.log('\n📱 2. Fill credentials (owner@demo.test / Demo@2026-Agency)');
    await page.locator('input[name="email"]').fill('owner@demo.test');
    await page.locator('input[name="password"]').fill('Demo@2026-Agency');
    await page.screenshot({ path: OUT + '/ui-credentials.png', fullPage: true });
    console.log('   📸 ui-credentials.png');

    // 3. Submit → TOTP step
    console.log('\n📱 3. Submit → TOTP required');
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('input[name="totp"]', { timeout: 10000 });
    await page.screenshot({ path: OUT + '/ui-totp-prompt.png', fullPage: true });
    console.log('   📸 ui-totp-prompt.png');
    const totpLabel = await page.locator('label[for="totp"]').textContent().catch(() => '6-digit code');
    console.log('   TOTP field label:', totpLabel);

    // 4. Enter TOTP (code may be stale - user can see the field)
    console.log('\n📱 4. TOTP code entered (code: 008836 — may be expired, re-run get-owner-totp.ts for fresh)');
    await page.locator('input[name="totp"]').fill('008836');
    await page.screenshot({ path: OUT + '/ui-totp-entered.png', fullPage: true });
    console.log('   📸 ui-totp-entered.png');

    // 5. Submit → dashboard
    console.log('\n📱 5. Dashboard...');
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForURL('**/app', { timeout: 20000 });
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: OUT + '/ui-dashboard.png', fullPage: true });
      console.log('   📸 ui-dashboard.png');
      console.log('   Title:', await page.title());
      const heading = await page.locator('h1').first().textContent().catch(() => '(none)');
      console.log('   Heading:', heading);
    } catch (e) {
      console.log('   Dashboard timeout — checking current state...');
      await page.screenshot({ path: OUT + '/ui-after-totp-submit.png', fullPage: true });
      console.log('   📸 ui-after-totp-submit.png (captures error/loading state)');
      console.log('   URL:', page.url());
      const body = await page.locator('body').innerText();
      console.log('   Body (first 300):', body.substring(0, 300));
    }

    // 6. Team page
    console.log('\n📱 6. Team page');
    await page.goto(BASE + '/app/team', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: OUT + '/ui-team.png', fullPage: true });
    console.log('   📸 ui-team.png');
    console.log('   URL:', page.url());

    // 7. Security page
    console.log('\n📱 7. Security page');
    await page.goto(BASE + '/security', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: OUT + '/ui-security.png', fullPage: true });
    console.log('   📸 ui-security.png');
    console.log('   URL:', page.url());

  } catch (e) {
    console.error('\n❌ FATAL:', e.message);
    try {
      await page.screenshot({ path: OUT + '/ui-error.png', fullPage: true });
      console.log('   📸 ui-error.png (error state)');
    } catch {}
  } finally {
    await browser.close();
    console.log('\n✅ Browser closed');
  }

  console.log('\n📸 All screenshots in:', OUT);
  for (const f of fs.readdirSync(OUT).filter(f => f.startsWith('ui-') && f.endsWith('.png')).sort()) {
    const stat = fs.statSync(path.join(OUT, f));
    console.log(`   ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
