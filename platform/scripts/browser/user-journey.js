/**
 * End-to-end USER JOURNEY test: signup → org setup → brand → content → tracking.
 * Runs against localhost:3400 with a throwaway account; screenshots every step.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3400";
const OUT = path.resolve(__dirname, "journey");
fs.mkdirSync(OUT, { recursive: true });

const stamp = Date.now();
const EMAIL = `journey.tester+${stamp}@example.com`;
const PASSWORD = "Journey#2026-Test";
const ORG = `Journey Org ${stamp}`;
const BRAND = "Safari Coffee";
const BRAND_TAGLINE = "Kenyan specialty coffee, roasted daily";

let step = 0;
async function shot(page, name) {
  step++;
  const p = path.join(OUT, `${String(step).padStart(2, "0")}_${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`📸 ${step}. ${name} — ${page.url()}`);
}

async function expectText(page, text, label, timeout = 15000) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
    console.log(`   ✓ ${label}`);
    return true;
  } catch {
    console.log(`   ✗ MISSING: ${label} (text "${text}" not found)`);
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const failures = [];

  // ── STEP 1: Landing page ──
  await page.goto(BASE, { waitUntil: "networkidle" });
  await shot(page, "landing");
  const signupLink = page.getByRole("link", { name: /sign\s?up|get started|create account/i }).first();
  if (await signupLink.count()) {
    await signupLink.click();
  } else {
    await page.goto(`${BASE}/signup`);
  }
  await page.waitForLoadState("networkidle");

  // ── STEP 2: Signup form ──
  await shot(page, "signup");
  const nameField = page.locator("input[name='name'], input[name='fullName']").first();
  if (await nameField.count()) await nameField.fill("Journey Tester");
  await page.locator("input[name='email'], input[type='email']").first().fill(EMAIL);
  await page.locator("input[name='password'], input[type='password']").first().fill(PASSWORD);
  await shot(page, "signup-filled");
  await page.getByRole("button", { name: /create|sign\s?up|register/i }).first().click();
  await page.waitForLoadState("networkidle");
  await shot(page, "after-signup");
  console.log("Email:", EMAIL);

  // may need email verification — check state
  const url = page.url();
  if (/verify|confirm/i.test(url)) {
    console.log("   ⚠ Email verification required — cannot proceed headless. URL:", url);
    await shot(page, "verification-gate");
    failures.push("Email verification gate blocks headless journey — needs test bypass or seeded verified account");
  }

  // ── STEP 3: Onboarding / org setup ──
  if (/setup|onboard/i.test(page.url())) {
    await shot(page, "onboarding");
    const orgField = page.locator("input[name='organization'], input[name='org'], input[name='organizationName']").first();
    if (await orgField.count()) {
      await orgField.fill(ORG);
      await page.getByRole("button", { name: /continue|create|next|save/i }).first().click();
      await page.waitForLoadState("networkidle");
    }
  }
  await shot(page, "post-onboarding");

  // ── STEP 4: Dashboard / home ──
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await shot(page, "dashboard");
  await expectText(page, /what you can do|start something|dashboard|welcome/i, "Dashboard content");

  // ── STEP 5: Create a brand ──
  await page.goto(`${BASE}/app/brands`, { waitUntil: "networkidle" });
  await shot(page, "brands-empty");
  const createBrand = page.getByRole("button", { name: /new brand|create brand|add brand|\+ ?brand/i }).first();
  if (await createBrand.count()) {
    await createBrand.click();
    await page.waitForLoadState("networkidle");
    await shot(page, "brand-form");
    const nameF = page.locator("input[name='name']").first();
    if (await nameF.count()) await nameF.fill(BRAND);
    const tagF = page.locator("input[name='tagline']").first();
    if (await tagF.count()) await tagF.fill(BRAND_TAGLINE);
    const slugF = page.locator("input[name='slug']").first();
    if (await slugF.count()) await slugF.fill("safari-coffee");
    await shot(page, "brand-filled");
    const save = page.getByRole("button", { name: /save|create|submit/i }).first();
    if (await save.count()) {
      await save.click();
      await page.waitForLoadState("networkidle");
    }
    await shot(page, "brand-created");
    const brandOk = await page.getByText(BRAND).first().isVisible().catch(() => false);
    console.log(brandOk ? `   ✓ Brand "${BRAND}" created and visible` : `   ✗ Brand "${BRAND}" NOT visible after save`);
    if (!brandOk) failures.push("Brand creation: brand not visible after save");
  } else {
    console.log("   ⚠ No create-brand button found on /app/brands");
    failures.push("Brand creation: no create-brand CTA found");
  }

  // ── STEP 6: Studio — content generation flow ──
  await page.goto(`${BASE}/content`, { waitUntil: "networkidle" });
  await shot(page, "studio");
  const promptBox = page.locator("textarea").first();
  if (await promptBox.count()) {
    await promptBox.fill("A bold Instagram poster for Safari Coffee: rich espresso pour, warm brown tones, morning light, Kenyan coffee farm backdrop");
    await shot(page, "studio-prompt-filled");
    const genBtn = page.getByRole("button", { name: /generate|create|make/i }).first();
    if (await genBtn.count()) {
      // don't actually fire a paid generation; just verify the button is enabled
      const disabled = await genBtn.isDisabled();
      console.log(disabled ? "   ⚠ Generate button disabled (credits/plan?)" : "   ✓ Generate button active");
      await shot(page, "studio-ready-to-generate");
    }
  } else {
    failures.push("Studio: no prompt textarea found");
  }

  // ── STEP 7: Library / assets ──
  await page.goto(`${BASE}/content/assets`, { waitUntil: "networkidle" });
  await shot(page, "library");

  // ── STEP 8: Campaigns & tracking ──
  await page.goto(`${BASE}/app/campaigns`, { waitUntil: "networkidle" });
  await shot(page, "campaigns");
  const newCampaign = page.getByRole("button", { name: /new campaign|create campaign/i }).first();
  console.log((await newCampaign.count()) ? "   ✓ Campaign creation available" : "   ⚠ No create-campaign CTA");

  // ── STEP 9: Social channels ──
  await page.goto(`${BASE}/app/social`, { waitUntil: "networkidle" });
  await shot(page, "social");

  // ── STEP 10: Billing ──
  await page.goto(`${BASE}/billing`, { waitUntil: "networkidle" });
  await shot(page, "billing");

  // ── STEP 11: Settings & security (2FA setup) ──
  await page.goto(`${BASE}/security`, { waitUntil: "networkidle" });
  await shot(page, "security-2fa");

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await shot(page, "settings");

  // ── STEP 12: Sign out ──
  const signout = page.getByRole("button", { name: /sign out|log ?out/i }).first();
  if (await signout.count()) {
    await signout.click();
    await page.waitForLoadState("networkidle");
    await shot(page, "signed-out");
  }

  console.log("\n════════════════════════════════════════");
  console.log("JOURNEY RESULT:", failures.length === 0 ? "PASS ✅" : `${failures.length} ISSUE(S) ❌`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  console.log("Screenshots:", OUT);
  fs.writeFileSync(path.join(OUT, "journey-failures.json"), JSON.stringify({ email: EMAIL, failures }, null, 2));

  await browser.close();
})().catch((e) => { console.error("JOURNEY CRASHED:", e.message); process.exit(1); });
