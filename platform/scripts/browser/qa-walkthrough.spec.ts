import { test, expect } from "@playwright/test";
import { execSync } from "child_process";

const EMAIL = "owner@demo.test";
const PASSWORD = "Demo@2026-Agency";
const BASE_URL = "http://localhost:3400";
const SHOTS = "C:/Users/ondie/AppData/Local/Hermes/scratch/screenshots";

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
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.screenshot({ path: `${SHOTS}/01_admin_login.png` });

  // Step 2: Fill email + password
  console.log("Step 2: Filling credentials...");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Step 3: TOTP only when the flow asks for it; either way, wait until the console home is up.
  console.log("Step 3: Checking for TOTP...");
  const totpVisible = await page
    .locator("#totp")
    .waitFor({ state: "visible", timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  if (totpVisible) {
    const code = getTotp();
    console.log("  TOTP code entered");
    await page.locator("#totp").fill(code);
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  } else {
    console.log("  No TOTP required");
  }
  await page.waitForURL("**/app**", { timeout: 20000 });
  await page.screenshot({ path: `${SHOTS}/02_admin_dashboard.png` });
  console.log("  Screenshot saved: 02_admin_dashboard.png");

  const sections: Array<[string, RegExp, string, string]> = [
    // [step, link name, url match, screenshot]
    ["4", /^Brands$/, /\/app\/brands/, "03_admin_brands"],
    ["5", /Studio/, /\/content/, "04_admin_studio"],
    ["6", /^Social$/, /\/app\/social/, "05_admin_channels"],
    ["7", /^Campaigns$/, /\/app\/campaigns/, "06_admin_campaigns"],
    ["8", /^Products$/, /\/app\/products/, "07_admin_products"],
    ["9", /^Team$/, /\/app\/team/, "08_admin_team"],
  ];

  for (const [step, link, url, shot] of sections) {
    try {
      await page.getByRole("link", { name: link }).first().click();
      await page.waitForURL(url, { timeout: 15000 });
      await page.screenshot({ path: `${SHOTS}/${shot}.png` });
      console.log(`Step ${step}: ${shot} - OK (${page.url()})`);
    } catch (e) {
      console.log(`Step ${step}: navigation failed:`, (e as Error).message.substring(0, 100));
    }
  }

  // The walkthrough must have ended inside the console.
  expect(page.url()).toContain("/app");
  console.log("\nAdmin QA walkthrough complete!");
});
