const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('=== AI SYSTEM TEST ===');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login
  await page.goto('http://localhost:3400/login', { waitUntil: 'networkidle' });
  await page.locator('#email').fill('owner@demo.test');
  await page.locator('#password').fill('Demo@2026-Agency');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/app**', { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  console.log('✅ Logged in');

  // Test AI API via browser fetch (uses session cookies)
  const result = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Write a short product description for cloud backup' }),
      });
      const data = await res.json();
      return { status: res.status, data };
    } catch (err) {
      return { error: err.message };
    }
  });

  console.log('AI API response:', JSON.stringify(result, null, 2));

  if (result.data?.ok) {
    console.log('✅ AI GENERATION WORKS!');
    console.log('Text:', result.data.data?.text?.substring(0, 200));
  } else if (result.data?.error?.code === 'UNAUTHENTICATED') {
    console.log('❌ Auth issue - session not passed correctly');
  } else if (result.data?.error?.code === 'FORBIDDEN') {
    console.log('❌ Permission issue - ai:generate not granted');
  } else if (result.data?.error?.code === 'VALIDATION_FAILED') {
    console.log('❌ Validation issue');
  } else {
    console.log('❌ Error:', result.data?.error || result.error);
  }

  await page.screenshot({ path: 'ai-test.png' });
  console.log('Browser left open');

})();
