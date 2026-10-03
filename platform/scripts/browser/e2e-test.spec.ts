import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

const EMAIL = "owner@demo.test";
const PASSWORD = "Demo@2026-Agency";

// Read the TOTP code from a file that gets updated before each test run
const TOTP_CODE = readFileSync(join(__dirname, "..", "..", ".tmp_totp.txt"), "utf-8").trim();

console.log("TOTP_CODE:", TOTP_CODE);

test("full e2e: login + navigate to all sections", async ({ page }) => {
  // 1. Go to login
  await page.goto("http://localhost:3400/login");
  await page.waitForLoadState("domcontentloaded");

  // 2. Step 1: email + password
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // 3. Step 2: wait for TOTP field to appear, fill it
  await page.waitForSelector("#totp", { state: "visible", timeout: 5000 });
  await page.locator("#totp").fill(TOTP_CODE);
  await page.getByRole("button", { name: "Verify and sign in" }).click();

  // 4. Should redirect to /app
  await page.waitForURL("**/app**", { timeout: 10000 });
  console.log("REDIRECTED to:", page.url());

  // 5. Navigate to Brands
  await page.getByRole("link", { name: "Brands" }).click();
  await page.waitForURL("**/app/brands**");
  console.log("Brands page:", page.url());

  // 6. Navigate to Content Studio
  await page.getByRole("link", { name: "Content Studio" }).click();
  await page.waitForURL("**/app/content**");
  console.log("Content page:", page.url());

  // 7. Navigate to Channels
  await page.getByRole("link", { name: "Channels" }).click();
  await page.waitForURL("**/app/social**");
  console.log("Social page:", page.url());

  // 8. Navigate to Campaigns
  await page.getByRole("link", { name: "Campaigns" }).click();
  await page.waitForURL("**/app/campaigns**");
  console.log("Campaigns page:", page.url());

  // 9. Navigate to Catalogue
  await page.getByRole("link", { name: "Catalogue" }).click();
  await page.waitForURL("**/app/catalogue**");
  console.log("Catalogue page:", page.url());

  // 10. Verify we landed on catalogue
  expect(page.url()).toContain("/app/catalogue");
  console.log("ALL_PAGES_VISITED");
});
