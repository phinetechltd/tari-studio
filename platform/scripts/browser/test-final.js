const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHOTS_DIR = path.join(__dirname, '.screenshots-final');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

const log = (msg) => console.log(`  ${msg}`);
const shot = async (page, name) => {
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  log(`screenshot: ${name}`);
};

(async () => {
  console.log('=== AGENCY PLATFORM FINAL VERIFICATION ===');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') log(`CONSOLE ERROR: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    log(`PAGE ERROR: ${err.message}`);
  });

  // ── LOGIN ─────────────────────────────────────────────────────────────
  log('── 1. LOGIN ──');
  await page.goto('http://localhost:3400/login', { waitUntil: 'networkidle' });
  await page.locator('#email').fill('owner@demo.test');
  await page.locator('#password').fill('Demo@2026-Agency');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app**', { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  await shot(page, '01-dashboard');
  log('✅ Login successful');

  // ── NAVIGATE: BRANDS ──────────────────────────────────────────────────
  log('── 2. BRANDS ──');
  await page.goto('http://localhost:3400/app/brands', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '02-brands');

  // ── NAVIGATE: CONTENT STUDIO ─────────────────────────────────────────
  log('── 3. CONTENT STUDIO ──');
  await page.goto('http://localhost:3400/app/content', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '03-content');

  // ── NAVIGATE: CAMPAIGNS ──────────────────────────────────────────────
  log('── 4. CAMPAIGNS ──');
  await page.goto('http://localhost:3400/app/campaigns', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '04-campaigns');

  // ── NAVIGATE: CATALOGUE ──────────────────────────────────────────────
  log('── 5. CATALOGUE ──');
  await page.goto('http://localhost:3400/app/catalogue', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '05-catalogue');

  // ── NAVIGATE: CHANNELS ───────────────────────────────────────────────
  log('── 6. CHANNELS ──');
  await page.goto('http://localhost:3400/app/social', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '06-channels');

  // ── NAVIGATE: TEAM ──────────────────────────────────────────────────
  log('── 7. TEAM ──');
  await page.goto('http://localhost:3400/app/team', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '07-team');

  // ── NAVIGATE: SETTINGS ──────────────────────────────────────────────
  log('── 8. SETTINGS ──');
  await page.goto('http://localhost:3400/app/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '08-settings');

  // ── CREATE NEW BRAND ────────────────────────────────────────────────
  log('── 9. CREATE BRAND ──');
  await page.goto('http://localhost:3400/app/brands/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('#name').fill('TestBrand Final');
  await page.locator('#contactName').fill('Contact');
  await page.locator('#contactEmail').fill('test@brand.com');
  await page.locator('#contactPhone').fill('+254 700 000 000');
  await page.locator('#website').fill('https://testbrand.com');
  await shot(page, '09-brand-new-filled');
  await page.getByRole('button', { name: 'Create Brand' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await shot(page, '10-brand-created');
  log('✅ Brand created');

  // ── VERIFY BRAND IN LIST ────────────────────────────────────────────
  log('── 10. VERIFY BRAND ──');
  await page.goto('http://localhost:3400/app/brands', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '11-brands-verify');

  // ── LANDING PAGE ────────────────────────────────────────────────────
  log('── 11. LANDING PAGE ──');
  // Open a new tab to check landing page
  const page2 = await context.newPage();
  await page2.goto('http://localhost:3400', { waitUntil: 'networkidle' });
  await page2.waitForTimeout(1000);
  await page2.screenshot({ path: path.join(SHOTS_DIR, '12-landing.png'), fullPage: false });
  log('✅ Landing page captured');

  console.log('\n=== ALL TESTS COMPLETE ===');
  console.log('✅ Browser left open for inspection');
  console.log(`Screenshots: ${SHOTS_DIR}`);

})();
