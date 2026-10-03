const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Connecting to existing Chrome instance...');
  
  // Connect to the running Chrome on port 9222 (opened by previous test)
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => null);
  
  if (!browser) {
    console.log('No existing Chrome found, launching new one...');
    const newBrowser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--remote-debugging-port=9222']
    });
    const context = newBrowser.contexts()[0] || await newBrowser.newContext();
    const page = context.pages()[0] || await context.newPage();
    
    // Login first
    await page.goto('http://localhost:3400/login', { waitUntil: 'networkidle' });
    await page.locator('#email').fill('owner@demo.test');
    await page.locator('#password').fill('Demo@2026-Agency');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/app**', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    console.log('✅ Logged in on new Chrome instance');
    console.log('Press Ctrl+C to exit (browser stays open)');
    
    // Keep alive
    setInterval(() => {}, 1000);
    return;
  }
  
  const contexts = browser.contexts();
  const page = contexts[0]?.pages()[0];
  
  if (page) {
    const url = page.url();
    console.log(`Current page: ${url}`);
    
    // Navigate to brands and verify the created brand
    await page.goto('http://localhost:3400/app/brands', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'verify-brands.png' });
    console.log('✅ Screenshot saved: verify-brands.png');
  }
  
  browser.close();
})();
