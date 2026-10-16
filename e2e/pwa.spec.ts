import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";

// Chromium's own installability check (what Lighthouse's "installable" audit
// used). Needs a persistent (non-incognito) profile: Chromium never offers
// installs in incognito.
test("PWA is installable and has iOS home-screen tags", async ({ baseURL }) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cc-tracker-pwa-"));
  const context = await chromium.launchPersistentContext(profile, {
    baseURL,
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("crossorigin", "use-credentials");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);
    await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]').first()).toHaveAttribute("content", "yes");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);

    const cdp = await context.newCDPSession(page);
    // The manifest is fetched asynchronously after load.
    await expect
      .poll(async () => (await cdp.send("Page.getAppManifest")).errors?.length ?? -1, { timeout: 15_000 })
      .toBe(0);
    await expect
      .poll(async () => (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors, { timeout: 15_000 })
      .toEqual([]);

    const res = await page.request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const html = await page.request.get("/");
    // Pages are dynamic and never cached, so a deploy shows up on the next open.
    expect(html.headers()["cache-control"]).toMatch(/no-store|no-cache|max-age=0/);
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
