/**
 * Platform Health Sweep — exploratory QA via Playwright
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

const BASE = 'http://localhost:3400';

function getTotp() {
  try {
    const out = execSync(
      'npx tsx --tsconfig scripts/tsconfig.json scripts/get-totp-quiet.ts',
      { cwd: process.cwd(), encoding: 'utf-8', timeout: 10000 }
    ).trim();
    return out;
  } catch {
    return null;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const results = [];
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ url: page.url(), text: msg.text() });
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push({ url: page.url(), text: `PAGE ERROR: ${err.message}` });
  });

  function record(name, status, detail = '') {
    results.push({ name, status, detail: detail.slice(0, 500) });
    console.log(`[${status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'WARN'}] ${name}${detail ? ': ' + detail : ''}`);
  }

  // ── 1. Landing page ──
  console.log('\n=== LANDING PAGE ===');
  const landing = await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  record('Landing loads', landing.ok() ? 'PASS' : 'FAIL', `HTTP ${landing.status()}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  const title = await page.title();
  record('Landing title', title.includes('Agency') ? 'PASS' : 'WARN', title);

  // ── 2. Login flow ──
  console.log('\n=== LOGIN FLOW ===');
  const totp = getTotp();
  record('TOTP generated', totp && totp.match(/^\d{6}$/) ? 'PASS' : 'FAIL', totp || 'none');

  if (totp && totp.match(/^\d{6}$/)) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    const emailField = await page.$('#email, input[name="email"], input[type="email"]');
    if (emailField) {
      await emailField.fill('owner@demo.test');
      record('Email field filled', 'PASS');
    } else {
      record('Email field found', 'FAIL', 'No #email / email input');
    }

    const pwField = await page.$('#password, input[name="password"], input[type="password"]');
    if (pwField) {
      await pwField.fill('Demo@2026-Agency');
      record('Password field filled', 'PASS');
    } else {
      record('Password field found', 'FAIL', 'No #password / password input');
    }

    const signInBtn = await page.$('button[type="submit"], button:has-text("Sign in"), button:has-text("Sign In")');
    if (signInBtn) {
      await signInBtn.click();
      await page.waitForTimeout(2000);
      record('Sign-in button clicked', 'PASS');
    } else {
      record('Sign-in button found', 'FAIL', 'No submit button');
    }

    const totpSelector = '#totp, input[name="totp"], input[autocomplete="one-time-code"]';
    const totpField = await page.$eval(totpSelector, el => el).catch(() => null);
    if (totpField) {
      await page.fill(totpSelector, totp);
      record('TOTP field filled', 'PASS', `code: ${totp}`);
    } else {
      record('TOTP field appeared', 'WARN', 'TOTP field not found');
    }

    const verifyBtn = await page.$('button[type="submit"]:not([disabled]), button:has-text("Verify")');
    if (verifyBtn) {
      await verifyBtn.click();
      await page.waitForTimeout(3000);
    }

    const currentUrl = page.url();
    const loggedIn = currentUrl.includes('/app') || currentUrl.includes('/dashboard');
    record('Login redirect', loggedIn ? 'PASS' : 'FAIL', `URL: ${currentUrl}`);

    // ── 3. App pages ──
    if (loggedIn) {
      console.log('\n=== APP PAGES ===');
      const appPages = [
        { url: `${BASE}/app`, name: 'Dashboard' },
        { url: `${BASE}/app/brands`, name: 'Brands' },
        { url: `${BASE}/app/content`, name: 'Content Studio' },
        { url: `${BASE}/app/social`, name: 'Channels' },
        { url: `${BASE}/app/campaigns`, name: 'Campaigns' },
        { url: `${BASE}/app/catalogue`, name: 'Catalogue' },
        { url: `${BASE}/app/team`, name: 'Team' },
      ];

      for (const p of appPages) {
        try {
          const resp = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await page.waitForLoadState('networkidle').catch(() => {});
          const status = resp.ok() ? 'PASS' : 'FAIL';
          const bodyText = await page.$eval('body', el => el.innerText).catch(() => '');
          const isEmpty = bodyText.trim().length < 20;
          record(`Page: ${p.name}`, status, `${resp.status()} — ${isEmpty ? 'EMPTY PAGE' : bodyText.trim().slice(0, 120).replace(/\n/g, ' ')}`);
        } catch (e) {
          record(`Page: ${p.name}`, 'FAIL', e.message.slice(0, 200));
        }
      }

      // ── 4. API endpoints ──
      console.log('\n=== API ENDPOINTS ===');
      const apiTests = [
        { path: '/api/health', name: 'Health check' },
        { path: '/api/auth/session', name: 'Session' },
        { path: '/api/brands', name: 'Brands list' },
        { path: '/api/content', name: 'Content list' },
        { path: '/api/campaigns', name: 'Campaigns list' },
        { path: '/api/catalogue', name: 'Catalogue list' },
        { path: '/api/team/members', name: 'Team members' },
        { path: '/api/settings', name: 'Settings' },
      ];

      for (const api of apiTests) {
        try {
          const resp = await page.evaluate((url) =>
            fetch(url, { credentials: 'include' }).then(r => r.json()).catch(e => ({ error: e.message }))
          , `${BASE}${api.path}`);
          const isErr = resp.error || (resp.status && !resp.ok);
          record(`API: ${api.name}`, isErr ? 'FAIL' : 'PASS', JSON.stringify(resp).slice(0, 250));
        } catch (e) {
          record(`API: ${api.name}`, 'FAIL', e.message.slice(0, 200));
        }
      }
    }
  }

  // ── 5. 404 page ──
  console.log('\n=== ERROR PAGES ===');
  const notFound = await page.goto(`${BASE}/this-does-not-exist-12345`, { waitUntil: 'domcontentloaded', timeout: 10000 });
  record('404 page', notFound.status() === 404 ? 'PASS' : 'WARN', `HTTP ${notFound.status()}`);

  // ── 6. Console errors ──
  console.log('\n=== CONSOLE ERRORS ===');
  if (consoleErrors.length === 0) {
    record('No console errors', 'PASS', 'Clean');
  } else {
    for (const err of consoleErrors) {
      record(`Console error on ${err.url}`, 'FAIL', err.text.slice(0, 300));
    }
  }

  // ── Summary ──
  console.log('\n=== SUMMARY ===');
  const passes = results.filter(r => r.status === 'PASS').length;
  const fails = results.filter(r => r.status === 'FAIL').length;
  const warns = results.filter(r => r.status === 'WARN').length;
  console.log(`Total: ${results.length} | PASS: ${passes} | FAIL: ${fails} | WARN: ${warns}`);

  await browser.close();

  writeFileSync(
    '/tmp/health-sweep-results.json',
    JSON.stringify({ results, consoleErrors, summary: { passes, fails, warns, total: results.length } }, null, 2)
  );
  console.log('\nResults written to /tmp/health-sweep-results.json');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
