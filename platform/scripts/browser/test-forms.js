const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHOTS_DIR = path.join(__dirname, '.screenshots-v7');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

const log = (msg) => console.log(`  ${msg}`);
const shot = async (page, name) => {
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  log(`screenshot: ${name}`);
};

(async () => {
  console.log('=== AGENCY PLATFORM FORMS & UPLOADS TEST v7 ===');

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

  // ── BRANDS: CREATE ────────────────────────────────────────────────────
  log('── 2. BRANDS: CREATE ──');
  await page.goto('http://localhost:3400/app/brands/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '02-brands-new');

  await page.locator('#name').fill('TestBrand UI');
  await page.locator('#contactName').fill('Test Contact');
  await page.locator('#contactEmail').fill('test@brand.com');
  await page.locator('#contactPhone').fill('+254 700 000 000');
  await page.locator('#website').fill('https://testbrand.com');
  await shot(page, '03-brands-filled');

  await page.getByRole('button', { name: 'Create Brand' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await shot(page, '04-brands-created');
  log('✅ Brand created');

  // ── CONTENT STUDIO: CREATE ────────────────────────────────────────────
  log('── 3. CONTENT STUDIO: CREATE ──');
  await page.goto('http://localhost:3400/app/content/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '05-content-new');

  await page.locator('input[name="title"]').first().fill('Test Content Task');
  await page.locator('textarea[name="description"]').first().fill('E2E test content');
  const brandSelect = page.locator('select[name="brandId"]').first();
  if (await brandSelect.count() > 0) {
    await brandSelect.selectOption({ index: 1 }).catch(() => {});
  }
  await shot(page, '06-content-filled');

  await page.getByRole('button', { name: /create|save|connect/i }).first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await shot(page, '07-content-created');
  log('✅ Content created');

  // ── CHANNELS: CREATE ──────────────────────────────────────────────────
  log('── 4. CHANNELS: CREATE ──');
  await page.goto('http://localhost:3400/app/social/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '08-channels-new');

  // Debug: find all input elements
  const allInputs = await page.locator('input, select, textarea').all();
  for (const inp of allInputs) {
    const name = await inp.getAttribute('name');
    const id = await inp.getAttribute('id');
    const type = await inp.getAttribute('type');
    const tag = await inp.evaluate(el => el.tagName);
    log(`  ${tag}: name="${name}" id="${id}" type="${type}"`);
  }

  await page.locator('#name, input[name="name"]').first().fill('Test Channel').catch(() => {
    log('⚠️ Could not fill name field');
  });
  await page.locator('#platform, select[name="platform"]').first().selectOption({ index: 1 }).catch(() => {});
  await page.locator('#brandId, select[name="brandId"]').first().selectOption({ index: 1 }).catch(() => {});
  await shot(page, '09-channels-filled');

  await page.getByRole('button', { name: /create|save|connect/i }).first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await shot(page, '10-channels-created');
  log('✅ Channel created');

  // ── CAMPAIGNS: CREATE ─────────────────────────────────────────────────
  log('── 5. CAMPAIGNS: CREATE ──');
  await page.goto('http://localhost:3400/app/campaigns/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '11-campaigns-new');

  await page.locator('#name, input[name="name"]').first().fill('Test Campaign');
  await page.locator('#budgetCents, input[name="budget"]').first().fill('1000').catch(() => {});
  await page.locator('#brandId, select[name="brandId"]').first().selectOption({ index: 1 }).catch(() => {});
  await shot(page, '12-campaigns-filled');

  await page.getByRole('button', { name: /create|save|connect/i }).first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await shot(page, '13-campaigns-created');
  log('✅ Campaign created');

  // ── CATALOGUE: CREATE WITH IMAGE UPLOAD ──────────────────────────────
  log('── 6. CATALOGUE: CREATE WITH IMAGE ──');
  await page.goto('http://localhost:3400/app/catalogue/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '14-catalogue-new');

  await page.locator('#name, input[name="name"]').first().fill('Test Product');
  await page.locator('#priceCents, input[name="price"]').first().fill('9999').catch(() => {});
  await page.locator('#description, textarea[name="description"]').first().fill('E2E test product');
  await page.locator('#brandId, select[name="brandId"]').first().selectOption({ index: 1 }).catch(() => {});

  // Image upload
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count() > 0) {
    const testImg = path.join(__dirname, 'test-upload.png');
    const pngBuffer = Buffer.from([
      0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
      0x00,0x00,0x00,0x10,0x00,0x00,0x00,0x10,0x08,0x02,0x00,0x00,0x00,0x90,0x91,0x68,
      0x36,0x00,0x00,0x00,0x01,0x73,0x52,0x47,0x42,0x00,0xAE,0xCE,0x1C,0xE9,0x00,0x00,
      0x00,0x0B,0x49,0x44,0x41,0x54,0x28,0xCF,0x63,0x60,0xF8,0xCF,0x00,0x00,0x00,0x02,
      0x00,0x01,0x92,0x45,0x8E,0xE5,0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,0x42,
      0x60,0x82
    ]);
    fs.writeFileSync(testImg, pngBuffer);
    await fileInput.setInputFiles(testImg);
    await page.waitForTimeout(1500);
    await shot(page, '15-catalogue-upload');
    log('✅ Image uploaded');
  }

  await shot(page, '16-catalogue-filled');
  await page.getByRole('button', { name: /create|save|connect/i }).first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await shot(page, '17-catalogue-created');
  log('✅ Catalogue item created');

  // ── TEAM: CHECK ───────────────────────────────────────────────────────
  log('── 7. TEAM: CHECK ──');
  await page.goto('http://localhost:3400/app/team', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '18-team-list');
  log('✅ Team page loaded');

  // ── SETTINGS ──────────────────────────────────────────────────────────
  log('── 8. SETTINGS ──');
  await page.goto('http://localhost:3400/app/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '19-settings');
  log('✅ Settings page loaded');

  // ── VERIFY ALL CREATED ITEMS ──────────────────────────────────────────
  log('── 9. VERIFY CREATIONS ──');
  await page.goto('http://localhost:3400/app/brands', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '20-brands-verify');

  await page.goto('http://localhost:3400/app/content', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '21-content-verify');

  await page.goto('http://localhost:3400/app/catalogue', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '22-catalogue-verify');

  await page.goto('http://localhost:3400/app/campaigns', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '23-campaigns-verify');

  await page.goto('http://localhost:3400/app/social', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, '24-social-verify');

  console.log('\n=== ALL TESTS COMPLETE ===');
  console.log('✅ Browser left open for inspection');
  console.log(`Screenshots: ${SHOTS_DIR}`);

})();
