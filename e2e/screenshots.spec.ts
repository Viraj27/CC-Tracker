import path from "node:path";
import { expect, test } from "@playwright/test";
import { gotoReady, importDemo, mouseSwipeLeft, sheet, sheetSettled } from "./helpers";

// Regenerates docs/screenshots/ from the demo seed: `SCREENSHOTS=1 npm run test:e2e -- screenshots`.
// docs/SPEC-v5-app-pass.md §5: Wallet, Card page, Up next (one row swiped), a sheet with ⓘ open;
// light + dark, 390px + desktop. Plus 5/24 and the v4.1 skipped views.
const out = path.join(__dirname, "..", "docs", "screenshots");
const LYFT = "Demo Reserve: $10 Lyft in-app credit left";

test.describe("screenshots", () => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate docs/screenshots/");

  for (const scheme of ["light", "dark"] as const) {
    for (const [label, width, height] of [
      ["desktop", 1280, 900],
      ["390", 390, 844],
    ] as const) {
      test(`${scheme} ${label}`, async ({ page }) => {
        test.setTimeout(120_000);
        await importDemo(page);
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.setViewportSize({ width, height });
        const shot = (name: string) => page.screenshot({ path: path.join(out, `${name}-${label}-${scheme}.png`) });

        await gotoReady(page, label === "390" ? "/" : "/?card=demo-reserve");
        await shot("wallet");
        await gotoReady(page, "/cards/demo-reserve");
        await shot("card");
        await gotoReady(page, "/eligibility");
        await shot("eligibility");

        // Up next with one row swiped open (Skip + Log).
        await gotoReady(page, "/up-next");
        const row = page.getByTestId("up-next-item").filter({ has: page.getByRole("button", { name: LYFT, exact: true }) });
        await mouseSwipeLeft(page, row.getByTestId("up-next-row"));
        await expect(row).toHaveAttribute("data-open", "true");
        await page.mouse.move(0, 0);
        await shot("up-next");

        // The credit sheet with its ⓘ open (source, checked date, description).
        await gotoReady(page, "/cards/demo-reserve");
        await page.getByRole("button", { name: "Lyft in-app credit", exact: true }).click();
        await sheetSettled(page);
        await sheet(page).getByRole("button", { name: "Source" }).click();
        await shot("sheet");
        await page.keyboard.press("Escape");

        // Skipped items (docs/SPEC-v4.1-skip.md): skip the Lyft credit, then "1 skipped · show".
        await gotoReady(page, "/up-next");
        await page.getByRole("button", { name: LYFT, exact: true }).click();
        await sheet(page).getByRole("button", { name: `Skip this month — ${LYFT}` }).click();
        await expect(sheet(page)).toHaveCount(0);
        await page.getByTestId("show-skipped").click();
        await expect(page.getByTestId("skipped-item")).toBeVisible();
        await page.getByTestId("skipped-item").scrollIntoViewIfNeeded();
        await shot("up-next-skipped");
        if (label === "desktop") {
          // The Wallet's strip: the item is gone and "1 skipped · show" sits at its end.
          await gotoReady(page, "/?card=demo-reserve");
          await page.getByTestId("show-skipped").click();
          await page.getByTestId("up-next-strip").evaluate((el) => (el.scrollLeft = el.scrollWidth));
          await shot("up-next-strip-skipped");
        }
      });
    }
  }
});
