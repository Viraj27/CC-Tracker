import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { importDemo, sheet } from "./helpers";

// Uses examples/demo-seed.json (fake demo data).
test("import demo seed, log a partial credit, everything updates without reload", async ({ page }) => {
  await importDemo(page);

  await page.getByRole("link", { name: "Wallet" }).click();
  await expect(page.getByTestId("five24-count")).toHaveText("3/24"); // Demo Reserve, Venture X, store card; Demo Flex (2024-06) has dropped off
  const strip = page.getByTestId("up-next-strip");
  await expect(strip.getByRole("button", { name: "Demo Reserve: $10 Lyft in-app credit left", exact: true })).toBeVisible();

  // Mark navigation so we can prove no full reload happens.
  await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));

  await page.getByTestId("wallet-card-demo-reserve").click();
  await page.getByRole("button", { name: "Lyft in-app credit", exact: true }).click();
  await sheet(page).getByText("More options").click();
  await sheet(page).getByLabel("Amount (USD)").fill("4");
  await sheet(page).getByRole("button", { name: "Log $4" }).click();
  await expect(sheet(page).getByTestId("sheet-left")).toHaveText("$6");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("remaining-lyft-credit")).toHaveText("$6");
  await expect(page.getByTestId("roi-panel")).toHaveText("$104"); // seed has a $100 travel use this AF year
  await expect(strip.getByRole("button", { name: "Demo Reserve: $6 Lyft in-app credit left", exact: true })).toBeVisible();

  // Other screens see the change too, still without a reload.
  await page.getByRole("link", { name: "Up next" }).first().click();
  await expect(page.getByTestId("attention-list").getByRole("button", { name: "Demo Reserve: $6 Lyft in-app credit left", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);
});

const PAGES = ["/", "/cards/demo-reserve", "/up-next", "/cards", "/eligibility", "/payments", "/rotating", "/best-card", "/points", "/settings", "/more"];

for (const width of [375, 390, 430]) {
  test(`pages render at ${width}px without horizontal scroll`, async ({ page }) => {
    await importDemo(page);
    await page.setViewportSize({ width, height: 800 });
    for (const p of PAGES) {
      await page.goto(p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, p).toBeLessThanOrEqual(0);
    }
  });
}

// Export is how data moves from the Mac to the hosted app (docs/DEPLOY.md).
test("export then merge-import the same file is a no-op", async ({ page }) => {
  await importDemo(page);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const file = await (await download).path();
  const exported = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(exported.format).toBe("cc-tracker-export");
  expect(exported.holdings).toHaveLength(5);

  await page.getByLabel("Merge").check();
  await page.getByLabel("Import JSON file").setInputFiles(file);
  await expect(page.getByRole("status")).toContainText("Imported 5 card(s)");
  await expect(page.getByRole("status")).toContainText("(merge)");
  await page.getByRole("link", { name: "Wallet" }).click();
  await expect(page.getByTestId("five24-count")).toHaveText("3/24");
});

test("empty wallet shows Get started", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Replace all my data").check();
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Import JSON file").setInputFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ holdings: [] })),
  });
  await expect(page.getByRole("status")).toContainText("Imported 0 card(s)");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your wallet is empty" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Import", exact: true })).toHaveAttribute("href", "/settings#import");
});
