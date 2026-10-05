import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

const EMAIL = "owner@demo.test";
const PASSWORD = "Demo@2026-Agency";

// Optional: with REQUIRE_TOTP=true the code is refreshed into this file before a run.
const TOTP_CODE = (() => {
  try {
    return readFileSync(join(__dirname, "..", "..", ".tmp_totp.txt"), "utf-8").trim();
  } catch {
    return "";
  }
})();

test("full e2e: login + navigate to all sections", async ({ page }) => {
  // 1. Go to login
  await page.goto("http://localhost:3400/login");
  await page.waitForLoadState("domcontentloaded");

  // 2. Step 1: email + password
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // 3. Step 2 (only when two-factor is on): wait briefly for the code page; otherwise we land on /app directly
  const totp = page.locator("#totp");
  const hasTotp = await totp.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
  if (hasTotp) {
    if (!TOTP_CODE) throw new Error("The app asked for an authenticator code but .tmp_totp.txt has none.");
    await totp.fill(TOTP_CODE);
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }

  // 4. Should redirect to /app
  await page.waitForURL("**/app**", { timeout: 15000 });
  console.log("REDIRECTED to:", page.url());

  // 5. Navigate to Brands
  await page.locator("nav").getByRole("link", { name: "Brands" }).first().click();
  await page.waitForURL("**/app/brands**", { timeout: 15000 });
  console.log("Brands page:", page.url());

  // 6. Navigate to the Studio
  await page.locator("nav").getByRole("link", { name: /Studio/ }).first().click();
  await page.waitForURL("**/content**", { timeout: 15000 });
  console.log("Studio page:", page.url());

  // 7. Navigate to Social
  await page.locator("nav").getByRole("link", { name: "Social" }).first().click();
  await page.waitForURL("**/app/social**", { timeout: 15000 });
  console.log("Social page:", page.url());

  // 8. Navigate to Campaigns
  await page.locator("nav").getByRole("link", { name: "Campaigns" }).first().click();
  await page.waitForURL("**/app/campaigns**", { timeout: 15000 });
  console.log("Campaigns page:", page.url());

  // 9. Navigate to Products
  await page.locator("nav").getByRole("link", { name: "Products" }).first().click();
  await page.waitForURL("**/app/products**", { timeout: 15000 });
  console.log("Products page:", page.url());

  // 10. Verify we landed on products
  expect(page.url()).toContain("/app/products");
  console.log("ALL_PAGES_VISITED");
});
