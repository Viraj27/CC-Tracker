import { expect, test, type Page } from "@playwright/test";
import { gotoReady, importDemo, sheet, sheetSettled } from "./helpers";

// v6.2 catalog stubs (docs/SPEC-v6.2-catalog.md §6): a card the catalog only has basic facts for.
// Demo seed plus one fake holding of a stub card; 390px and desktop, both themes.
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

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

      test("add a stub card with its public offer; every screen works with basic info only", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));

        // Add card: the picker is grouped by issuer and now lists cards you might get.
        await gotoReady(page, "/cards");
        const picker = page.getByLabel("Card product (catalog)");
        expect(await picker.locator("option").count()).toBeGreaterThan(60);
        await expect(picker.locator('optgroup[label="Citi"] option').first()).toBeAttached();
        await picker.selectOption("amex-gold");
        await page.getByLabel("Approval date", { exact: true }).fill("2026-10-20");

        // The public offer is only a suggestion: nothing is filled until "Use it".
        await page.getByTestId("offer-fieldset").locator("summary").click();
        const hint = page.getByTestId("public-offer");
        await expect(hint).toContainText("Public offer as of Jun 8: 60K pts for $6,000 in 180 days");
        await expect(page.getByLabel("Bonus", { exact: true })).toHaveValue("");
        await hint.getByRole("button", { name: "About the public offer" }).click();
        await expect(hint).toContainText("Offers change often");
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await hint.getByRole("button", { name: "Use it" }).click();
        await expect(page.getByLabel("Bonus", { exact: true })).toHaveValue("60000");
        await expect(page.getByLabel(/^Minimum spend/)).toHaveValue("6000");
        await expect(page.getByLabel("Months to spend")).toHaveValue("6");
        await page.getByRole("button", { name: "Save", exact: true }).click();

        // Card page: the basic-info notice, the fee, the bonus row; no credits; nothing errors.
        const notice = page.getByTestId("stub-notice");
        await expect(notice).toContainText("Basic card info only");
        await notice.getByRole("button", { name: "About basic card info" }).click();
        await expect(notice).toContainText("5/24, fee reminders and issuer rules work");
        await expect(page.getByTestId("card-detail")).toContainText("$350");
        await expect(page.getByTestId("bonus-row")).toContainText("60K pts · $6,000");
        await expect(page.locator("#credits")).toHaveCount(0);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        // The imported fee is honest about being unchecked.
        await page.getByTestId("drill-fees").click();
        await sheetSettled(page);
        await expect(sheet(page)).toContainText("$350");
        await expect(sheet(page)).toContainText(/unverified/i);
        await page.keyboard.press("Escape");

        // 5/24 counts it; Up next shows its bonus deadline (and, being day-one billed, the fee to watch for).
        await gotoReady(page, "/eligibility");
        await expect(page.locator("main")).toContainText("American Express Gold Card");
        await gotoReady(page, "/up-next");
        await expect(page.getByTestId("attention-list")).toContainText("American Express Gold Card");
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // Best card leaves it out and says so in one line.
        await gotoReady(page, "/best-card");
        await expect(page.getByTestId("best-card-unranked")).toHaveText("Not ranked (basic card info only): American Express Gold Card.");
        await expect(page.getByTestId("best-card-list")).not.toContainText("American Express Gold Card");

        // Should I apply? runs the issuer's rules for a stub: Sapphire Preferred against 5/24.
        await gotoReady(page, "/apply");
        await page.getByTestId("apply-card").selectOption("chase-sapphire-preferred");
        await expect(page.getByTestId("verdict-approval")).toHaveAttribute("data-outcome", /pass|fail/);
        await expect(page.locator("main")).toContainText("Chase 5/24");
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // Wallet and the rest render.
        for (const p of ["/", "/payments", "/points", "/rotating", "/settings"]) await gotoReady(page, p);
        expect(errors).toEqual([]);
      });
    });
  }
}
