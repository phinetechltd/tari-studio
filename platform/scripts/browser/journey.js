// User-journey walk-through against a running dev server (console email stand-in prints codes to the server log).
// Usage: SITE_URL=http://localhost:3410 DEV_LOG=<path to server stdout> node scripts/browser/journey.js <step...>
const fs = require("fs");
const path = require("path");
const { BASE, SCREENSHOT_DIR, launchBrowser } = require("./common");

const DEV_LOG = process.env.DEV_LOG;
const STATE = path.join(SCREENSHOT_DIR, "journey-state.json");
const shots = path.join(SCREENSHOT_DIR, "journey");
fs.mkdirSync(shots, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const load = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {});
const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));

async function lastCode(after) {
  for (let i = 0; i < 60; i++) {
    const log = fs.readFileSync(DEV_LOG, "utf8");
    const m = [...log.matchAll(/Your code: (\d{6})/g)];
    if (m.length > after) return { code: m[m.length - 1][1], count: m.length };
    await sleep(1000);
  }
  throw new Error("no code in log");
}
const codeCount = () => [...fs.readFileSync(DEV_LOG, "utf8").matchAll(/Your code: (\d{6})/g)].length;

// A click before React attaches does a native submit; wait until the form is hydrated.
async function hydrated(page, selector = "form") {
  await page.waitForFunction((s) => {
    const el = document.querySelector(s);
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps") || k.startsWith("__reactFiber"));
  }, selector);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: false });
  console.log("shot", name, "|", page.url().replace(BASE, ""), "|", (await page.title()).slice(0, 50));
}

async function main() {
  const steps = process.argv.slice(2);
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, storageState: fs.existsSync(path.join(shots, "auth.json")) && !steps.includes("fresh") ? path.join(shots, "auth.json") : undefined });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 160)));
  const state = load();
  await page.addInitScript(() => { try { localStorage.setItem("cookie-notice-ok", "1"); } catch {} });

  try {
    if (steps.includes("signup")) {
      const email = `journey${Date.now() % 100000}@example.com`;
      state.email = email;
      state.password = "Journey-Pass-2026!";
      save(state);
      await page.goto(BASE + "/signup", { waitUntil: "domcontentloaded" });
      await hydrated(page);
      await shot(page, "01-signup");
      const before = codeCount();
      await page.fill('input[name="name"]', "Wanjiku Kamau");
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', state.password);
      await page.check('input[name="acceptTerms"]');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/verify/);
      await hydrated(page);
      await shot(page, "02-verify");
      const { code } = await lastCode(before);
      await page.fill('input[name="code"]', code);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/welcome/);
      await shot(page, "03-welcome");
      await ctx.storageState({ path: path.join(shots, "auth.json") });
    }
    if (steps.includes("team")) {
      await page.goto(BASE + "/welcome", { waitUntil: "domcontentloaded" });
      await hydrated(page);
      await page.fill("#team-name, input[placeholder*='Savanna']", "Savanna Creative");
      await page.click("button:has-text('Create team')");
      await page.waitForURL((u) => !/welcome/.test(u.pathname), { timeout: 120000 });
      await shot(page, "04-after-team");
      await ctx.storageState({ path: path.join(shots, "auth.json") });
    }
    if (steps.includes("login")) {
      await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
      await hydrated(page);
      await page.fill("#email", state.email);
      await page.fill("#password", state.password);
      await page.click("button[type=submit]");
      await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 240000 });
      await shot(page, "03b-after-login");
      await ctx.storageState({ path: path.join(shots, "auth.json") });
    }
    if (steps.includes("brand")) {
      await page.goto(BASE + "/app/brands/new", { waitUntil: "domcontentloaded" });
      await hydrated(page);
      await page.fill("#name", "Mama Nyama Grill");
      await page.fill("#contactName", "Grace Njeri");
      await page.fill("#contactEmail", "grace@mamanyama.example");
      await page.fill("#contactPhone", "0712345678");
      await page.fill("#website", "https://mamanyama.example");
      await shot(page, "05-brand-form");
      await page.click("button[type=submit]");
      await page.waitForURL((u) => /^\/app\/brands/.test(u.pathname) && !/\/new$/.test(u.pathname), { timeout: 240000 });
      await sleep(1500);
      await shot(page, "06-brand-saved");
      console.log("brand saved ->", page.url().replace(BASE, ""), "| text has brand:", (await page.content()).includes("Mama Nyama Grill"));
    }
    if (steps.includes("campaign")) {
      await page.goto(BASE + "/app/campaigns/new", { waitUntil: "domcontentloaded" });
      await hydrated(page);
      await page.fill("#name", "Heri Day Specials");
      await page.fill("#description", "Weekend grill offers for Nairobi families");
      const opts = await page.locator("#brandId option").evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
      if (opts[0]) await page.selectOption("#brandId", opts[0]);
      await page.fill("#budget", "15000").catch(() => {});
      await shot(page, "07-campaign-form");
      await page.click("button[type=submit]");
      await page.waitForURL((u) => /^\/app\/campaigns\/[^/]+$/.test(u.pathname) && !/\/new$/.test(u.pathname), { timeout: 240000 });
      await sleep(1500);
      await shot(page, "08-campaign-saved");
      console.log("campaign ->", page.url().replace(BASE, ""));
    }
    if (steps.includes("character")) {
      await page.goto(BASE + "/app/characters/new", { waitUntil: "domcontentloaded" });
      await hydrated(page);
      await page.fill("#c-name", "Mama Nyama");
      await page.fill("#c-desc", "Warm, smiling woman in her fifties wearing a red kitenge apron, short grey hair");
      const file = page.locator("input[type=file]").first();
      if (await file.count()) await file.setInputFiles(path.resolve(__dirname, "test-upload.png"));
      await sleep(1000);
      await shot(page, "09-character-form");
      await page.click("button[type=submit]");
      await page.waitForURL((u) => !/\/new$/.test(u.pathname), { timeout: 240000 }).catch(() => {});
      await sleep(2000);
      await shot(page, "10-character-saved");
      console.log("character ->", page.url().replace(BASE, ""));
    }
    if (steps.includes("topup")) {
      await page.goto(BASE + "/billing", { waitUntil: "domcontentloaded" });
      await hydrated(page, "main section");
      await sleep(1500);
      await page.click("button:has-text('Top up')");
      await sleep(1500);
      await shot(page, "11-topup-dialog");
      console.log("dialog text:", (await page.locator("dialog[open]").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 600));
      await page.click("dialog[open] button:has-text('Prompt on your phone')");
      await sleep(500);
      await page.fill("dialog[open] input", "0712345678");
      await shot(page, "11b-mpesa");
      await page.click("dialog[open] button:has-text('with M-Pesa')");
      await sleep(15000);
      await shot(page, "12-topup-paying");
      await page.waitForFunction(() => /\b40\b/.test(document.querySelector("header")?.innerText || ""), null, { timeout: 120000 }).catch(() => console.log("credits not shown in header"));
      await shot(page, "13-topup-done");
      console.log("header:", (await page.locator("header").first().innerText()).replace(/\s+/g, " ").slice(0, 120));
    }
    if (steps.includes("tour")) {
      for (const p of (process.env.PAGES || "/app").split(",")) {
        const t = Date.now();
        await page.goto(BASE + p, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("load").catch(() => {});
        await sleep(600);
        console.log(p, Date.now() - t, "ms");
        await shot(page, "tour" + p.replace(/[^a-z0-9]+/gi, "-"));
        console.log("  h1:", (await page.locator("h1").first().textContent().catch(() => "")) || "", "| links:", (await page.locator("main a").count()));
      }
    }
  } catch (e) {
    console.log("FAILED:", e.message.split("\n")[0]);
    await shot(page, "failure").catch(() => {});
  }
  console.log("browser errors:", errors.length ? errors.slice(0, 8) : "none");
  await browser.close();
}
main();



