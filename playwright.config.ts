import { defineConfig } from "@playwright/test";

// Optional smoke test: `npm run test:e2e`. Runs against a throwaway DB.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3100",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "npm run db:setup && npx next dev -p 3100",
    url: "http://localhost:3100",
    timeout: 120_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: "file:./e2e-smoke.db" },
  },
});
