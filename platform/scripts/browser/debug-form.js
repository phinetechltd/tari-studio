// Debug: submit the new-campaign form and report the network result and the full hydration warning.
const path = require("path");
const fs = require("fs");
const { BASE, SCREENSHOT_DIR, launchBrowser } = require("./common");
(async () => {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, storageState: path.join(SCREENSHOT_DIR, "journey", "auth.json") });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  page.on("console", (m) => m.type() === "error" && console.log("CONSOLE:", m.text().slice(0, 1500)));
  page.on("response", (r) => /\/api\//.test(r.url()) && console.log("API", r.request().method(), r.status(), r.url().replace(BASE, "")));
  await page.goto(BASE + "/app/campaigns/new", { waitUntil: "load" });
  await page.waitForTimeout(8000);
  await page.fill("#name", "Heri Day Specials 3");
  const opts = await page.locator("#brandId option").evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
  if (opts[0]) await page.selectOption("#brandId", opts[0]);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !/\/new$/.test(u.pathname), { timeout: 200000 }).catch(() => console.log("no redirect"));
  console.log("url after:", page.url().replace(BASE, ""));
  console.log("alerts:", await page.locator("[role=alert]").allTextContents());
  await browser.close();
})();

