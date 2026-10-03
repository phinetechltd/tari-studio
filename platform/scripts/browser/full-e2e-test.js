/**
 * Agency Platform Browser Test Script
 * Tests: login, dashboard, brands, content, channels, campaigns
 */

"use strict";

const { chromium } = require("playwright");

const BASE_URL = "http://localhost:3400";
const EMAIL = "owner@demo.test";
const PASSWORD = "Demo@2026-Agency";

async function main() {
  console.log("Starting browser test...\n");

  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  // Collect console errors
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  try {
    // ===== TEST 1: LOGIN =====
    console.log("TEST 1: Login");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const title = await page.title();
    console.log(`  Page title: ${title}`);

    // Fill login form
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Check if we got TOTP required
    const bodyText = await page.textContent("body");
    if (bodyText.includes("6-digit code") || bodyText.includes("authenticator")) {
      console.log("  TOTP required - getting code...");
      // Get TOTP from database
      const { execSync } = require("child_process");
      const totpOutput = execSync(
        `cd ${__dirname} && npx tsx --tsconfig scripts/tsconfig.json -e "const {PrismaClient} = require('@prisma/client'); const {totpAt} = require('./src/lib/totp'); const {decryptFor} = require('./src/lib/secrets'); const db = new PrismaClient(); (async () => { const u = await db.user.findFirst({where:{email:'${EMAIL}'},select:{id:true,totpCipher:true,totpIv:true,totpTag:true}}); if(!u || !u.totpCipher) { console.log('NO_TOTP'); } else { const seed = decryptFor(u.id, {cipherText:u.totpCipher, iv:u.totpIv, authTag:u.totpTag}); console.log(totpAt(seed, Date.now())); } })();" 2>&1`,
        { encoding: "utf8", timeout: 10000 }
      ).trim();

      const totpCode = totpOutput.replace("NO_TOTP", "").trim();
      if (totpCode && totpCode.length === 6) {
        console.log(`  TOTP code: ${totpCode}`);
        await page.fill('input[name="totp"]', totpCode);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(3000);
      } else {
        console.log("  WARNING: Could not get TOTP code");
      }
    }

    // Verify we're logged in
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);
    const loggedInText = await page.textContent("body");
    const loggedIn = currentUrl.includes("/app") || currentUrl.includes("/platform");
    console.log(`  Logged in: ${loggedIn ? "YES" : "NO"}`);

    if (!loggedIn) {
      console.log("  BODY:", loggedInText.slice(0, 300));
      throw new Error("Login failed");
    }

    // ===== TEST 2: DASHBOARD =====
    console.log("\nTEST 2: Dashboard");
    await page.goto(`${BASE_URL}/app`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const dashText = await page.textContent("body");
    const hasDashboard = dashText.includes("Dashboard") || dashText.includes("Welcome") || dashText.includes("Modules");
    console.log(`  Dashboard visible: ${hasDashboard ? "YES" : "NO"}`);

    // Check for modules grid
    const hasModules = dashText.includes("Content Studio") || dashText.includes("Social Publishing") || dashText.includes("Campaigns");
    console.log(`  Modules visible: ${hasModules ? "YES" : "NO"}`);

    // ===== TEST 3: BRANDS PAGE =====
    console.log("\nTEST 3: Brands Page");
    await page.goto(`${BASE_URL}/app/brands`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const brandsText = await page.textContent("body");
    const hasBrands = brandsText.includes("Brands") || brandsText.includes("TechVault") || brandsText.includes("GreenLeaf");
    console.log(`  Brands page visible: ${hasBrands ? "YES" : "NO"}`);

    // Check for brand names in the table
    const hasTechVault = brandsText.includes("TechVault") || brandsText.includes("techvault");
    const hasGreenLeaf = brandsText.includes("GreenLeaf") || brandsText.includes("greenleaf");
    console.log(`  TechVault Solutions: ${hasTechVault ? "FOUND" : "MISSING"}`);
    console.log(`  GreenLeaf Organics: ${hasGreenLeaf ? "FOUND" : "MISSING"}`);

    // ===== TEST 4: CONTENT STUDIO =====
    console.log("\nTEST 4: Content Studio Page");
    await page.goto(`${BASE_URL}/app/content`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const contentText = await page.textContent("body");
    const hasContent = contentText.includes("Content Studio") || contentText.includes("Task") || contentText.includes("Brief");
    console.log(`  Content Studio visible: ${hasContent ? "YES" : "NO"}`);

    const hasTasks = contentText.includes("Q4 Product Launch") || contentText.includes("Social Media Content") || contentText.includes("TSK-");
    console.log(`  Tasks visible: ${hasTasks ? "YES" : "NO"}`);

    // ===== TEST 5: CHANNELS PAGE =====
    console.log("\nTEST 5: Channels Page");
    await page.goto(`${BASE_URL}/app/social`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const channelsText = await page.textContent("body");
    const hasChannels = channelsText.includes("Channels") || channelsText.includes("Facebook") || channelsText.includes("Instagram");
    console.log(`  Channels page visible: ${hasChannels ? "YES" : "NO"}`);

    const hasTechVaultChannel = channelsText.includes("TechVault Official") || channelsText.includes("techvaultke");
    const hasGreenLeafChannel = channelsText.includes("GreenLeaf Organics") || channelsText.includes("greenleaforganicske");
    console.log(`  TechVault channel: ${hasTechVaultChannel ? "FOUND" : "MISSING"}`);
    console.log(`  GreenLeaf channel: ${hasGreenLeafChannel ? "FOUND" : "MISSING"}`);

    // ===== TEST 6: CAMPAIGNS PAGE =====
    console.log("\nTEST 6: Campaigns Page");
    await page.goto(`${BASE_URL}/app/campaigns`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const campaignsText = await page.textContent("body");
    const hasCampaigns = campaignsText.includes("Campaigns") || campaignsText.includes("Q4 Cloud") || campaignsText.includes("Holiday");
    console.log(`  Campaigns page visible: ${hasCampaigns ? "YES" : "NO"}`);

    const hasCloudPush = campaignsText.includes("Q4 Cloud Services") || campaignsText.includes("Cloud Services Push");
    const hasHolidayPromo = campaignsText.includes("Holiday Season") || campaignsText.includes("Holiday Season Promotion");
    console.log(`  Q4 Cloud Services Push: ${hasCloudPush ? "FOUND" : "MISSING"}`);
    console.log(`  Holiday Season Promotion: ${hasHolidayPromo ? "FOUND" : "MISSING"}`);

    // ===== SUMMARY =====
    console.log("\n===== TEST SUMMARY =====");
    console.log(`Login: ${loggedIn ? "PASS" : "FAIL"}`);
    console.log(`Dashboard: ${hasDashboard ? "PASS" : "FAIL"}`);
    console.log(`Modules grid: ${hasModules ? "PASS" : "FAIL"}`);
    console.log(`Brands page: ${hasBrands ? "PASS" : "FAIL"}`);
    console.log(`Content Studio: ${hasContent ? "PASS" : "FAIL"}`);
    console.log(`Channels: ${hasChannels ? "PASS" : "FAIL"}`);
    console.log(`Campaigns: ${hasCampaigns ? "PASS" : "FAIL"}`);

    if (errors.length > 0) {
      console.log(`\nConsole errors (${errors.length}):`);
      errors.forEach((e) => console.log(`  - ${e.slice(0, 200)}`));
    } else {
      console.log("\nNo console errors detected.");
    }

    console.log("\nTest completed successfully!");

  } catch (err) {
    console.error("\nTEST FAILED:", err.message);
    await page.screenshot({ path: `${__dirname}/.screenshots/test-fail-${Date.now()}.png` });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
