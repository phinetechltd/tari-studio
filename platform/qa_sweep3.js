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
  
  // Phase 1: API auth
  console.log('\n=== PHASE 1: API AUTH ===');
  const apiRes = await page.request.post('http://localhost:3400/api/auth/login', {
    data: { email: 'owner@demo.test', password: 'Demo@2026-Agency' }
  });
  const apiJson = await apiRes.json();
  report('API login ok', apiJson.ok === true, 'next=' + apiJson.data?.next);
  
  // Phase 2: Auth pages via domcontentloaded (SPA-friendly)
  console.log('\n=== PHASE 2: AUTH PAGES (SPA) ===');
  const authPages = [
    { url: 'http://localhost:3400/app', name: 'Dashboard' },
    { url: 'http://localhost:3400/app/brands', name: 'Brands' },
    { url: 'http://localhost:3400/app/campaigns', name: 'Campaigns' },
    { url: 'http://localhost:3400/app/content', name: 'Content Studio' },
    { url: 'http://localhost:3400/app/social', name: 'Social Channels' },
    { url: 'http://localhost:3400/app/catalogue', name: 'Catalogue' },
    { url: 'http://localhost:3400/app/team', name: 'Team' },
  ];
  
  for (const p of authPages) {
    try {
      const resp = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);
      const status = resp ? resp.status() : 0;
      const bodyLen = await page.evaluate(() => document.body ? document.body.innerText.length : 0);
      const title = await page.title();
      
      let ok = status === 200 || status === 307 || status === 302;
      let detail = 'HTTP ' + status + ' | title="' + title + '" | body:' + bodyLen + 'c';
      
      const hasError = await page.evaluate(() => {
        const el = document.querySelector('[role="alert"]');
        return el ? el.textContent.trim() : null;
      });
      if (hasError) { ok = false; detail += ' | ERR: ' + hasError; }
      
      report(p.name, ok, detail);
    } catch (e) {
      report(p.name, false, e.message.substring(0, 100));
    }
  }
  
  // Phase 3: Public pages
  console.log('\n=== PHASE 3: PUBLIC PAGES ===');
  const pubPages = [
    { url: 'http://localhost:3400/', name: 'Home' },
    { url: 'http://localhost:3400/login', name: 'Login' },
    { url: 'http://localhost:3400/platform/create-org', name: 'Create Org' },
  ];
  for (const p of pubPages) {
    try {
      const resp = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);
      const status = resp ? resp.status() : 0;
      report(p.name, status === 200, 'HTTP ' + status);
    } catch (e) {
      report(p.name, false, e.message.substring(0, 100));
    }
  }
  
  // Phase 4: API endpoints
  console.log('\n=== PHASE 4: API ENDPOINTS ===');
  const apis = [
    { url: 'http://localhost:3400/api/health', name: 'Health (public)' },
    { url: 'http://localhost:3400/api/auth/me', name: 'Whoami (auth)' },
  ];
  for (const ep of apis) {
    const resp = await page.request.get(ep.url);
    const status = resp.status();
    let detail = 'HTTP ' + status;
    if (status === 200) {
      try {
        const j = await resp.json();
        detail += ' | ' + JSON.stringify(j).substring(0, 150);
      } catch {}
    }
    report(ep.name, status < 500, detail);
  }
  
  // Phase 5: Console errors
  console.log('\n=== PHASE 5: CONSOLE ERRORS ===');
  if (errors.length === 0) {
    report('No console errors', true);
  } else {
    report('Console errors: ' + errors.length, false);
    errors.forEach(e => console.log('  [' + e.type + '] ' + e.text.substring(0, 120) + ' @ ' + e.url));
  }
  
  console.log('\n=== SUMMARY ===');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log('Total: ' + results.length + ' | Pass: ' + passed + ' | Fail: ' + failed);
  
  await browser.close();
  const fs = require('fs');
  const outPath = process.env.TMPDIR || '/tmp';
  fs.writeFileSync(outPath + '/qa_results.json', JSON.stringify({ results, errors }, null, 2));
  console.log('Wrote ' + outPath + '/qa_results.json');
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
