const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const networkTraffic = [];
  page.on('request', req => {
    if (req.url().includes('/api/') || req.url().includes('/auth/')) {
      networkTraffic.push({
        type: 'REQ',
        method: req.method(),
        url: req.url().slice(0, 200),
        postData: req.postData() ? req.postData().toString().slice(0, 500) : null
      });
    }
  });
  page.on('response', async res => {
    if (res.url().includes('/api/') || res.url().includes('/auth/')) {
      let bodyText = '';
      try { bodyText = (await res.text()).slice(0, 500); } catch(e) { bodyText = '[body unreadable]'; }
      networkTraffic.push({
        type: 'RES',
        method: res.request().method(),
        url: res.url().slice(0, 200),
        status: res.status(),
        body: bodyText
      });
    }
  });

  // Login
  await page.goto('http://localhost:3400/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', 'owner@demo.test');
  await page.fill('input[type="password"]', 'Demo@2026-Agency');
  await page.waitForTimeout(300);
  const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Sign in")');
  if (await submitBtn.count() > 0) await submitBtn.first().click();
  else await page.locator('input[type="password"]').press('Enter');
  await page.waitForTimeout(4000);
  await page.waitForLoadState('networkidle');

  const totp = fs.readFileSync('.tmp_totp.txt', 'utf8').trim();
  const totpInput = page.locator('input[type="text"], input[name="totp"], input#totp, input[name="code"], input#code, input[name="mfa"], input#totp_code');
  if (await totpInput.count() > 0) {
    await totpInput.fill(totp);
    await page.waitForTimeout(300);
    const vBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Verify")');
    if (await vBtn.count() > 0) await vBtn.first().click();
    else await totpInput.press('Enter');
    await page.waitForTimeout(4000);
    await page.waitForLoadState('networkidle');
  }

  console.log('Logged in at:', page.url());
  console.log('---\n');

  // Navigate to new brand form
  await page.goto('http://localhost:3400/app/brands/new');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await page.fill('input#name', 'Network API Brand ' + Date.now());
  await page.waitForTimeout(300);

  console.log('Clicking Create Brand...');
  await page.locator('button:has-text("Create Brand")').click();

  await page.waitForTimeout(8000);

  console.log('\n--- NETWORK TRAFFIC ---');
  for (const r of networkTraffic) {
    console.log(r.type + ' ' + r.method + ' ' + r.url + (r.status ? ' [' + r.status + ']' : '') +
      (r.postData ? '\n  POST: ' + r.postData : '') +
      (r.body ? '\n  RESP: ' + r.body : ''));
  }

  console.log('\n--- FINAL STATE ---');
  console.log('URL:', page.url());
  const text = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log('Text:', text);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
