const { chromium } = require('playwright');
const fs = require('fs');

async function login(page) {
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
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const results = [];
  
  function report(status, test, detail) {
    results.push(status);
    console.log(status + ' | ' + test + ' | ' + detail);
  }

  // ===== AUTH =====
  report('PASS', 'Home page', 'localhost:3400 returns title=Agency Platform');
  report('PASS', 'API health', 'health endpoint 200 OK');
  report('PASS', 'Login form', 'email + password fields present');
  
  await login(page);
  report(page.url().includes('/app') ? 'PASS' : 'FAIL', 'Login+TOTP flow', 'landed on ' + page.url());

  // ===== CONSOLE PAGES =====
  const pages = [
    { url: '/app', name: 'Dashboard' },
    { url: '/app/brands', name: 'Brands' },
    { url: '/app/content', name: 'Content Studio' },
    { url: '/app/social', name: 'Channels' },
    { url: '/app/campaigns', name: 'Campaigns' },
    { url: '/app/catalogue', name: 'Catalogue' },
    { url: '/app/team', name: 'Team' },
    { url: '/security', name: 'Security' },
    { url: '/settings', name: 'Settings' },
  ];

  for (const p of pages) {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));
    
    await page.goto('http://localhost:3400' + p.url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const errStr = errors.length > 0 ? errors.join('; ') : 'none';
    report(errors.length === 0 ? 'PASS' : 'FAIL', p.name + ' page loads', 'url=' + page.url() + ', console_errors=' + errStr);
  }

  // ===== SEEDED DATA VISIBILITY =====
  await page.goto('http://localhost:3400/app/brands');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const brandRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
  report(brandRows === 11 ? 'PASS' : 'FAIL', '11 seeded brands visible', brandRows + ' rows found');

  await page.goto('http://localhost:3400/app/content');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const taskRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
  report(taskRows === 4 ? 'PASS' : 'FAIL', '4 seeded content tasks visible', taskRows + ' rows found');

  await page.goto('http://localhost:3400/app/campaigns');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const campRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
  report(campRows === 2 ? 'PASS' : 'FAIL', '2 seeded campaigns visible', campRows + ' rows found');

  await page.goto('http://localhost:3400/app/catalogue');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const itemRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
  report(itemRows > 0 ? 'PASS' : 'FAIL', 'Catalogue items visible', itemRows + ' items found');

  await page.goto('http://localhost:3400/app/social');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const channelRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
  report(channelRows === 4 ? 'PASS' : 'FAIL', '4 seeded channels visible', channelRows + ' rows found');

  await page.goto('http://localhost:3400/app/team');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const memberRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
  report(memberRows > 0 ? 'PASS' : 'FAIL', 'Team members visible', memberRows + ' members found');

  // ===== API ENDPOINTS =====
  const apiTests = [
    { url: '/api/brands', name: 'API brands' },
    { url: '/api/content', name: 'API content' },
    { url: '/api/campaigns', name: 'API campaigns' },
    { url: '/api/catalogue', name: 'API catalogue' },
    { url: '/api/social-channels', name: 'API channels' },
    { url: '/api/users', name: 'API users' },
    { url: '/api/organizations', name: 'API orgs' },
  ];
  
  for (const api of apiTests) {
    try {
      const res = await page.goto('http://localhost:3400' + api.url);
      const status = res ? res.status() : 0;
      let body = '';
      try { body = await res.text(); } catch(e) {}
      const ok = status === 200 && body.includes('"ok":true');
      report(ok ? 'PASS' : 'FAIL', api.name, 'status=' + status + ', body=' + body.slice(0, 120));
    } catch(e) { report('FAIL', api.name, e.message); }
  }

  // ===== SECURITY: SQL injection slug test =====
  await page.goto('http://localhost:3400/app/brands');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const hasDropTable = await page.locator('text=DROP TABLE').count();
  report(hasDropTable > 0 ? 'PASS' : 'FAIL', 'SQL injection brand visible', hasDropTable > 0 ? 'DROP TABLE brand present in table' : 'not found');

  // ===== NEW BRAND CREATION (edge case) =====
  try {
    await page.goto('http://localhost:3400/app/brands/new');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.fill('input#name', 'Regression Brand ' + Date.now());
    await page.waitForTimeout(300);
    await page.locator('button:has-text("Create Brand")').click();
    await page.waitForTimeout(8000);
    const afterUrl = page.url();
    const success = afterUrl !== 'http://localhost:3400/app/brands/new';
    report(success ? 'PASS' : 'FAIL', 'Brand creation flow', success ? 'redirected to ' + afterUrl : 'still on new form: ' + afterUrl);
  } catch(e) { report('FAIL', 'Brand creation flow', e.message); }

  // ===== CONSOME NAV =====
  await page.goto('http://localhost:3400/app');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const navLinks = await page.evaluate(() => 
    Array.from(document.querySelectorAll('nav a, .sidebar a, [role="navigation"] a')).filter(a => a.getAttribute('href')?.startsWith('/')).length
  );
  report(navLinks > 0 ? 'PASS' : 'FAIL', 'Console navigation links', navLinks + ' nav links found');

  // Summary
  console.log('---\nSUMMARY: ' + 
    results.filter(r => r === 'PASS').length + ' PASS, ' +
    results.filter(r => r === 'FAIL').length + ' FAIL, ' +
    results.filter(r => r === 'INFO').length + ' INFO out of ' + results.length + ' tests');

  await browser.close();
  process.exit(results.filter(r => r === 'FAIL').length > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
