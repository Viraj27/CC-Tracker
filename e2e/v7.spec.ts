import { expect, test, type Page } from "@playwright/test";
import { gotoReady, importDemo, sheet, sheetSettled } from "./helpers";

// v7 phone feedback pass (docs/SPEC-v7-phone-feedback.md §6): 390px, both themes. Demo seed only.
// The browser clock is pinned to Oct 18, 2026, so StubHub's Jul–Dec half is the open one.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const scheme of ["light", "dark"] as const) {
  test.describe(scheme, () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(new Date(2026, 9, 18, 12));
      await importDemo(page);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    });

    test("logging StubHub's remaining amount greys the row until the next half opens", async ({ page }) => {
      await gotoReady(page, "/cards/demo-reserve");
      const sub = page.getByTestId("credit-sub-stubhub-credit");
      await expect(sub).toHaveAttribute("data-state", "open");
      await expect(sub).toContainText("Benefit ends 31 DEC 2027");
      await page.getByRole("button", { name: "StubHub / viagogo credit", exact: true }).click();
      await sheetSettled(page);
      await sheet(page).getByRole("button", { name: "Log $150" }).click();

      await expect(sub).toHaveAttribute("data-state", "used_upcoming");
      await expect(sub).toContainText("JAN–JUN 2027");
      await expect(sub).toContainText("OPENS 1 JAN");
      await expect(page.getByTestId("remaining-stubhub-credit")).toHaveText("$150");
      // The sheet can't log into the used-up half; the use stays listed and deletable.
      const log = sheet(page).getByTestId("log-primary");
      await expect(log).toBeDisabled();
      await expect(log).toHaveText(/^Opens 1 Jan/i);
      await expect(sheet(page).getByRole("radiogroup", { name: "Amount" })).toHaveCount(0);
      await expect(sheet(page).getByRole("list", { name: "Uses this period" })).toBeVisible();
      await expect(sheet(page).getByTestId("sheet-left")).toHaveText("$0");
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.keyboard.press("Escape");
      // Greyed rows sort below the open ones.
      const ids = await page.locator('[data-testid^="credit-sub-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
      expect(ids.indexOf("used_upcoming")).toBeGreaterThan(ids.lastIndexOf("open"));
    });

    test("Mark enrolled removes Requires enrollment; undo brings it back", async ({ page }) => {
      await gotoReady(page, "/cards/demo-reserve");
      const row = page.getByTestId("credit-row-stubhub-credit");
      await expect(row.getByText("Requires enrollment")).toBeVisible();
      // The badge and the benefit end line fit the one-line row at 390px.
      const box = (await row.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      await row.click();
      await sheetSettled(page);
      const s = sheet(page);
      await expect(s.getByText("Requires enrollment")).toBeVisible();
      await s.getByTestId("enrollment").getByRole("button", { name: "Mark enrolled" }).click();
      await expect(s.getByTestId("enrollment")).toContainText("Enrolled 18 OCT");
      await expect(s.getByText("Requires enrollment")).toHaveCount(0);
      await expect(row.getByText("Requires enrollment")).toHaveCount(0);

      await s.getByRole("button", { name: "undo" }).click();
      await expect(s.getByText("Requires enrollment")).toBeVisible();
    });

    test("Should I apply? gives a verdict for Venture X", async ({ page }) => {
      await gotoReady(page, "/eligibility");
      await page.getByRole("link", { name: /^Should I apply\?/ }).click();
      await expect(page).toHaveURL(/\/apply$/);
      await expect(page.getByRole("heading", { level: 1, name: "Should I apply?" })).toBeVisible();
      await page.getByTestId("apply-card").selectOption("capital-one-venture-x");
      // Demo Venture X was opened Nov 2025: the 48-month Venture rule rules out the bonus.
      await expect(page.getByTestId("verdict-approval")).toBeVisible();
      await expect(page.getByTestId("verdict-bonus")).toHaveAttribute("data-outcome", "fail");
      await expect(page.getByTestId("verdict-bonus")).toContainText("Not eligible");
      await expect(page.getByText(/Verify before applying · rules checked/)).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });

    test("Best card Airfare lists CSR via Chase Travel and booked direct as two rows", async ({ page }) => {
      await gotoReady(page, "/best-card");
      await page.getByRole("radio", { name: "Airfare" }).click();
      const portal = page.getByTestId("best-demo-reserve-portal");
      const off = page.getByTestId("best-demo-reserve-off");
      await expect(portal).toContainText("Via Chase Travel");
      await expect(portal).toContainText("8x");
      await expect(off).toContainText("Booked direct");
      await expect(off).toContainText("4x");
      expect((await portal.boundingBox())!.y).toBeLessThan((await off.boundingBox())!.y);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  });
}
