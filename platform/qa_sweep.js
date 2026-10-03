const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  
  const results = [];
  const errors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push({ type: 'console.error', text: msg.text(), url: page.url() });
    }
  });
  
  page.on('pageerror', err => {
    errors.push({ type: 'pageerror', text: err.message, url: page.url() });
  });
  
  function report(label, ok, detail = '') {
    results.push({ label, ok, detail });
    console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + (detail ? ' | ' + detail : ''));
  }
  
  // 1. Home page
  console.log('\n=== 1. HOME PAGE ===');
  const homeResp = await page.goto('http://localhost:3400/', { waitUntil: 'networkidle' });
  report('Home loads', homeResp.status() === 200, 'HTTP ' + homeResp.status());
  const title = await page.title();
  report('Page title', title.length > 0, title);
  
  // 2. Login page
  console.log('\n=== 2. LOGIN FLOW ===');
  const loginResp = await page.goto('http://localhost:3400/login', { waitUntil: 'networkidle' });
  report('Login page loads', loginResp.status() === 200, 'HTTP ' + loginResp.status());
  
  const emailInput = await page.$('#email');
  report('Email input exists', !!emailInput);
  
  const passwordInput = await page.$('#password');
  report('Password input exists', !!passwordInput);
  
  const signInBtn = await page.$('button[type="submit"], button:has-text("Sign in"), button:has-text("Sign In")');
  report('Sign in button exists', !!signInBtn);
  
  await page.fill('#email', 'owner@demo.test');
  await page.fill('#password', 'Demo@2026-Agency');
  
  await page.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Sign In")');
  await page.waitForTimeout(2000);
  
  const totpInput = await page.$('#totp');
  report('TOTP field appears after email+password', !!totpInput);
  
  if (totpInput) {
    await page.fill('#totp', '646486');
    const verifyBtn = await page.$('button[type="submit"], button:has-text("Verify"), button:has-text("Sign in"), button:has-text("Continue")');
    if (verifyBtn) {
      await verifyBtn.click();
      await page.waitForTimeout(3000);
      
      const currentUrl = page.url();
      report('Login redirects to /app', currentUrl.includes('/app'), currentUrl);
      
      if (currentUrl.includes('/app')) {
        console.log('\n=== 3. DASHBOARD ===');
        await page.waitForTimeout(1000);
        
        const dashboardContent = await page.textContent('body');
        report('Dashboard has content', dashboardContent.length > 100, dashboardContent.length + ' chars');
        
        const navLinks = await page.$$('nav a, .nav-link, [href="/app/brands"], [href="/app/campaigns"], [href="/app/content"], [href="/app/social"], [href="/app/catalogue"], [href="/app/team"]');
        report('Navigation links present', navLinks.length > 0, navLinks.length + ' links found');
        
        console.log('\n=== 4. BRANDS PAGE ===');
        const brandsResp = await page.goto('http://localhost:3400/app/brands', { waitUntil: 'networkidle' });
        report('Brands page loads', brandsResp.status() === 200, 'HTTP ' + brandsResp.status());
        
        console.log('\n=== 5. CAMPAIGNS PAGE ===');
        const campaignsResp = await page.goto('http://localhost:3400/app/campaigns', { waitUntil: 'networkidle' });
        report('Campaigns page loads', campaignsResp.status() === 200, 'HTTP ' + campaignsResp.status());
        
        console.log('\n=== 6. CONTENT PAGE ===');
        const contentResp = await page.goto('http://localhost:3400/app/content', { waitUntil: 'networkidle' });
        report('Content page loads', contentResp.status() === 200, 'HTTP ' + contentResp.status());
        
        console.log('\n=== 7. SOCIAL PAGE ===');
        const socialResp = await page.goto('http://localhost:3400/app/social', { waitUntil: 'networkidle' });
        report('Social page loads', socialResp.status() === 200, 'HTTP ' + socialResp.status());
        
        console.log('\n=== 8. CATALOGUE PAGE ===');
        const catalogueResp = await page.goto('http://localhost:3400/app/catalogue', { waitUntil: 'networkidle' });
        report('Catalogue page loads', catalogueResp.status() === 200, 'HTTP ' + catalogueResp.status());
        
        console.log('\n=== 9. TEAM PAGE ===');
        const teamResp = await page.goto('http://localhost:3400/app/team', { waitUntil: 'networkidle' });
        report('Team page loads', teamResp.status() === 200, 'HTTP ' + teamResp.status());
        
        console.log('\n=== 10. API ENDPOINTS ===');
        const apiHealth = await page.goto('http://localhost:3400/api/health', { waitUntil: 'networkidle' });
        report('API health endpoint', apiHealth.status() === 200, 'HTTP ' + apiHealth.status());
        
        const apiDocs = await page.goto('http://localhost:3400/api', { waitUntil: 'networkidle' });
        report('API root endpoint', apiDocs.status() !== 404, 'HTTP ' + apiDocs.status());
      }
    } else {
      report('Verify button not found', false, 'TOTP entered but no submit button');
    }
  } else {
    report('TOTP field missing', false, 'Could not proceed with login');
    const bodyText = await page.textContent('body');
    report('Page body after submission', bodyText.length > 0, bodyText.substring(0, 200));
  }
  
  console.log('\n=== SUMMARY ===');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log('Total: ' + results.length + ' | Passed: ' + passed + ' | Failed: ' + failed);
  
  if (errors.length > 0) {
    console.log('\n=== CONSOLE ERRORS ===');
    errors.forEach(e => console.log(e.type + ': ' + e.text + ' (at ' + e.url + ')'));
  }
  
  await browser.close();
  
  const fs = require('fs');
  const outPath = process.env.TMPDIR || '/tmp';
  fs.writeFileSync(outPath + '/qa_results.json', JSON.stringify({ results, errors }, null, 2));
  console.log('\nResults written to ' + outPath + '/qa_results.json');
  
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
