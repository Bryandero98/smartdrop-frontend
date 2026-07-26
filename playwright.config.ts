import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      // Routed to a same-origin path so table-accessibility.spec.ts can
      // serve deterministic leaderboard data via page.route() instead of
      // mocking the Soroban RPC/event-scan path the app falls back to
      // when this is unset.
      NEXT_PUBLIC_LEADERBOARD_API_URL:
        "http://localhost:3000/__mock-leaderboard-api",
    },
  },
});
