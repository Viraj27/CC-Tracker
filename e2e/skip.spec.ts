import { expect, test } from "@playwright/test";
import { importDemo } from "./helpers";

// Up next Skip / "Don't remind me" (docs/SPEC-v4.1-skip.md). Demo seed only.
const LYFT = "Demo Reserve: $10 Lyft in-app credit left";

test("skip an item: it's gone, the count shows, Show skipped + Unskip bring it back", async ({ page }) => {
  await importDemo(page);
  await page.goto("/");
  const strip = page.getByTestId("up-next-strip");
  await expect(strip.getByRole("button", { name: `Log — ${LYFT}` })).toBeVisible();
  await expect(page.getByTestId("show-skipped")).toHaveCount(0);

  // Skip is a quiet secondary action with a 40px+ target, reachable by keyboard.
  const skip = strip.getByRole("button", { name: `Skip — ${LYFT}` });
  expect((await skip.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await skip.focus();
  await page.keyboard.press("Enter");
  // A credit offers "Skip this month" or "Stop reminding me"; focus moves to the first choice, Escape backs out.
  const thisMonth = strip.getByRole("button", { name: `Skip this month — ${LYFT}` });
  await expect(thisMonth).toBeFocused();
  await expect(strip.getByRole("button", { name: `Stop reminding me — ${LYFT}` })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(skip).toBeFocused();
  await skip.click();
  await thisMonth.click();

  await expect(strip.getByRole("button", { name: `Log — ${LYFT}` })).toHaveCount(0);
  const show = page.getByTestId("show-skipped");
  await expect(show).toHaveText(/^1 skipped · show$/i);
  // Skipping doesn't log a use.
  await page.getByTestId("wallet-card-demo-reserve").click();
  await expect(page.getByTestId("remaining-lyft-credit")).toContainText("$10.00");

  // Stored in the database: still skipped after a reload, and on the Up next screen.
  await page.goto("/up-next");
  await expect(page.getByTestId("attention-list")).not.toContainText(LYFT);
  await page.getByTestId("show-skipped").click();
  const skipped = page.getByTestId("skipped-item");
  await expect(skipped).toHaveCount(1);
  await expect(skipped).toContainText(LYFT);
  await expect(skipped).toContainText("Skipped");

  // Unskip from the Wallet strip.
  await page.goto("/");
  await show.click();
  await expect(show).toHaveAttribute("aria-expanded", "true");
  await strip.getByRole("button", { name: `Unskip — ${LYFT}` }).click();
  await expect(strip.getByRole("button", { name: `Log — ${LYFT}` })).toBeVisible();
  await expect(page.getByTestId("show-skipped")).toHaveCount(0);

  // Payments skip in one tap (no "stop reminding me": they can only be skipped), and stay unpaid.
  const flexPayments = strip.getByRole("button", { name: "Mark paid — Demo Flex: Payment past due" });
  const before = await flexPayments.count();
  expect(before).toBeGreaterThan(0);
  await strip.getByRole("button", { name: "Skip — Demo Flex: Payment past due" }).first().click();
  await expect(flexPayments).toHaveCount(before - 1);
  await expect(page.getByRole("button", { name: /^Stop reminding me — Demo Flex: Payment/ })).toHaveCount(0);
  await page.goto("/payments");
  await expect(page.getByText(/past due/i).first()).toBeVisible();
});

test("stop reminding rotating 5% for a card: no Up next item, still on /rotating, back on from the Wallet detail", async ({ page }) => {
  await importDemo(page);
  await page.goto("/");
  const strip = page.getByTestId("up-next-strip");
  const activate = strip.getByRole("button", { name: /^Activate — Demo Flex: Activate \d{4}-Q\d 5% categories$/ });
  test.skip((await activate.count()) === 0, "the current quarter's Chase calendar isn't announced (or its deadline passed)");
  const label = (await activate.getAttribute("aria-label"))!.replace("Activate — ", "");

  await strip.getByRole("button", { name: `Skip — ${label}` }).click();
  await expect(strip.getByRole("button", { name: /^Skip this quarter — / })).toBeVisible();
  await strip.getByRole("button", { name: `Stop reminding me — ${label}` }).click();
  await expect(activate).toHaveCount(0);
  await expect(page.getByTestId("show-skipped")).toHaveText(/1 skipped/i);
  // Nothing was activated.
  await page.goto("/?card=demo-flex");
  const flexRotating = page.locator("#rotating");
  await expect(flexRotating.getByRole("checkbox").first()).not.toBeChecked();
  const toggle = flexRotating.getByRole("switch", { name: /^Reminders: / });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toHaveText("Reminders off");

  // /rotating still shows the categories, marked reminders off.
  await page.goto("/rotating");
  await expect(page.getByText("Grocery stores (excl. Walmart and Target)").first()).toBeVisible();
  await expect(page.getByText("Reminders off").first()).toBeVisible();
  // Best card still ranks Freedom Flex's 5% groceries, marked reminders off.
  await page.goto("/best-card");
  await page.getByRole("radio", { name: "Groceries" }).click();
  const flex = page.getByTestId("best-card-list").getByRole("listitem").filter({ hasText: "Demo Flex" });
  await expect(flex).toContainText("Reminders off");
  await expect(flex).toContainText(/activate first/);

  // The hidden item says how to undo it, and the Wallet toggle turns reminders back on.
  await page.goto("/up-next");
  await page.getByTestId("show-skipped").click();
  await expect(page.getByTestId("skipped-item")).toContainText("Reminders off");
  await expect(page.getByRole("button", { name: `Turn reminders back on — ${label}` })).toBeVisible();
  await page.goto("/?card=demo-flex");
  await page.locator("#rotating").getByRole("switch", { name: /^Reminders: / }).click();
  await expect(page.locator("#rotating").getByRole("switch", { name: /^Reminders: / })).toHaveAttribute("aria-checked", "true");
  await expect(strip.getByRole("button", { name: `Activate — ${label}` })).toBeVisible();
});

test("per-credit reminders: Wallet row switch and Edit card", async ({ page }) => {
  await importDemo(page);
  await page.goto("/?card=demo-reserve");
  const strip = page.getByTestId("up-next-strip");
  const row = page.locator("#benefit-lyft-credit");
  await row.getByRole("switch", { name: "Reminders: Lyft in-app credit" }).click();
  await expect(strip.getByRole("button", { name: `Log — ${LYFT}` })).toHaveCount(0);
  // The credit itself is untouched and can still be logged.
  await expect(row.getByRole("button", { name: "Log Lyft in-app credit" })).toBeVisible();

  // Edit card shows the same setting and can turn it back on.
  await page.getByRole("link", { name: "Edit card →" }).click();
  const edit = page.getByTestId("edit-reminders");
  const box = edit.getByRole("checkbox", { name: "Remind me: Lyft in-app credit" });
  await expect(box).not.toBeChecked();
  // Payments and annual fees can't be muted.
  await expect(edit.getByRole("checkbox", { name: /payment|annual fee/i })).toHaveCount(0);
  await box.check();
  await page.locator("#edit").getByRole("button", { name: "Save" }).click();
  await expect(strip.getByRole("button", { name: `Log — ${LYFT}` })).toBeVisible();
  await expect(row.getByRole("switch", { name: "Reminders: Lyft in-app credit" })).toHaveAttribute("aria-checked", "true");
});

test("a skipped month's credit comes back next month (browser clock moved forward)", async ({ page }) => {
  await importDemo(page);
  await page.goto("/");
  const strip = page.getByTestId("up-next-strip");
  await strip.getByRole("button", { name: `Skip — ${LYFT}` }).click();
  await strip.getByRole("button", { name: `Skip this month — ${LYFT}` }).click();
  await expect(strip.getByRole("button", { name: `Log — ${LYFT}` })).toHaveCount(0);

  // The app's "today" is the browser's local date. Jump to the 3rd of next month, at noon.
  const now = new Date();
  await page.clock.setFixedTime(new Date(now.getFullYear(), now.getMonth() + 1, 3, 12));
  await page.goto("/");
  await expect(strip.getByRole("button", { name: `Log — ${LYFT}` })).toBeVisible();
  // Last month's skip is no longer a current item, so it isn't counted.
  await expect(page.getByTestId("show-skipped")).toHaveCount(0);
});
