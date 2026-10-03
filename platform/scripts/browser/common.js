// Shared browser test helpers
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.SITE_URL || 'http://localhost:3400';
const SCREENSHOT_DIR = path.resolve(__dirname, '../.screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function screenshot(page, name) {
  return page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${ts}.png`), fullPage: true });
}

function launchBrowser() {
  const execPath = process.env.CHROMIUM_PATH ||
    path.resolve(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1243/chrome-win64/chrome.exe');
  return chromium.launch({
    executablePath: execPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
}

module.exports = { BASE, SCREENSHOT_DIR, ts, screenshot, launchBrowser, screenshot_dir: SCREENSHOT_DIR };
