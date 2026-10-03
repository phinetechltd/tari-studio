#!/usr/bin/env node
/*
 * Visible browser workflow test for Agency Platform — FINAL VERSION.
 * Uses Node.js Playwright. Every action is visible and logged.
 * TOTP computed locally with working base32 + HMAC-SHA1 implementation.
 */
const { chromium } = require('playwright');
const crypto = require('crypto');
const path = require('path');

const BASE_URL = 'http://localhost:3400';
const EMAIL = 'owner@demo.test';
const PASSWORD = 'Demo@2026-Agency';
const TOTP_SECRET = 'PN5XPEGTOQ4SWWQ3ASDFG2EV4OY3POYX';
const SCREENSHOT_DIR = 'C:/Users/ondie/AppData/Local/Temp/browser-test-node';

/* ---- TOTP (HMAC-SHA1, RFC 6238) ---- */
function base32Decode(str) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const ch of str.toUpperCase()) {
        if (ch === '=') break;
        const idx = alphabet.indexOf(ch);
        if (idx === -1) continue;
        bits += idx.toString(2).padStart(5, '0');
    }
    // Convert bit string to bytes
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substring(i, i + 8), 2));
    }
    return Buffer.from(bytes);
}

function computeTOTP(secretBase32, timeSec) {
    const period = 30;
    const digits = 6;
    const timeStep = Math.floor((timeSec ?? Math.floor(Date.now() / 1000)) / period);
    const key = base32Decode(secretBase32);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigUInt64BE(BigInt(timeStep), 0);
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(timeBuffer);
    const hash = hmac.digest();
    const offset = hash[hash.length - 1] & 0xf;
    const binaryCode = ((hash[offset] & 0x7f) << 24) |
                       ((hash[offset + 1] & 0xff) << 16) |
                       ((hash[offset + 2] & 0xff) << 8) |
                       (hash[offset + 3] & 0xff);
    return String(binaryCode % 1000000).padStart(digits, '0');
}

/* ---- Helpers ---- */
function log(msg) {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] ${msg}`);
}

async function screenshot(page, name) {
    const filename = path.join(SCREENSHOT_DIR, `v2-${name}.png`);
    try {
        await page.screenshot({ path: filename, fullPage: false });
        log(`📸 ${name}: ${filename}`);
    } catch (e) {
        log(`⚠️  screenshot ${name} failed: ${e.message}`);
    }
}

/* ---- Main ---- */
(async () => {
    log('='.repeat(60));
    log('AGENCY PLATFORM — VISIBLE BROWSER WORKFLOW TEST');
    log('='.repeat(60));
    log(`URL: ${BASE_URL}`);
    log('Browser: Visible (1400×1000)');
    log();

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1400,1000',
        ],
    });

    const context = await browser.newContext({
        viewport: { width: 1400, height: 1000 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    log('✅ Browser launched — window is visible');
    log();

    /* ---- STEP 1: Open login page ---- */
    log('[1] Navigating to login page...');
    log(`   → ${BASE_URL}/login`);
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    const title = await page.title();
    log(`   Title: “${title}”`);
    await screenshot(page, 'step1-login-page');
    log();

    /* ---- STEP 2: Read page ---- */
    log('[2] Reading page content...');
    const bodyText = await page.evaluate(() => document.body.innerText);
    log('   Visible text (first 400 chars):');
    for (const line of bodyText.slice(0, 400).split('\n')) {
        if (line.trim()) log(`     · ${line.trim()}`);
    }
    log();

    /* ---- STEP 3: Type email ---- */
    log('[3] Typing email: ${EMAIL}');
    const emailSel = 'input[type="email"], input[name="email"], #email, input[formcontrolname="email"]';
    await page.fill(emailSel, EMAIL);
    log('   ✅ Email field filled');
    await screenshot(page, 'step3-email-typed');
    await page.waitForTimeout(500);
    log();

    /* ---- STEP 4: Type password ---- */
    log('[4] Typing password...');
    const passSel = 'input[type="password"], input[name="password"], #password, input[formcontrolname="password"]';
    await page.fill(passSel, PASSWORD);
    log('   ✅ Password field filled');
    await screenshot(page, 'step4-password-typed');
    await page.waitForTimeout(500);
    log();

    /* ---- STEP 5: Click Sign in ---- */
    log('[5] Clicking “Sign in” button...');
    const submitSel = 'button[type="submit"], button:has-text("Sign in"), input[value="Sign in"]';
    await page.click(submitSel);
    log('   ✅ Sign in clicked');
    await screenshot(page, 'step5-after-click');
    await page.waitForTimeout(3000);
    log();

    /* ---- STEP 6: Check result ---- */
    log('[6] Checking login result...');
    const urlAfter = page.url();
    log(`   URL: ${urlAfter}`);

    const bodyAfter = await page.evaluate(() => document.body.innerText);
    log(`   Page text after click (first 300 chars):`);
    for (const line of bodyAfter.slice(0, 300).split('\n')) {
        if (line.trim()) log(`     · ${line.trim()}`);
    }
    log();

    // Detect TOTP field
    const totpSel = 'input[type="text"][inputmode="numeric"], input[name="totp"], #totpCode, input[totp], input[autocomplete="one-time-code"]';
    let totpVisible = false;
    try {
        const count = await page.locator(totpSel).count();
        totpVisible = count > 0;
    } catch {}
    log(`   TOTP field visible: ${totpVisible}`);

    if (totpVisible) {
        log();
        log('   ⟹ TOTP challenge — computing code...');
        const now = Math.floor(Date.now() / 1000);
        const totpCode = computeTOTP(TOTP_SECRET, now);
        log(`   TOTP code: ${totpCode}  (secret: ${TOTP_SECRET})`);
        log();

        // Type TOTP
        log('[7] Typing TOTP code...');
        await page.fill(totpSel, totpCode);
        log('   ✅ TOTP code entered');
        await screenshot(page, 'step7-totp-typed');
        await page.waitForTimeout(500);

        // Click verify / sign in again
        log('[8] Submitting TOTP...');
        await page.click(submitSel);
        log('   ✅ TOTP submitted');
        await screenshot(page, 'step8-after-totp');
        await page.waitForTimeout(3000);
        log();

        const urlAfterTotp = page.url();
        log(`   URL after TOTP: ${urlAfterTotp}`);
        log();

        if (urlAfterTotp.includes('/app')) {
            log('   ✅ LOGIN SUCCESSFUL — landed on dashboard!');
            await screenshot(page, 'step8-dashboard');
            log();

            /* Dashboard exploration */
            log('[9] Exploring dashboard...');
            const dashText = await page.evaluate(() => document.body.innerText);
            log('   Dashboard content (first 500 chars):');
            for (const line of dashText.slice(0, 500).split('\n')) {
                if (line.trim()) log(`     · ${line.trim()}`);
            }
            log();

            log('[10] Navigating to Team page...');
            try {
                await page.goto(`${BASE_URL}/app/team`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                await page.waitForTimeout(2000);
                const teamText = await page.evaluate(() => document.body.innerText);
                log('   Team page content (first 300 chars):');
                for (const line of teamText.slice(0, 300).split('\n')) {
                    if (line.trim()) log(`     · ${line.trim()}`);
                }
                await screenshot(page, 'step10-team');
            } catch (e) {
                log(`   ⚠️  Team page: ${e.message}`);
            }
            log();

            log('[11] Navigating to Security page...');
            try {
                await page.goto(`${BASE_URL}/security`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                await page.waitForTimeout(2000);
                const secText = await page.evaluate(() => document.body.innerText);
                log('   Security page content (first 300 chars):');
                for (const line of secText.slice(0, 300).split('\n')) {
                    if (line.trim()) log(`     · ${line.trim()}`);
                }
                await screenshot(page, 'step11-security');
            } catch (e) {
                log(`   ⚠️  Security page: ${e.message}`);
            }
            log();
        }
    } else {
        // No TOTP — check if already logged in or if error
        if (urlAfter.includes('/app')) {
            log('   ✅ LOGIN SUCCESSFUL (no TOTP needed)');
            await screenshot(page, 'step6-dashboard');
            log();
        } else if (bodyAfter.toLowerCase().includes('incorrect') || bodyAfter.toLowerCase().includes('error')) {
            log('   ❌ Login failed — error message shown');
        } else {
            log('   ℹ️  Still on login page — no error, no TOTP');
            log('   ⟹ The page may be processing. Check screenshots.');
        }
        log();
    }

    /* Final screenshot */
    await screenshot(page, 'final-state');
    log();

    /* Summary */
    log('='.repeat(60));
    log('WORKFLOW TEST COMPLETE');
    log('='.repeat(60));
    log(`Final URL: ${page.url()}`);
    log(`Final title: “${await page.title()}”`);
    log();

    // Re-read body text for accurate summary
    const finalBody = await page.evaluate(() => document.body.innerText);
    const finalUrl = page.url();
    if (finalUrl.includes('/app')) {
        log('✅ RESULT: Login successful — dashboard accessed');
    } else if (finalBody.toLowerCase().includes('incorrect')) {
        log('❌ RESULT: Login failed — invalid credentials');
    } else {
        log('⚠️  RESULT: Login did not complete — review screenshots');
    }

    log();
    log(`Screenshots: ${SCREENSHOT_DIR}/`);
    log();

    await browser.close();
    log('Browser closed.');
    log('Done.');
})().catch(err => {
    log(`\n❌ FATAL: ${err.message}`);
    console.error(err);
    process.exit(1);
});
