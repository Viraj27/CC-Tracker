import path from "node:path";
import { expect, type Page } from "@playwright/test";

/** Replace all data with examples/demo-seed.json (fake demo data). */
export async function importDemo(page: Page) {
  await page.goto("/settings");
  await page.getByLabel("Replace all my data").check();
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Import JSON file").setInputFiles(path.join(__dirname, "..", "examples", "demo-seed.json"));
  await expect(page.getByRole("status")).toContainText("Imported 5 card(s)");
}

/** Navigate and wait until the client has loaded its data and rendered the page heading. */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
