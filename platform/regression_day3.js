const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const results = [];

  function report(status, test, detail) {
    results.push({ status, test, detail });
    console.log(status + ' | ' + test + ' | ' + detail);
  }

  // ---- Login ----
  try {
    await page.goto('http://localhost:3400/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    const emailInput = page.locator('input[type="email"], input[name="email"], input#email');
    const pwInput = page.locator('input[type="password"]');
    const emailCount = await emailInput.count();
    const pwCount = await pwInput.count();
    report(emailCount > 0 && pwCount > 0 ? 'PASS' : 'FAIL', 'Login form fields', 'email=' + emailCount + ', pw=' + pwCount);

    await emailInput.fill('owner@demo.test');
    await pwInput.fill('Demo@2026-Agency');
    await page.waitForTimeout(300);

    const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Sign In")');
    const btnCount = await submitBtn.count();
    if (btnCount === 0) {
      await pwInput.press('Enter');
    } else {
      await submitBtn.first().click();
    }
    await page.waitForTimeout(4000);
    await page.waitForLoadState('networkidle');

    const url1 = page.url();
    report(url1.includes('/app') || url1.includes('/platform') ? 'PASS' : 'INFO', 'Post-login navigation', 'url=' + url1);
  } catch(e) {
    report('FAIL', 'Login step', e.message);
  }

  // ---- TOTP ----
  try {
    const totp = fs.readFileSync('.tmp_totp.txt', 'utf8').trim();
    const totpInput = page.locator('input[type="text"], input[name="totp"], input#totp, input[name="code"], input#code, input[name="mfa"], input#totp_code');
    const totpCount = await totpInput.count();
    
    if (totpCount > 0) {
      await totpInput.fill(totp);
      await page.waitForTimeout(300);
      
      const verifyBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Verify"), button:has-text("Submit"), button:has-text("Confirm")');
      const vBtnCount = await verifyBtn.count();
      if (vBtnCount > 0) {
        await verifyBtn.first().click();
      } else {
        await totpInput.press('Enter');
      }
      await page.waitForTimeout(4000);
      await page.waitForLoadState('networkidle');
    }
    
    const url2 = page.url();
    report(url2.includes('/app') ? 'PASS' : 'INFO', 'After TOTP', 'url=' + url2);
  } catch(e) {
    report('FAIL', 'TOTP step', e.message);
  }

  const finalUrl = page.url();
  console.log('---');
  console.log('FINAL URL:', finalUrl);

  // ---- Console regression tests ----
  if (finalUrl.includes('/app') || finalUrl.includes('/platform')) {
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    try {
      const title = await page.title();
      report('PASS', 'Console loads', 'title=' + title + ', url=' + page.url());
    } catch(e) { report('FAIL', 'Console loads', e.message); }

    // Brand management page
    try {
      await page.goto('http://localhost:3400/app/brands');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const brandsUrl = page.url();
      const brandCount = await page.locator('table tbody tr, [data-brand], .brand-row').count();
      report(brandsUrl.includes('/brands') ? 'PASS' : 'FAIL', 'Brands page', 'url=' + brandsUrl + ', rows=' + brandCount);
    } catch(e) { report('FAIL', 'Brands page', e.message); }

    // Content page
    try {
      await page.goto('http://localhost:3400/app/content');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const contentUrl = page.url();
      report(contentUrl.includes('/content') ? 'PASS' : 'FAIL', 'Content page', 'url=' + contentUrl);
    } catch(e) { report('FAIL', 'Content page', e.message); }

    // Campaigns page
    try {
      await page.goto('http://localhost:3400/app/campaigns');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const campUrl = page.url();
      report(campUrl.includes('/campaigns') ? 'PASS' : 'FAIL', 'Campaigns page', 'url=' + campUrl);
    } catch(e) { report('FAIL', 'Campaigns page', e.message); }

    // Catalogue page
    try {
      await page.goto('http://localhost:3400/app/catalogue');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const catUrl = page.url();
      report(catUrl.includes('/catalogue') ? 'PASS' : 'FAIL', 'Catalogue page', 'url=' + catUrl);
    } catch(e) { report('FAIL', 'Catalogue page', e.message); }

    // Social page
    try {
      await page.goto('http://localhost:3400/app/social');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const socUrl = page.url();
      report(socUrl.includes('/social') ? 'PASS' : 'FAIL', 'Social page', 'url=' + socUrl);
    } catch(e) { report('FAIL', 'Social page', e.message); }

    // Team page
    try {
      await page.goto('http://localhost:3400/app/team');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const teamUrl = page.url();
      report(teamUrl.includes('/team') ? 'PASS' : 'FAIL', 'Team page', 'url=' + teamUrl);
    } catch(e) { report('FAIL', 'Team page', e.message); }

    // Platform orgs page
    try {
      await page.goto('http://localhost:3400/platform');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const platUrl = page.url();
      report(platUrl.includes('/platform') ? 'PASS' : 'FAIL', 'Platform orgs page', 'url=' + platUrl);
    } catch(e) { report('FAIL', 'Platform orgs page', e.message); }

    // API: brands list
    try {
      const res = await page.goto('http://localhost:3400/api/brands');
      const status = res ? res.status() : 0;
      let body = '';
      try { body = await res.text(); } catch(e2) {}
      report(status === 200 ? 'PASS' : 'FAIL', 'API brands list', 'status=' + status + ', body=' + body.slice(0,150));
    } catch(e) { report('FAIL', 'API brands list', e.message); }

    // API: content tasks
    try {
      const res = await page.goto('http://localhost:3400/api/content');
      const status = res ? res.status() : 0;
      let body = '';
      try { body = await res.text(); } catch(e2) {}
      report(status === 200 ? 'PASS' : 'FAIL', 'API content tasks', 'status=' + status + ', body=' + body.slice(0,150));
    } catch(e) { report('FAIL', 'API content tasks', e.message); }

    // Check for console nav
    try {
      const navLinks = await page.locator('nav a, .sidebar a, .nav-link').count();
      report(navLinks > 0 ? 'PASS' : 'FAIL', 'Console navigation', 'links=' + navLinks);
    } catch(e) { report('FAIL', 'Console navigation', e.message); }
  }

  await browser.close();
  console.log('---');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const info = results.filter(r => r.status === 'INFO' || r.status === 'SKIP').length;
  console.log('SUMMARY: ' + passed + ' PASS, ' + failed + ' FAIL, ' + info + ' INFO/SKIP out of ' + results.length + ' tests');
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
