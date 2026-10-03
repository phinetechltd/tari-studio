import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: `${__dirname}`,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3400",
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
