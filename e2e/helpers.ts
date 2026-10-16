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
