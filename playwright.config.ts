import { defineConfig } from "@playwright/test";

// Optional smoke test: `npm run test:e2e`. Runs against a throwaway DB.
// Set E2E_BASE_URL to test an already running server instead, e.g. the
// Workers build from `npm run preview` (http://localhost:8787). Build that server with
// CATALOG_DIR pointing at the output of `tsx scripts/e2e-catalog.ts <dir>`, or e2e/v9.spec.ts fails.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // The specs share one database and each imports the demo seed, so run them one at a time.
  workers: 1,
  use: {
    baseURL: external ?? "http://localhost:3100",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: external
    ? undefined
    : {
        command: "npx tsx scripts/e2e-catalog.ts .e2e-catalog && npm run db:setup && npx next dev -p 3100",
        url: "http://localhost:3100",
        timeout: 120_000,
        reuseExistingServer: false,
        // A copy of catalog/ with a made-up feed, so the Deals page has something to show (e2e/feedFixture.ts).
        env: { DATABASE_URL: "file:./e2e-smoke.db", CATALOG_DIR: ".e2e-catalog" },
      },
});
