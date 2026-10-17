import { expect, test } from "@playwright/test";
import { importDemo, mouseSwipeLeft, sheet, sheetSettled, touchSwipeLeft } from "./helpers";

// v5 "App pass" (docs/SPEC-v5-app-pass.md §5): phone-first, with touch input. Demo seed only.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const LYFT = "Demo Reserve: $10 Lyft in-app credit left";
const overflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("open a card page from the stack and go back", async ({ page }) => {
  await importDemo(page);
  await page.goto("/");
  await page.getByTestId("wallet-card-demo-venture-x").click();
  await expect(page).toHaveURL(/\/cards\/demo-venture-x$/);
  await expect(page.getByRole("heading", { level: 1, name: "Demo Venture X" })).toBeVisible();
  // A pushed screen: nav bar, banner, stat strip; no stack, no Up next.
  await expect(page.getByTestId("wallet-stack")).toBeHidden();
  await expect(page.getByTestId("stat-strip")).toBeVisible();
  await expect(page.getByTestId("card-headline")).toBeVisible();
  for (const row of ["perks", "protections", "earn", "downgrade", "fees", "lifecycle"]) await expect(page.getByTestId(`drill-${row}`)).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: "‹ Wallet" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("wallet-stack")).toBeVisible();

  // A deep link with no in-app history still has a way back.
  await page.goto("/cards/demo-reserve");
  await page.getByRole("link", { name: "‹ Wallet" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("credit sheet: log a partial amount with a note; dismiss by Esc, backdrop and drag", async ({ page }) => {
  await importDemo(page);
  await page.goto("/cards/demo-reserve");
  const row = page.getByRole("button", { name: "Lyft in-app credit", exact: true });
  await row.click();
  const s = sheet(page);
  await expect(s.getByRole("heading", { name: "Lyft" })).toBeVisible();
  await expect(s.getByTestId("sheet-left")).toHaveText("$10");
  // Chips: $5, remaining ($10, pre-selected), Other. The primary pill is at least 50px.
  await expect(s.getByRole("radio", { name: "$5" })).toHaveAttribute("aria-checked", "false");
  await expect(s.getByRole("radio", { name: "$10" })).toHaveAttribute("aria-checked", "true");
  const log = s.getByRole("button", { name: "Log $10" });
  expect((await log.boundingBox())!.height).toBeGreaterThanOrEqual(50);
  await s.getByRole("radio", { name: "$5" }).click();
  await expect(s.getByRole("button", { name: "Log $5" })).toBeVisible();

  // Partial use with a note, under More options.
  await s.getByText("More options").click();
  await s.getByLabel("Amount (USD)").fill("3.25");
  await s.getByLabel("Note").fill("Demo ride");
  await expect(s.getByLabel("Date")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await s.getByRole("button", { name: "Log $3.25" }).click();
  await expect(s.getByTestId("sheet-left")).toHaveText("$6.75");
  await expect(s.getByRole("list", { name: "Uses this period" })).toContainText("Demo ride");
  await expect(page.getByTestId("remaining-lyft-credit")).toHaveText("$6.75");

  // Esc closes and returns focus to the row that opened it.
  await page.keyboard.press("Escape");
  await expect(s).toHaveCount(0);
  await expect(row).toBeFocused();

  // Tap on the backdrop closes it.
  await row.click();
  await expect(s).toBeVisible();
  await page.mouse.click(195, 20);
  await expect(s).toHaveCount(0);

  // Drag the grabber down closes it.
  await row.click();
  await sheetSettled(page);
  const grab = (await s.getByTestId("sheet-grabber").boundingBox())!;
  await page.mouse.move(195, grab.y + 6);
  await page.mouse.down();
  await page.mouse.move(195, grab.y + 100, { steps: 5 });
  await page.mouse.move(195, grab.y + 260, { steps: 5 });
  await page.mouse.up();
  await expect(s).toHaveCount(0);
});

test("Up next: swipe left with touch reveals Skip; one row open at a time; Skip hides the item", async ({ page }) => {
  await importDemo(page);
  await page.goto("/up-next");
  await expect(page.getByText(/Soonest first/)).toHaveCount(0); // intro paragraph removed
  const list = page.getByTestId("attention-list");
  const due = list.getByTestId("up-next-item").filter({ has: page.getByRole("button", { name: "Demo Reserve: Payment due", exact: true }) });
  const skip = due.getByRole("button", { name: "Skip — Demo Reserve: Payment due" });
  // Actions sit under the row, transparent, until it is swiped.
  await expect(skip.locator("..")).toHaveCSS("opacity", "0");
  await touchSwipeLeft(page, due.getByTestId("up-next-row"));
  await expect(due).toHaveAttribute("data-open", "true");
  await expect(skip.locator("..")).toHaveCSS("opacity", "1");
  await expect(skip).toBeInViewport();
  await expect(due.getByRole("button", { name: "Mark paid — Demo Reserve: Payment due" })).toBeVisible();

  // Swiping another row closes the first.
  const lyft = list.getByTestId("up-next-item").filter({ has: page.getByRole("button", { name: LYFT, exact: true }) });
  await touchSwipeLeft(page, lyft.getByTestId("up-next-row"));
  await expect(lyft).toHaveAttribute("data-open", "true");
  await expect(due).not.toHaveAttribute("data-open", "true");

  // A credit's Skip offers this month / stop reminding me (v4.1).
  await lyft.getByRole("button", { name: `Skip — ${LYFT}` }).tap();
  await expect(page.getByRole("button", { name: `Skip this month — ${LYFT}` })).toBeFocused();
  await page.getByRole("button", { name: `Skip this month — ${LYFT}` }).tap();
  await expect(list.getByRole("button", { name: LYFT, exact: true })).toHaveCount(0);
  await expect(page.getByTestId("show-skipped")).toHaveText(/^1 skipped · show$/i);

  // A payment skips in one tap and stays unpaid.
  await touchSwipeLeft(page, due.getByTestId("up-next-row"));
  await skip.tap();
  await expect(list.getByRole("button", { name: "Demo Reserve: Payment due", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("show-skipped")).toHaveText(/^2 skipped · show$/i);
  await page.getByTestId("show-skipped").tap();
  await expect(page.getByTestId("skipped-item")).toHaveCount(2);

  // Mouse drag works too (snaps open past half way).
  const row = list.getByTestId("up-next-item").first();
  await mouseSwipeLeft(page, row.getByTestId("up-next-row"));
  await expect(row).toHaveAttribute("data-open", "true");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("Up next: keyboard and tap alternatives to swiping", async ({ page }) => {
  await importDemo(page);
  await page.goto("/up-next");
  const list = page.getByTestId("attention-list");
  const name = "Demo Reserve: Payment due";
  const item = list.getByTestId("up-next-item").filter({ has: page.getByRole("button", { name, exact: true }) });

  // Keyboard: focusing the row exposes its actions, next in the tab order.
  const row = item.getByRole("button", { name, exact: true });
  // Tab from the top of the list until the row has keyboard focus (rows, then their revealed actions, are in the tab order).
  await page.getByTestId("tab-bar").getByRole("link", { name: "More" }).focus();
  for (let i = 0; i < 30 && !(await row.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(row).toBeFocused();
  const skip = item.getByRole("button", { name: `Skip — ${name}` });
  await expect(skip.locator("..")).toHaveCSS("opacity", "1");
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await expect(item).toHaveAttribute("data-open", "true");
  await page.keyboard.press("Tab");
  await expect(item.getByRole("button", { name: `Mark paid — ${name}` })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(list.getByRole("button", { name, exact: true })).toHaveCount(0);

  // Tap: the row opens its sheet, with the same actions.
  await page.getByTestId("show-skipped").click();
  await page.getByRole("button", { name: `Unskip — ${name}` }).click();
  await list.getByRole("button", { name, exact: true }).tap();
  const s = sheet(page);
  await expect(s.getByRole("heading", { name: "Payment due" })).toBeVisible();
  await expect(s.getByRole("button", { name: `Mark paid — ${name}` })).toBeVisible();
  // Payments can only be skipped, never muted.
  await expect(s.getByRole("button", { name: /^Stop reminding me/ })).toHaveCount(0);
  await s.getByRole("button", { name: `Skip this one — ${name}` }).tap();
  await expect(s).toHaveCount(0);
  await expect(list.getByRole("button", { name, exact: true })).toHaveCount(0);

  // A credit's sheet offers Skip this month and Stop reminding me.
  await list.getByRole("button", { name: LYFT, exact: true }).tap();
  await expect(s.getByRole("button", { name: `Skip this month — ${LYFT}` })).toBeVisible();
  await s.getByRole("button", { name: `Stop reminding me — ${LYFT}` }).tap();
  await expect(list.getByRole("button", { name: LYFT, exact: true })).toHaveCount(0);
});

test("ⓘ reveals the source; Unverified and Community badges are visible without tapping", async ({ page }) => {
  await importDemo(page);
  await page.goto("/cards/demo-reserve");
  // Community-curated downgrade paths: badge on the drill-in row, no tap needed.
  await expect(page.getByTestId("drill-downgrade").getByText("Community curated")).toBeVisible();

  await page.getByRole("button", { name: "Lyft in-app credit", exact: true }).click();
  const s = sheet(page);
  const info = s.getByRole("button", { name: "Source" });
  await expect(info).toHaveAttribute("aria-expanded", "false");
  await expect(s.getByRole("link", { name: "Source" })).toBeHidden();
  expect((await info.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  await info.tap();
  await expect(info).toHaveAttribute("aria-expanded", "true");
  await expect(s.getByRole("link", { name: "Source" })).toHaveAttribute("href", /^https:\/\//);
  await expect(s.getByTestId("provenance-detail")).toContainText(/checked \d{1,2} [A-Z]{3}/);
  await page.keyboard.press("Escape");

  await page.getByTestId("drill-downgrade").click();
  await expect(s.getByText("Community curated").first()).toBeVisible();
  await expect(s.getByRole("link", { name: "Community source" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // ⚠ Unverified (United perk values) and Community (Chase 5/24) stay visible on their screens.
  await page.goto("/settings");
  await expect(page.getByText("⚠︎ Unverified").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Source" })).toHaveCount(0);
  await page.goto("/eligibility");
  await expect(page.getByText("Community curated").first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
