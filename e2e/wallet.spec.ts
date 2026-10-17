import { expect, test } from "@playwright/test";
import { importDemo } from "./helpers";

// Wallet (docs/SPEC-v4-wallet.md). Demo seed only; assertions don't depend on today's date.

test("select a card in the stack by click and by keyboard; the URL and Back follow", async ({ page }) => {
  await importDemo(page);
  await page.goto("/");
  const stack = page.getByTestId("wallet-stack");
  const pressed = stack.locator('button[aria-pressed="true"]');
  await expect(pressed).toHaveCount(1);

  // Click a collapsed strip: it becomes the selected (first, full-height) card.
  await page.getByTestId("wallet-card-demo-venture-x").click();
  await expect(page.getByTestId("wallet-card-demo-venture-x")).toHaveAttribute("aria-pressed", "true");
  await expect(stack.locator("button").first()).toHaveAttribute("data-testid", "wallet-card-demo-venture-x");
  await expect(page).toHaveURL(/\?card=demo-venture-x$/);
  await expect(page.getByRole("heading", { level: 1, name: "Demo Venture X" })).toBeVisible();
  await expect(page.getByTestId("card-detail")).toContainText("Capital One Venture X");

  // Arrow keys move the selection and keep focus on the selected card.
  await page.getByTestId("wallet-card-demo-venture-x").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("wallet-card-demo-venture-x")).toHaveAttribute("aria-pressed", "false");
  const next = await pressed.getAttribute("data-testid");
  expect(next).not.toBe("wallet-card-demo-venture-x");
  await expect(pressed).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`\\?card=${next!.replace("wallet-card-", "")}$`));
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("wallet-card-demo-venture-x")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("wallet-card-demo-venture-x")).toBeFocused();

  // Back returns to the previous selection.
  await page.goBack();
  await expect(page.getByTestId(next!)).toHaveAttribute("aria-pressed", "true");

  // Deep link: /cards/<id> renders the same Wallet with that card selected.
  await page.goto("/cards/demo-autograph");
  await expect(page.getByTestId("wallet-card-demo-autograph")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { level: 1, name: "Demo Autograph" })).toBeVisible();
  await page.getByTestId("wallet-card-demo-reserve").click();
  await expect(page).toHaveURL(/\/cards\/demo-reserve$/);
});

test("log a partial credit from the Wallet detail (note, date, history, delete)", async ({ page }) => {
  await importDemo(page);
  await page.goto("/?card=demo-reserve");
  const row = page.locator("#benefit-lyft-credit");
  await row.getByRole("button", { name: "Log Lyft in-app credit" }).click();
  const amount = row.getByLabel("Amount (USD)");
  await expect(amount).toHaveValue("10"); // defaults to what's left
  await amount.fill("2.5");
  await row.getByLabel("Note").fill("Demo ride");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("remaining-lyft-credit")).toContainText("$7.50");
  const history = row.getByRole("list", { name: "Uses this period" });
  await expect(history).toContainText("$2.50");
  await expect(history).toContainText("Demo ride");
  await expect(page.getByTestId("roi-panel")).toHaveText("$102.50");

  await history.getByRole("button", { name: /Delete use/ }).click();
  await expect(page.getByTestId("remaining-lyft-credit")).toContainText("$10.00");

  // The Up next "Log" opens the same form for that credit, on the selected card.
  await page.getByTestId("wallet-card-demo-flex").click();
  await page.getByTestId("up-next-strip").getByRole("button", { name: "Log — Demo Reserve: $10 Lyft in-app credit left" }).click();
  await expect(page.getByTestId("wallet-card-demo-reserve")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#benefit-lyft-credit").getByLabel("Amount (USD)")).toBeVisible();

  // Long sections are disclosures reachable in place: protections, AF history, edit.
  await page.getByText("Protections & insurance").click();
  await expect(page.locator("#protections")).toHaveAttribute("open", "");
  await expect(page.locator("#protections")).toContainText("How to claim");
  await page.getByRole("link", { name: "Edit card →" }).click();
  await expect(page.locator("#edit")).toHaveAttribute("open", "");
  await expect(page.locator("#edit").getByLabel("Payment due day")).toHaveValue("20");
});

test("an Up next item's action works in place", async ({ page }) => {
  await importDemo(page);
  await page.goto("/");
  const strip = page.getByTestId("up-next-strip");
  // Demo Flex (due day 5, opened 2024) always has unpaid statements from earlier months.
  const markPaid = strip.getByRole("button", { name: "Mark paid — Demo Flex: Payment past due" });
  await expect(markPaid.first()).toBeVisible();
  const before = await markPaid.count();
  expect(before).toBeGreaterThan(0);
  await markPaid.first().click();
  await expect(markPaid).toHaveCount(before - 1);

  // Same list and action on the full Up next screen.
  await page.goto("/up-next");
  const list = page.getByTestId("attention-list");
  await expect(list.getByRole("button", { name: "Mark paid — Demo Flex: Payment past due" })).toHaveCount(before - 1);
  // A credit's "Log" opens the Wallet on that card with the log form ready.
  await list.getByRole("link", { name: "Log — Demo Reserve: $10 Lyft in-app credit left" }).click();
  await expect(page).toHaveURL(/\/\?card=demo-reserve&log=lyft-credit#benefit-lyft-credit$/);
  await expect(page.getByTestId("wallet-card-demo-reserve")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#benefit-lyft-credit").getByLabel("Amount (USD)")).toHaveValue("10");
});

test("phone layout at 390px: bottom tabs, no horizontal scroll", async ({ page }) => {
  await importDemo(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tabs = page.getByTestId("tab-bar");
  await expect(tabs).toBeVisible();
  for (const name of ["Wallet", "Up next", "5/24", "More"]) await expect(tabs.getByRole("link", { name })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Wallet" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  // The tab bar sits at the bottom of the viewport.
  const box = (await tabs.boundingBox())!;
  expect(box.y + box.height).toBeCloseTo(844, 0);

  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  // Order on phones: Up next strip, then the stack, then the detail.
  const y = async (id: string) => {
    await expect(page.getByTestId(id)).toBeVisible();
    return (await page.getByTestId(id).boundingBox())!.y;
  };
  expect(await y("up-next-strip")).toBeLessThan(await y("wallet-stack"));
  expect(await y("wallet-stack")).toBeLessThan(await y("card-detail"));

  await tabs.getByRole("link", { name: "More" }).click();
  await expect(page).toHaveURL(/\/more$/);
  for (const name of ["Payments", "Rotating 5%", "Best card", "Points", "Settings", "Add card"]) {
    await expect(page.getByRole("main").getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await page.getByRole("main").getByRole("link", { name: /^Payments/ }).click();
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "More" })).toHaveAttribute("aria-current", "page");
  expect(await overflow()).toBeLessThanOrEqual(0);

  await tabs.getByRole("link", { name: "5/24" }).click();
  await expect(page.getByRole("heading", { name: "5/24 & eligibility" })).toBeVisible();
  await tabs.getByRole("link", { name: "Up next" }).click();
  await expect(page.getByTestId("attention-list")).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});
