import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: `${__dirname}`,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  // Walkthrough specs visit many pages on a cold dev server; the 30 s default timed them out.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:3400",
    navigationTimeout: 60_000,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
