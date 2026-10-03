const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3400';
const SHOTS_DIR = path.join(__dirname, '.screenshots-bugcheck');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function shot(page, name) {
  const file = path.join(SHOTS_DIR, name + '-' + ts + '.png');
  return page.screenshot({ path: file, fullPage: true }).then(function() { return console.log('screenshot: ' + name); });
}

function log(msg) { console.log('  ' + msg); }

(async function() {
  console.log('=== AGENCY PLATFORM BUG SWEEP ===');
  console.log('Target:', BASE);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  } catch (e) {
    console.error('BROWSER LAUNCH FAILED:', e.message);
    process.exit(1);
  }

  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  
  var errors = [];
  page.on('console', function(msg) {
    if (msg.type() === 'error') {
      errors.push('CONSOLE ERROR: ' + msg.text());
      log('CONSOLE ERROR: ' + msg.text());
    }
  });
  page.on('pageerror', function(err) {
    errors.push('PAGE ERROR: ' + err.message);
    log('PAGE ERROR: ' + err.message);
  });

  // Phase 1: Landing page
  log('1. LANDING PAGE');
  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 15000 });
    await shot(page, '00-landing');
    log('Title:', await page.title());
  } catch (e) {
    log('LANDING FAIL: ' + e.message);
  }

  // Phase 2: Login
  log('2. LOGIN PAGE');
  try {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 15000 });
    await shot(page, '01-login');
    log('Title:', await page.title());
    
    var emailCount = await page.locator('input[name="email"], input#email').count();
    var passCount = await page.locator('input[name="password"], input#password').count();
    var submitCount = await page.locator('button[type="submit"]').count();
    log('Form: email=' + emailCount + ' pass=' + passCount + ' submit=' + submitCount);
    
    if (emailCount > 0 && passCount > 0) {
      await page.locator('input[name="email"], input#email').fill('owner@demo.test');
      await page.locator('input[name="password"], input#password').fill('Demo@2026-Agency');
      await shot(page, '02-login-filled');
      
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForTimeout(3000);
      await shot(page, '03-login-submit');
      
      var url = page.url();
      log('After submit URL:', url);
      
      if (url.indexOf('/app') !== -1) {
        log('LOGGED IN DIRECTLY');
        await shot(page, '04-dashboard');
      } else if (url.indexOf('totp') !== -1 || await page.locator('input[name="totp"], input#totp').count() > 0) {
        log('TOTP STEP DETECTED');
        try {
          var execSync = require('child_process').execSync;
          var totp = execSync('node scripts/totp.js', { cwd: __dirname + '/../..', encoding: 'utf8' }).trim();
          log('TOTP code:', totp);
          await page.locator('input[name="totp"], input#totp').fill(totp);
          await shot(page, '05-totp-filled');
          await page.getByRole('button', { name: /sign in/i }).click();
          await page.waitForTimeout(5000);
          await shot(page, '06-post-totp');
          log('Post-TOTP URL:', page.url());
        } catch (e2) {
          log('TOTP GEN FAIL: ' + e2.message);
        }
      } else {
        log('UNEXPECTED STATE');
        await shot(page, '03b-unknown');
      }
    }
  } catch (e) {
    log('LOGIN FAIL: ' + e.message);
  }

  // Phase 3: App pages if logged in
  var currentUrl = page.url();
  if (currentUrl.indexOf('/app') !== -1) {
    log('3. APP NAVIGATION');
    
    var pages = [
      { url: '/app/brands', name: 'brands' },
      { url: '/app/content', name: 'content' },
      { url: '/app/campaigns', name: 'campaigns' },
      { url: '/app/catalogue', name: 'catalogue' },
      { url: '/app/social', name: 'social' },
      { url: '/app/team', name: 'team' },
      { url: '/app/settings', name: 'settings' }
    ];
    
    pages.forEach(function(p) {
      (async function() {
        try {
          await page.goto(BASE + p.url, { waitUntil: 'networkidle', timeout: 15000 });
          await page.waitForTimeout(500);
          await shot(page, 'app-' + p.name);
          var heading = await page.locator('h1').first().textContent().catch(function() { return '(no h1)'; });
          log(p.name + ': ' + heading.trim().substring(0, 60));
        } catch (e) {
          log(p.name + ' FAIL: ' + e.message);
        }
      })();
    });
    
    // Form test
    log('4. FORM TEST');
    (async function() {
      try {
        await page.goto(BASE + '/app/brands/new', { waitUntil: 'networkidle', timeout: 15000 });
        await shot(page, 'form-brand-new');
        
        var nameField = await page.locator('input#name, input[name="name"]').count();
        log('Brand name field: ' + (nameField > 0 ? 'FOUND' : 'MISSING'));
        
        if (nameField > 0) {
          await page.locator('input#name, input[name="name"]').fill('BugSweep Brand');
          await page.locator('input#contactName, input[name="contactName"]').fill('QA Tester');
          await page.locator('input#contactEmail, input[name="contactEmail"]').fill('qa@bugsweep.test');
          await shot(page, 'form-brand-filled');
          
          await page.getByRole('button', { name: /create/i }).click();
          await page.waitForTimeout(3000);
          await shot(page, 'form-brand-submit');
          log('After create URL:', page.url());
        }
      } catch (e) {
        log('FORM TEST FAIL: ' + e.message);
      }
    })();
  }

  // API check
  log('5. API CHECKS');
  try {
    var resp = await page.goto(BASE + '/api/health', { waitUntil: 'networkidle' });
    log('Health status: ' + resp.status());
    var body = await page.locator('body').innerText();
    log('Health body: ' + body.substring(0, 200));
  } catch (e) {
    log('API health FAIL: ' + e.message);
  }

  console.log('\n=== BUG SWEEP SUMMARY ===');
  log('Final URL: ' + page.url());
  log('Console errors: ' + errors.length);
  errors.forEach(function(e) { log('  - ' + e); });
  
  console.log('\nScreenshots: ' + SHOTS_DIR);
  console.log('Browser left open for inspection');

})().catch(function(e) {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
