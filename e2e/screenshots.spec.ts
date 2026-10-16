import path from "node:path";
import { test } from "@playwright/test";
import { importDemo } from "./helpers";

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
          await page.goto(s.path);
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: path.join(out, `${s.name}-${label}-${scheme}.png`) });
        }
      });
    }
  }
});
