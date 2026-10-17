import { expect, test } from "@playwright/test";
import { importDemo, sheet } from "./helpers";

// Wallet (docs/SPEC-v4-wallet.md, docs/SPEC-v5-app-pass.md §4 desktop). Demo seed only; assertions don't depend on today's date.
const LYFT = "Demo Reserve: $10 Lyft in-app credit left";

test("desktop: select a card in the stack by click and by keyboard; the URL and Back follow", async ({ page }) => {
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

  // Deep link: on desktop /cards/<id> renders the same two-column Wallet with that card selected.
  await page.goto("/cards/demo-autograph");
  await expect(page.getByTestId("wallet-card-demo-autograph")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { level: 1, name: "Demo Autograph" })).toBeVisible();
  await page.getByTestId("wallet-card-demo-reserve").click();
  await expect(page).toHaveURL(/\/cards\/demo-reserve$/);
});

test("desktop: log a partial credit in the credit sheet (note, history, delete); Up next Log opens the same sheet", async ({ page }) => {
  await importDemo(page);
  await page.goto("/?card=demo-reserve");
  // The right pane is the Card page: stat strip, credit rows, drill-in rows.
  await expect(page.getByTestId("stat-strip")).toBeVisible();
  await page.getByRole("button", { name: "Lyft in-app credit", exact: true }).click();
  const s = sheet(page);
  await expect(s).toBeVisible();
  await expect(s.getByRole("radio", { name: "$10" })).toHaveAttribute("aria-checked", "true"); // remaining, pre-selected
  await expect(s.getByRole("button", { name: "Log $10" })).toBeVisible();
  await s.getByRole("radio", { name: "Other" }).click();
  const amount = s.getByLabel("Amount (USD)");
  await expect(amount).toBeFocused();
  await amount.fill("2.5");
  await s.getByLabel("Note").fill("Demo ride");
  await s.getByRole("button", { name: "Log $2.50" }).click();
  await expect(s.getByTestId("sheet-left")).toHaveText("$7.50");
  const history = s.getByRole("list", { name: "Uses this period" });
  await expect(history).toContainText("$2.50");
  await expect(history).toContainText("Demo ride");
  await expect(page.getByTestId("roi-panel")).toHaveText("$102.50");
  await history.getByRole("button", { name: /Delete use/ }).click();
  await expect(s.getByTestId("sheet-left")).toHaveText("$10");
  await page.keyboard.press("Escape");
  await expect(s).toHaveCount(0);

  // The Up next strip's "Log" opens the credit sheet for that item.
  await page.getByTestId("wallet-card-demo-flex").click();
  await page.getByTestId("up-next-strip").getByRole("button", { name: `Log — ${LYFT}` }).click();
  await expect(s.getByRole("heading", { name: "Lyft" })).toBeVisible();
  await expect(s.getByRole("button", { name: "Log $10" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Drill-in rows open sheets with what v4 showed inline: protections' key terms, Edit card.
  await page.getByTestId("wallet-card-demo-reserve").click();
  await page.getByTestId("drill-protections").click();
  await s.getByRole("button", { name: /^Purchase protection/ }).click();
  await expect(s).toContainText("How to claim");
  await s.getByRole("button", { name: "‹ Protections & insurance" }).click();
  await expect(s.getByRole("heading", { name: "Protections & insurance" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(s.getByLabel("Payment due day")).toHaveValue("20");
});

test("desktop: an Up next item's action works in place", async ({ page }) => {
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

  // Same list on the Up next screen; hovering a row reveals Skip and its action (desktop).
  await page.goto("/up-next");
  const list = page.getByTestId("attention-list");
  await expect(list.getByRole("button", { name: "Demo Flex: Payment past due", exact: true })).toHaveCount(before - 1);
  const autograph = list.getByRole("button", { name: "Demo Autograph: Payment past due", exact: true }).first();
  const paid = list.getByRole("button", { name: "Mark paid — Demo Autograph: Payment past due" }).first();
  await page.mouse.move(0, 0);
  await expect(paid.locator("..")).toHaveCSS("opacity", "0");
  await autograph.hover();
  await expect(paid.locator("..")).toHaveCSS("opacity", "1");
  // A credit row opens its sheet, ready to log.
  await list.getByRole("button", { name: LYFT, exact: true }).click();
  await expect(sheet(page).getByRole("radio", { name: "$10" })).toHaveAttribute("aria-checked", "true");
});

test("phone layout at 390px: bottom tabs, large titles, no horizontal scroll", async ({ page }) => {
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
  // Wallet on phones: large title + 5/24 pill, the top 3 Up next rows, then the stack. No card detail here.
  await expect(page.getByRole("heading", { level: 1, name: "Wallet" })).toBeVisible();
  await expect(page.getByTestId("five24-pill")).toHaveText("3/24");
  await expect(page.getByTestId("wallet-status")).toBeHidden(); // the long mono header line is desktop-only
  const top = page.getByTestId("up-next-top");
  await expect(top.getByTestId("up-next-item")).toHaveCount(3);
  await expect(top.getByRole("link", { name: /^All \d+ →$/ })).toBeVisible();
  const y = async (id: string) => (await page.getByTestId(id).boundingBox())!.y;
  expect(await y("up-next-top")).toBeLessThan(await y("wallet-stack"));
  await expect(page.getByTestId("card-detail")).toBeHidden();
  await expect(page.getByTestId("up-next-strip")).toBeHidden();

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
  await expect(page.getByRole("heading", { level: 1, name: "5/24" })).toBeVisible();
  await tabs.getByRole("link", { name: "Up next" }).click();
  await expect(page.getByTestId("attention-list")).toBeVisible();
  // No intro paragraph on Up next.
  await expect(page.getByText(/Soonest first/)).toHaveCount(0);
  expect(await overflow()).toBeLessThanOrEqual(0);
});
