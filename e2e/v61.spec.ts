import { expect, test, type Page } from "@playwright/test";
import { gotoReady, importDemo, saved, sheet, sheetSettled } from "./helpers";

// v6.1 annual fee after it posts (docs/SPEC-v6.1-annual-fee-decision.md §7): 390px and desktop, both themes.
// Demo seed only: Demo Venture X ($395) has its anniversary on Nov 20. The browser clock is pinned to
// Nov 21, 2026, the day after, when the fee used to vanish from Up next.
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const WATCH = "Demo Venture X: Watch for the $395 annual fee";
const list = (page: Page) => page.getByTestId("attention-list");

for (const [label, width, height] of [
  ["390", 390, 844],
  ["desktop", 1280, 900],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`${label} ${scheme}`, () => {
      test.use({ viewport: { width, height } });
      test.beforeEach(async ({ page }) => {
        await page.clock.setFixedTime(new Date(2026, 10, 21, 12));
        await importDemo(page);
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      });

      test("the day after the anniversary: Watch for fee → Fee posted → Decide by → Keep clears it", async ({ page }) => {
        await gotoReady(page, "/up-next");
        const row = list(page).getByRole("button", { name: WATCH, exact: true });
        await expect(row).toContainText("Watch for fee");
        await expect(row).toContainText("$395");
        await expect(row).toContainText("4 JAN 2027"); // anniversary + 45 days
        await row.click();
        await sheetSettled(page);
        // Skippable, never muted.
        await expect(sheet(page).getByRole("button", { name: /Stop reminding me/ })).toHaveCount(0);
        await expect(sheet(page).getByRole("button", { name: `Skip this one — ${WATCH}` })).toBeVisible();
        await expect(sheet(page).getByTestId("af-panel")).toHaveAttribute("data-phase", "watch");
        await expect(sheet(page).getByLabel("Posted on")).toHaveValue("2026-11-21");
        await expect(sheet(page).getByLabel("Amount")).toHaveValue("395");
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await sheet(page).getByRole("button", { name: /^Fee posted — / }).click();

        // The sheet moves on to the refund window: 30 days from posting (Capital One, community source behind ⓘ).
        const panel = sheet(page).getByTestId("af-panel");
        await expect(panel).toHaveAttribute("data-phase", "decide");
        await expect(sheet(page).getByTestId("af-decide-by")).toHaveText("21 DEC");
        const window = sheet(page).getByTestId("af-refund-window");
        await expect(window).toContainText("Refund window: 30 days from posting · 30 days left");
        await window.getByRole("button", { name: "Source" }).click();
        await expect(window.getByRole("link", { name: "Community source" })).toHaveAttribute("href", /milestomemories/);
        await expect(panel).toContainText("Downgrade to:");
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await sheet(page).getByRole("button", { name: "Close", exact: true }).first().click();

        // Up next follows the phase (the wallet chip is unit-tested: the card's payment is due sooner here).
        const decide = list(page).getByRole("button", { name: /^Demo Venture X: Decide by Dec 21/ });
        await expect(decide).toContainText("Decide by Dec 21");
        await expect(list(page).getByText("Watch for fee")).toHaveCount(0);

        // Fee history shows it as posted and undecided; Keep resolves the cycle.
        await gotoReady(page, "/cards/demo-venture-x#af-history");
        await sheetSettled(page);
        const event = sheet(page).locator("li").filter({ hasText: "21 NOV" });
        await expect(event).toContainText("Posted · deciding");
        await sheet(page).getByRole("button", { name: /^Keep — / }).click();
        await expect(event).toContainText("Paid");
        await expect(event).not.toContainText("deciding");
        await expect(sheet(page).getByTestId("af-panel")).toHaveCount(0);
        await gotoReady(page, "/up-next");
        await expect(list(page).getByText(/Decide by|Watch for fee/)).toHaveCount(0);
      });

      test("Retention offer logs the call and records the outcome; the row's own action opens the decision", async ({ page }) => {
        await gotoReady(page, "/up-next");
        // The row's primary action (swipe / desktop pill) opens the same sheet.
        await list(page).getByRole("button", { name: WATCH, exact: true }).click();
        await sheetSettled(page);
        await sheet(page).getByLabel("Posted on").fill("2026-11-21");
        await sheet(page).getByRole("button", { name: /^Fee posted — / }).click();
        await expect(sheet(page).getByTestId("af-panel")).toHaveAttribute("data-phase", "decide");
        await sheet(page).getByRole("button", { name: /^Retention offer — / }).click();
        const form = sheet(page).getByRole("form", { name: "Add lifecycle event" });
        await expect(form.getByLabel("Type")).toHaveValue("retention_call");
        await form.getByLabel("Offer").fill("Demo $100 statement credit");
        await form.getByLabel("Accepted?").selectOption("yes");
        await saved(page, () => form.getByRole("button", { name: "Add event" }).click());
        await expect(sheet(page)).toHaveCount(0);
        await expect(list(page).getByText(/Decide by|Watch for fee/)).toHaveCount(0);

        await gotoReady(page, "/cards/demo-venture-x#af-history");
        await sheetSettled(page);
        await expect(sheet(page).locator("li").filter({ hasText: "21 NOV" })).toContainText("Retention offer");
        await gotoReady(page, "/cards/demo-venture-x#lifecycle");
        await sheetSettled(page);
        await expect(sheet(page).getByTestId("list-sheet-lifecycle")).toContainText("Demo $100 statement credit");
      });
    });
  }
}
