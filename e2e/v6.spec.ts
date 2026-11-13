import { expect, test, type Page } from "@playwright/test";
import { addCardWithOffer, gotoReady, importDemo, saved, sheet, sheetSettled } from "./helpers";

// v6 welcome bonus (docs/SPEC-v6-welcome-bonus.md §7): 390px and desktop, both themes. Demo seed only.
// The browser clock is pinned to Nov 22, 2026; the fake card is approved Sep 14, so its estimated
// deadline is Dec 14 (22 days out) and its close guard runs to Sep 14, 2027.
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const TARGET = "Delta SkyMiles Gold American Express Card: Spend $3,000 for the 60K mi welcome bonus";

for (const [label, width, height] of [
  ["390", 390, 844],
  ["desktop", 1280, 900],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`${label} ${scheme}`, () => {
      test.use({ viewport: { width, height } });
      test.beforeEach(async ({ page }) => {
        await page.clock.setFixedTime(new Date(2026, 10, 22, 12));
        await importDemo(page);
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      });

      test("add an offer, see its deadline in Up next, mark it met, then posted", async ({ page }) => {
        await addCardWithOffer(page, "2026-09-14");
        const row = page.getByTestId("bonus-row");
        await expect(row).toContainText("60K mi · $3,000 by Dec 14 (est.)");
        await expect(row).toContainText("22 days left");
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // Up next: the deadline row; its sheet never asks for spend, and the estimate explains itself.
        await gotoReady(page, "/up-next");
        const item = page.getByTestId("attention-list").getByRole("button", { name: TARGET, exact: true });
        await expect(item).toContainText("Spend $3,000");
        await expect(item).toContainText("60K mi");
        await item.click();
        await sheetSettled(page);
        await expect(sheet(page).getByTestId("offer-date")).toHaveText("14 DEC");
        await sheet(page).getByRole("button", { name: "About the estimate" }).click();
        await expect(sheet(page)).toContainText("approval date plus 3 months");
        // No mute for a welcome bonus: Skip hides this one occurrence only.
        await expect(sheet(page).getByRole("button", { name: /Stop reminding me/ })).toHaveCount(0);
        await expect(sheet(page).getByRole("button", { name: `Skip this one — ${TARGET}` })).toBeVisible();
        // "Spent so far" is optional and only changes the wording.
        await sheet(page).getByLabel(/^Spent so far/).fill("1800");
        await saved(page, () => sheet(page).getByLabel(/^Spent so far/).press("Enter"));
        await expect(sheet(page).getByTestId("offer-line")).toContainText("$1,200 left");
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        // The sheet closes at once; the save has to land before the full page load below.
        await saved(page, () => sheet(page).getByRole("button", { name: /^Mark met — / }).click());
        await expect(sheet(page)).toHaveCount(0);
        await expect(page.getByTestId("attention-list").getByText("Spend $1,200 more")).toHaveCount(0);

        // 56 days after Met the bonus hasn't posted: a nudge, until Posted.
        await page.clock.setFixedTime(new Date(2027, 0, 20, 12));
        await gotoReady(page, "/up-next");
        const nudge = page.getByTestId("attention-list").getByRole("button", { name: /^Delta SkyMiles Gold.*: 60K mi welcome bonus not posted/ });
        await expect(nudge).toContainText("Bonus not posted");
        await nudge.click();
        await sheetSettled(page);
        await saved(page, () => sheet(page).getByRole("button", { name: /^Mark posted — / }).first().click());
        await expect(sheet(page)).toHaveCount(0);
        await expect(page.getByTestId("attention-list").getByText("Bonus not posted")).toHaveCount(0);

        // The row leaves the card page; the result is in the lifecycle log.
        await page.goto(await cardUrl(page));
        await expect(page.getByTestId("card-detail").first()).toBeVisible();
        await expect(page.getByTestId("bonus-row")).toHaveCount(0);
        await page.getByTestId("drill-lifecycle").click();
        await sheetSettled(page);
        await expect(sheet(page).getByTestId("bonus-log")).toContainText("Bonus posted 60K mi");
        await page.keyboard.press("Escape");

        // Close guard: a warning with its source on Downgrade options, and when closing in Edit. It never blocks.
        await page.getByTestId("drill-downgrade").click();
        await sheetSettled(page);
        const guard = sheet(page).getByTestId("close-guard");
        await expect(guard).toContainText("Bonus Jan 20 — closing before Sep 14 risks clawback");
        await guard.getByRole("button", { name: "Source" }).click();
        await expect(guard.getByRole("link", { name: "Community source" })).toBeVisible();
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Edit", exact: true }).click();
        await sheetSettled(page);
        await expect(sheet(page).getByTestId("close-guard")).toHaveCount(0);
        await sheet(page).getByLabel("Status").selectOption("closed");
        await expect(sheet(page).getByTestId("close-guard")).toBeVisible();
      });

      test("an overdue deadline offers Met and Missed; Missed ends it", async ({ page }) => {
        await addCardWithOffer(page, "2026-09-14");
        await page.clock.setFixedTime(new Date(2026, 11, 16, 12));
        await gotoReady(page, "/up-next");
        const item = page.getByTestId("attention-list").getByRole("button", { name: /^Delta SkyMiles Gold.*: Deadline passed/ });
        await item.click();
        await sheetSettled(page);
        await expect(sheet(page).getByRole("button", { name: /^Mark met — / })).toBeVisible();
        await sheet(page).getByRole("button", { name: /^Mark missed — / }).click();
        await expect(sheet(page)).toHaveCount(0);
        await expect(page.getByTestId("attention-list").getByText("Deadline passed")).toHaveCount(0);
      });
    });
  }
}

/** The card page of the card added in this test (its id is generated). */
async function cardUrl(page: Page): Promise<string> {
  await gotoReady(page, "/cards");
  const href = await page.getByRole("link", { name: /Delta SkyMiles Gold/ }).first().getAttribute("href");
  return href!;
}
