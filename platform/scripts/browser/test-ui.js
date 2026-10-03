const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHOTS_DIR = path.join(__dirname, '.screenshots');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

(async () => {
  console.log('Launching isolated Chrome...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  const log = (msg) => console.log(`  ${msg}`);
  const shot = async (name) => {
    const file = path.join(SHOTS_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    log(`screenshot: ${file}`);
  };

  try {
    // 1. Login page
    log('Navigating to /login');
    await page.goto('http://localhost:3400/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await shot('1-login-page');

    // 2. Fill email + password (no TOTP)
    log('Filling email and password...');
    await page.locator('#email').fill('owner@demo.test');
    await page.locator('#password').fill('Demo@2026-Agency');
    log('Clicking Sign in...');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForTimeout(2000);
    await shot('2-after-signin');

    // 3. Check redirect
    const url = page.url();
    log(`Current URL: ${url}`);
    if (!url.includes('/app')) {
      const body = await page.locator('body').textContent();
      throw new Error(`Login failed! Body: ${body?.substring(0, 300)}`);
    }
    log('✅ LOGIN SUCCESS');
    await shot('3-dashboard');

    // 4. Navigate to Brands
    log('Clicking Brands...');
    await page.getByRole('link', { name: 'Brands' }).click();
    await page.waitForTimeout(1000);
    await shot('4-brands');

    // 5. Navigate to Content Studio
    log('Clicking Content Studio...');
    await page.getByRole('link', { name: 'Content Studio' }).click();
    await page.waitForTimeout(1000);
    await shot('5-content');

    // 6. Navigate to Channels
    log('Clicking Channels...');
    await page.getByRole('link', { name: 'Channels' }).click();
    await page.waitForTimeout(1000);
    await shot('6-channels');

    // 7. Navigate to Campaigns
    log('Clicking Campaigns...');
    await page.getByRole('link', { name: 'Campaigns' }).click();
    await page.waitForTimeout(1000);
    await shot('7-campaigns');

    // 8. Navigate to Catalogue
    log('Clicking Catalogue...');
    await page.getByRole('link', { name: 'Catalogue' }).click();
    await page.waitForTimeout(1000);
    await shot('8-catalogue');

    log('✅ ALL PAGES NAVIGATED SUCCESSFULLY');

  } catch (err) {
    log(`❌ ERROR: ${err.message}`);
    await shot('error');
  }

  // Keep browser open for user to inspect
  log('Browser left open for inspection. Close manually when done.');
  // Do NOT call browser.close() — leave it open as requested

})();
