import path from "node:path";
import { expect, test } from "@playwright/test";
import { addCardWithOffer, daysAgo, gotoReady, importDemo, mouseSwipeLeft, saved, saveStubCard, setDemoSpend, sheet, sheetSettled, startStubCard } from "./helpers";

// Regenerates docs/screenshots/ from the demo seed: `SCREENSHOTS=1 npm run test:e2e -- screenshots`.
// docs/SPEC-v5-app-pass.md §5: Wallet, Card page, Up next (one row swiped), a sheet with ⓘ open;
// light + dark, 390px + desktop. Plus 5/24, the v4.1 skipped views, the v7 credit rows, benefit sheet and Should I apply?,
// the v6 welcome bonus (card row, sheet, Up next row), the v6.1 annual fee sheets (watch, decide) and v9 Deals.
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

        // v7 (docs/SPEC-v7-phone-feedback.md §1–2): credit rows with "Requires enrollment" and
        // "Benefit ends …", the StubHub sheet, then StubHub used up (greyed, "Opens …").
        await gotoReady(page, "/cards/demo-reserve");
        await page.evaluate(() => document.getElementById("credits")!.scrollIntoView({ block: "start" }));
        await shot("card-credits");
        await page.getByRole("button", { name: "StubHub / viagogo credit", exact: true }).click();
        await sheetSettled(page);
        await shot("benefit-sheet");
        await sheet(page).getByRole("button", { name: /^Log \$/ }).click();
        await expect(sheet(page).getByTestId("log-primary")).toBeDisabled();
        await shot("benefit-sheet-used");
        await page.keyboard.press("Escape");
        await expect(sheet(page)).toHaveCount(0);
        await shot("card-credits-used");
        await gotoReady(page, "/apply");
        await page.getByTestId("apply-card").selectOption("capital-one-venture-x");
        await shot("apply");

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

        // v6 (docs/SPEC-v6-welcome-bonus.md): a fake card 68 days old with a 3-month offer, so its
        // estimated deadline is about three weeks out: the card row, its sheet, and the Up next row.
        await addCardWithOffer(page, daysAgo(68));
        await page.waitForLoadState("networkidle");
        await shot("bonus-card");
        await page.getByTestId("bonus-row").getByRole("button").click();
        await sheetSettled(page);
        await shot("bonus-sheet");
        await page.keyboard.press("Escape");
        await gotoReady(page, "/up-next");
        await page.getByTestId("attention-list").getByText(/^Spend \$3,000$/).scrollIntoViewIfNeeded();
        await shot("up-next-bonus");

        // v8 (docs/SPEC-v8-find-a-card.md): the Spending group, Find a card, and a candidate's sheet.
        await setDemoSpend(page);
        await page.getByTestId("spend-profile").scrollIntoViewIfNeeded();
        await shot("settings-spending");
        await gotoReady(page, "/find-card");
        await page.getByTestId("find-goal").selectOption("bonus");
        await page.getByTestId("find-type").selectOption("personal");
        await page.waitForLoadState("networkidle");
        await shot("find-card");
        await page.getByTestId("candidate-chase-sapphire-preferred").getByRole("button").click();
        await sheetSettled(page);
        await shot("find-card-sheet");
        await page.keyboard.press("Escape");
        await expect(sheet(page)).toHaveCount(0);

        // v9 (docs/SPEC-v9-daily-refresh.md): Deals from the made-up e2e feed, What changed, and the chip on a changed card.
        await gotoReady(page, "/deals");
        // Bring back anything an earlier spec dismissed.
        if (await page.getByTestId("deals-show-dismissed").count()) {
          await page.getByTestId("deals-show-dismissed").click();
          while (await page.getByRole("button", { name: /^Restore — / }).count()) {
            await saved(page, () => page.getByRole("button", { name: /^Restore — / }).first().click());
          }
        }
        await expect(page.getByTestId("deals-yours").getByTestId("deal-chase-offers-grocery")).toBeVisible();
        await shot("deals");
        await page.getByTestId("deals-changed").scrollIntoViewIfNeeded();
        await page.getByTestId("change-row").first().getByRole("button", { name: "Source" }).click();
        await page.getByTestId("deals-changed").evaluate((el) => el.scrollIntoView({ block: "center" }));
        await shot("deals-changed");
        await gotoReady(page, "/cards/demo-reserve");
        await expect(page.getByTestId("changed-chip")).toBeVisible();
        await shot("card-changed");

        // v6.2 (docs/SPEC-v6.2-catalog.md): a stub card: Add card with the public-offer hint, its card page.
        await startStubCard(page, daysAgo(20));
        await page.getByTestId("public-offer").scrollIntoViewIfNeeded();
        await shot("stub-add");
        await saveStubCard(page);
        await page.waitForLoadState("networkidle");
        await shot("stub-card");

        // v6.1 (docs/SPEC-v6.1-annual-fee-decision.md): the day after Demo Venture X's anniversary
        // (clock pinned to Nov 21, 2026): the Watch for fee sheet, the refund-window sheet, the Decide row.
        await page.clock.setFixedTime(new Date(2026, 10, 21, 12));
        await gotoReady(page, "/up-next");
        await page.getByTestId("attention-list").getByRole("button", { name: "Demo Venture X: Watch for the $395 annual fee", exact: true }).click();
        await sheetSettled(page);
        await shot("fee-watch-sheet");
        await sheet(page).getByRole("button", { name: /^Fee posted — / }).click();
        await expect(sheet(page).getByTestId("af-panel")).toHaveAttribute("data-phase", "decide");
        await sheet(page).getByTestId("af-refund-window").getByRole("button", { name: "Source" }).click();
        await shot("fee-decide-sheet");
        await page.keyboard.press("Escape");
        await expect(sheet(page)).toHaveCount(0);
        await page.getByTestId("attention-list").getByText("Decide by Dec 21").scrollIntoViewIfNeeded();
        await shot("up-next-fee");
      });
    }
  }
});
