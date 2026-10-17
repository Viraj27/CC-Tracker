import path from "node:path";
import { expect, test } from "@playwright/test";
import { gotoReady, importDemo } from "./helpers";

// Regenerates docs/screenshots/ from the demo seed: `SCREENSHOTS=1 npm run test:e2e -- screenshots`.
const out = path.join(__dirname, "..", "docs", "screenshots");
const SCREENS = [
  { name: "wallet", path: "/?card=demo-reserve" },
  { name: "wallet-detail", path: "/?card=demo-reserve#credits" },
  { name: "up-next", path: "/up-next" },
  { name: "eligibility", path: "/eligibility" },
];

test.describe("screenshots", () => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate docs/screenshots/");

  for (const scheme of ["light", "dark"] as const) {
    for (const [label, width, height] of [
      ["desktop", 1280, 900],
      ["390", 390, 844],
    ] as const) {
      test(`${scheme} ${label}`, async ({ page }) => {
        await importDemo(page);
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.setViewportSize({ width, height });
        for (const s of SCREENS) {
          await gotoReady(page, s.path);
          await page.screenshot({ path: path.join(out, `${s.name}-${label}-${scheme}.png`) });
        }
        if (label !== "390") return;
        // Up next with a skipped item (docs/SPEC-v4.1-skip.md): skip the Lyft credit, then "1 skipped · show".
        await gotoReady(page, "/up-next");
        const lyft = "Demo Reserve: $10 Lyft in-app credit left";
        await page.getByRole("button", { name: `Skip — ${lyft}` }).click();
        await page.getByRole("button", { name: `Skip this month — ${lyft}` }).click();
        await page.getByTestId("show-skipped").click();
        await expect(page.getByTestId("skipped-item")).toBeVisible();
        await page.getByTestId("show-skipped").evaluate((el) => el.scrollIntoView({ block: "center" }));
        await page.screenshot({ path: path.join(out, `up-next-skipped-${label}-${scheme}.png`) });
        // The Wallet's strip: the item is gone and "1 skipped · show" sits at its end.
        await gotoReady(page, "/?card=demo-reserve");
        const strip = page.getByTestId("up-next-strip");
        await page.getByTestId("show-skipped").click();
        // Scroll the strip to its end: the revealed skipped item with Unskip.
        await strip.evaluate((el) => (el.scrollLeft = el.scrollWidth));
        await page.screenshot({ path: path.join(out, `up-next-strip-skipped-${label}-${scheme}.png`) });
      });
    }
  }
});
