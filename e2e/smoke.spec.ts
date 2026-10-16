import path from "node:path";
import { expect, test } from "@playwright/test";

// Uses examples/demo-seed.json (fake demo data).
test("import demo seed, log a partial credit, everything updates without reload", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Replace all my data").check();
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Import JSON file").setInputFiles(path.join(__dirname, "..", "examples", "demo-seed.json"));
  await expect(page.getByRole("status")).toContainText("Imported 3 card(s)");

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByTestId("five24-count")).toHaveText("2/24"); // Demo Reserve + demo store card; Demo Flex (2024-06) has dropped off
  const attention = page.getByTestId("attention-list");
  await expect(attention).toContainText("$10 Lyft in-app credit left");

  // Mark navigation so we can prove no full reload happens.
  await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));

  await page.getByTestId("card-tile-demo-reserve").click();
  const row = page.locator("#benefit-lyft-credit");
  await row.getByRole("button", { name: "Log use" }).click();
  await row.getByLabel("Amount (USD)").fill("4");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("remaining-lyft-credit")).toContainText("$6.00 remaining");
  await expect(page.getByTestId("roi-panel")).toContainText("$104.00 realized"); // seed has a $100 travel use this AF year

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByTestId("card-tile-demo-reserve").getByTestId("roi")).toHaveText("$104");
  await expect(attention).toContainText("$6 Lyft in-app credit left");
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);
});

test("pages render at 375px without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const p of ["/", "/cards", "/eligibility", "/payments", "/rotating", "/best-card", "/points", "/settings"]) {
    await page.goto(p);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, p).toBeLessThanOrEqual(0);
  }
});
