import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import { writeFileSync } from "fs";

const EMAIL = "owner@demo.test";
const PASSWORD = "Demo@2026-Agency";
const BASE_URL = "http://localhost:3400";

function getTotp(): string {
  const out = execSync(
    `cd ${__dirname}/../.. && npx tsx --tsconfig scripts/tsconfig.json scripts/get-totp-quiet.ts 2>/dev/null`,
    { encoding: "utf8", timeout: 15000 }
  ).trim();
  return out.split("\n").pop()?.trim() || "";
}

test("full QA walkthrough with screenshots", async ({ page }) => {
  // Step 1: Open login
  console.log("Step 1: Navigating to login page...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: "C:/Users/ondie/AppData/Local/Hermes/scratch/screenshots/01_admin_login.png" });
  console.log("  Screenshot saved: 01_admin_login.png");

  // Step 2: Fill email + password
  console.log("Step 2: Filling credentials...");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(2000);

  // Step 3: Handle TOTP
  console.log("Step 3: Checking for TOTP...");
  const totpVisible = await page.locator("#totp").isVisible().catch(() => false);
  if (totpVisible) {
    const code = getTotp();
    console.log(`  TOTP code: ${code}`);
    await page.locator("#totp").fill(code);
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await page.waitForURL("**/app**", { timeout: 15000 });
  } else {
    console.log("  No TOTP required - already authenticated or flow changed");
  }

  await page.screenshot({ path: "C:/Users/ondie/AppData/Local/Hermes/scratch/screenshots/02_admin_dashboard.png" });
  console.log("  Screenshot saved: 02_admin_dashboard.png");

  // Step 4: Navigate to Brands
  try {
    await page.getByRole("link", { name: "Brands" }).first().click();
    await page.waitForURL("**/app/brands**", { timeout: 5000 });
    await page.screenshot({ path: "C:/Users/ondie/AppData/Local/Hermes/scratch/screenshots/03_admin_brands.png" });
    console.log("Step 4: Brands page - OK");
  } catch (e) {
    console.log("Step 4: Brands navigation failed:", (e as Error).message.substring(0, 100));
  }

  // Step 5: Navigate to Content Studio
  try {
    await page.getByRole("link", { name: "Content Studio" }).first().click();
    await page.waitForURL("**/app/content**", { timeout: 5000 });
    await page.screenshot({ path: "C:/Users/ondie/AppData/Local/Hermes/scratch/screenshots/04_admin_content.png" });
    console.log("Step 5: Content page - OK");
  } catch (e) {
    console.log("Step 5: Content navigation failed:", (e as Error).message.substring(0, 100));
  }

  // Step 6: Navigate to Channels
  try {
    await page.getByRole("link", { name: "Channels" }).first().click();
    await page.waitForURL("**/app/social**", { timeout: 5000 });
    await page.screenshot({ path: "C:/Users/ondie/AppData/Local/Hermes/scratch/screenshots/05_admin_channels.png" });
    console.log("Step 6: Channels page - OK");
  } catch (e) {
    console.log("Step 6: Channels navigation failed:", (e as Error).message.substring(0, 100));
  }

  // Step 7: Navigate to Campaigns
  try {
    await page.getByRole("link", { name: "Campaigns" }).first().click();
    await page.waitForURL("**/app/campaigns**", { timeout: 5000 });
    await page.screenshot({ path: "C:/Users/ondie/AppData/Local/Hermes/scratch/screenshots/06_admin_campaigns.png" });
    console.log("Step 7: Campaigns page - OK");
  } catch (e) {
    console.log("Step 7: Campaigns navigation failed:", (e as Error).message.substring(0, 100));
  }

  // Step 8: Navigate to Catalogue
  try {
    await page.getByRole("link", { name: "Catalogue" }).first().click();
    await page.waitForURL("**/app/catalogue**", { timeout: 5000 });
    await page.screenshot({ path: "C:/Users/ondie/AppData/Local/Hermes/scratch/screenshots/07_admin_catalogue.png" });
    console.log("Step 8: Catalogue page - OK");
  } catch (e) {
    console.log("Step 8: Catalogue navigation failed:", (e as Error).message.substring(0, 100));
  }

  // Step 9: Navigate to Team
  try {
    await page.getByRole("link", { name: "Team" }).first().click();
    await page.waitForURL("**/app/team**", { timeout: 5000 });
    await page.screenshot({ path: "C:/Users/ondie/AppData/Local/Hermes/scratch/screenshots/08_admin_team.png" });
    console.log("Step 9: Team page - OK");
  } catch (e) {
    console.log("Step 9: Team navigation failed:", (e as Error).message.substring(0, 100));
  }

  console.log("\nAdmin QA walkthrough complete!");
});
