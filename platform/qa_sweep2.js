const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  
  const results = [];
  const errors = [];
  let sessionCookie = null;
  
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
  
  // ── Phase 1: API login to get session cookie ──
  console.log('\n=== PHASE 1: API AUTH ===');
  const apiRes = await page.request.post('http://localhost:3400/api/auth/login', {
    data: { email: 'owner@demo.test', password: 'Demo@2026-Agency' }
  });
  const apiJson = await apiRes.json();
  report('API login returns ok', apiJson.ok === true, JSON.stringify(apiJson.data));
  
  if (apiJson.ok && apiJson.data) {
    // Extract session cookie from browser context
    const cookies = await context.cookies();
    sessionCookie = cookies.find(c => c.name === 'ap_session');
    report('Session cookie set', !!sessionCookie, sessionCookie ? 'name=' + sessionCookie.name : 'none');
  }
  
  // ── Phase 2: Authenticated pages (with session cookie) ──
  console.log('\n=== PHASE 2: AUTHENTICATED PAGES ===');
  
  const pages = [
    { url: 'http://localhost:3400/app', name: 'Dashboard' },
    { url: 'http://localhost:3400/app/brands', name: 'Brands' },
    { url: 'http://localhost:3400/app/campaigns', name: 'Campaigns' },
    { url: 'http://localhost:3400/app/content', name: 'Content Studio' },
    { url: 'http://localhost:3400/app/social', name: 'Social Channels' },
    { url: 'http://localhost:3400/app/catalogue', name: 'Catalogue' },
    { url: 'http://localhost:3400/app/team', name: 'Team' },
    { url: 'http://localhost:3400/platform', name: 'Platform Settings' },
  ];
  
  for (const p of pages) {
    const resp = await page.goto(p.url, { waitUntil: 'networkidle', timeout: 15000 });
    const status = resp ? resp.status() : 0;
    const bodyLen = await page.evaluate(() => document.body ? document.body.innerText.length : 0);
    
    let ok = status === 200 || status === 302;
    let detail = 'HTTP ' + status + ' | body: ' + bodyLen + ' chars';
    
    // Check for error indicators
    const hasError = await page.evaluate(() => {
      const errEl = document.querySelector('[role="alert"]');
      return errEl ? errEl.textContent : null;
    });
    if (hasError) {
      ok = false;
      detail += ' | ERROR: ' + hasError;
    }
    
    report(p.name + ' page', ok, detail);
  }
  
  // ── Phase 3: Public pages ──
  console.log('\n=== PHASE 3: PUBLIC PAGES ===');
  
  const publicPages = [
    { url: 'http://localhost:3400/', name: 'Home' },
    { url: 'http://localhost:3400/login', name: 'Login' },
    { url: 'http://localhost:3400/platform/create-org', name: 'Create Org' },
  ];
  
  for (const p of publicPages) {
    const resp = await page.goto(p.url, { waitUntil: 'networkidle', timeout: 15000 });
    const status = resp ? resp.status() : 0;
    report(p.name + ' page', status === 200, 'HTTP ' + status);
  }
  
  // ── Phase 4: API endpoints ──
  console.log('\n=== PHASE 4: API ENDPOINTS ===');
  
  const apiEndpoints = [
    { url: 'http://localhost:3400/api/health', name: 'Health' },
    { url: 'http://localhost:3400/api/auth/me', name: 'Whoami (auth)' },
    { url: 'http://localhost:3400/api/orgs', name: 'Orgs list (auth)' },
  ];
  
  for (const ep of apiEndpoints) {
    const resp = await page.request.get(ep.url);
    const status = resp.status();
    let detail = 'HTTP ' + status;
    if (status === 200) {
      try {
        const j = await resp.json();
        detail += ' | ' + JSON.stringify(j).substring(0, 120);
      } catch {}
    }
    report(ep.name, status < 500, detail);
  }
  
  // ── Phase 5: Error indicators ──
  console.log('\n=== PHASE 5: CONSOLE ERRORS ===');
  if (errors.length === 0) {
    report('No console errors', true);
  } else {
    report('Console errors found', false, errors.length + ' errors');
    errors.forEach(e => console.log('  [' + e.type + '] ' + e.text + ' (at ' + e.url + ')'));
  }
  
  // ── Summary ──
  console.log('\n=== SUMMARY ===');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log('Total: ' + results.length + ' | Passed: ' + passed + ' | Failed: ' + failed);
  
  await browser.close();
  
  const fs = require('fs');
  const outPath = process.env.TMPDIR || '/tmp';
  fs.writeFileSync(outPath + '/qa_results.json', JSON.stringify({ results, errors }, null, 2));
  console.log('\nResults written to ' + outPath + '/qa_results.json');
  
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
