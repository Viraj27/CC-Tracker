import { expect, test, type Page } from "@playwright/test";
import { gotoReady, importDemoWithSettings, setDemoSpend, sheet, sheetSettled } from "./helpers";

// v8 Find a card (docs/SPEC-v8-find-a-card.md §7): 390px and desktop, both themes. Demo seed only:
// it holds Demo Reserve, Flex, Venture X and Autograph, so those never show as candidates, and the
// Venture X (opened Nov 2025) blocks the Venture bonus for 48 months.
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const ranked = (page: Page) => page.getByTestId("find-ranked");
const candidate = (page: Page, id: string) => page.getByTestId(`candidate-${id}`);

for (const [label, width, height] of [
  ["390", 390, 844],
  ["desktop", 1280, 900],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`${label} ${scheme}`, () => {
      test.use({ viewport: { width, height }, permissions: ["clipboard-read", "clipboard-write"] });
      test.beforeEach(async ({ page }) => {
        await page.clock.setFixedTime(new Date(2026, 10, 22, 12));
        await importDemoWithSettings(page); // no spend profile, default criteria
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      });

      test("no spend profile: ranks on the bonus, says what is missing; held cards are not candidates", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await gotoReady(page, "/more");
        await page.getByRole("main").getByRole("link", { name: "Find a card" }).click();
        await expect(page.locator("main h1:visible").first()).toHaveText(/Find a card/);
        await expect(page.getByTestId("find-no-profile")).toContainText("Add your rough spending to see fit");
        await expect(page.getByTestId("find-valuation")).toContainText("default value per point");
        await expect(page.getByTestId("find-footer")).toContainText("Offers as of Jun 8");
        // Personal cards by default; nothing held; no reach badges without a profile.
        await expect(candidate(page, "chase-sapphire-preferred")).toContainText("75K pts · $5,000 in 3 mo");
        await expect(candidate(page, "chase-sapphire-preferred")).toContainText("≈ $655");
        for (const held of ["chase-sapphire-reserve", "chase-freedom-flex", "capital-one-venture-x", "wells-fargo-autograph"]) await expect(candidate(page, held)).toHaveCount(0);
        await expect(candidate(page, "chase-ink-business-preferred")).toHaveCount(0);
        await expect(ranked(page).getByText(/^(Reachable|Stretch|Out of reach)$/)).toHaveCount(0);
        // Not right now: collapsed, each card with its reason and the date it changes.
        const notNow = page.getByTestId("find-not-now");
        await expect(notNow.locator("summary")).toContainText("Not right now · 1");
        await expect(candidate(page, "capital-one-venture")).toBeHidden();
        await notNow.locator("summary").click();
        await expect(candidate(page, "capital-one-venture")).toContainText("Venture / Venture X bonus — 48 months");
        await expect(candidate(page, "capital-one-venture")).toContainText("eligible from Nov 20, 2029");
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
      });

      test("with a spend profile: reach, criteria that stick, the breakdown sheet, and the hand-offs", async ({ page }) => {
        await setDemoSpend(page);
        await gotoReady(page, "/find-card");
        await expect(page.getByTestId("find-no-profile")).toHaveCount(0);
        // $5,000 in 90 days is $1,667 a month against $2,000: reachable. Every reachable card sits above every stretch.
        await expect(candidate(page, "chase-sapphire-preferred")).toContainText("Reachable");
        const reach = await ranked(page).locator("li").evaluateAll((rows) =>
          rows.map((r) => r.textContent ?? "").flatMap((t) => (/Out of reach/.test(t) ? [2] : /Stretch/.test(t) ? [1] : /Reachable/.test(t) ? [0] : [])),
        );
        expect(reach).toEqual([...reach].sort((a, b) => a - b));
        expect(new Set(reach).size).toBeGreaterThan(1);

        // Card type: Both adds business cards; Personal removes them again. The choice survives a reload.
        await page.getByTestId("find-type").selectOption("both");
        await expect(candidate(page, "chase-ink-business-preferred")).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.reload();
        await expect(page.getByTestId("find-type")).toHaveValue("both");
        await page.getByTestId("find-type").selectOption("personal");
        await expect(candidate(page, "chase-ink-business-preferred")).toHaveCount(0);
        await page.getByTestId("find-fee").selectOption("100");
        await expect(candidate(page, "amex-platinum")).toHaveCount(0);
        await page.getByTestId("find-fee").selectOption("");

        // Goal: everyday value ranks researched cards by what they add; stubs say why they can't be.
        await page.getByTestId("find-goal").selectOption("everyday");
        await expect(page.getByText(/^By everyday value · \d+$/)).toBeVisible();
        await expect(candidate(page, "amex-delta-skymiles-gold")).toContainText("more than your cards");
        await expect(candidate(page, "chase-sapphire-preferred")).toContainText("Earn rates not researched yet");
        await expect(ranked(page).locator("li").first()).not.toContainText("not researched");
        await page.getByTestId("find-goal").selectOption("bonus");
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // The sheet: every figure next to the numbers it came from.
        await candidate(page, "chase-sapphire-preferred").getByRole("button").click();
        await sheetSettled(page);
        const s = sheet(page);
        await expect(s.getByTestId("candidate-bonus-value")).toContainText("$750");
        await expect(s.getByTestId("candidate-bonus-value")).toContainText("75,000 points × 1¢ (Chase Ultimate Rewards)");
        await expect(s.getByTestId("candidate-net")).toContainText("≈ $655");
        await expect(s.getByTestId("candidate-net")).toContainText("$750 − $95");
        await expect(s.getByTestId("candidate-reach")).toContainText("Needs $1,667/mo · you spend about $2,000");
        await expect(s.getByTestId("candidate-reach")).toContainText("$5,000 ÷ (90 days ÷ 30)");
        await expect(s.getByTestId("candidate-everyday")).toContainText("Earn rates not researched yet");
        await expect(s.getByTestId("candidate-524")).toContainText("Takes you to 4/24");
        await expect(s.getByTestId("candidate-offer-source")).toContainText("public offer as of Jun 8");
        await expect(s).toContainText("Unverified");
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // Should I apply? opens on that card with a verdict.
        await s.getByRole("button", { name: "Should I apply?" }).click();
        await expect(page).toHaveURL(/\/apply\?card=chase-sapphire-preferred/);
        await expect(page.getByTestId("apply-card")).toHaveValue("chase-sapphire-preferred");
        await expect(page.getByTestId("verdict-approval")).toHaveAttribute("data-outcome", "pass");
        await page.getByTestId("apply-find-card").getByRole("link").click();
        await expect(page).toHaveURL(/\/find-card/);

        // Add card: the card picked and the public offer already in the fields.
        await candidate(page, "chase-sapphire-preferred").getByRole("button").click();
        await sheetSettled(page);
        await sheet(page).getByRole("button", { name: "Add card" }).click();
        await expect(page).toHaveURL(/\/cards\?card=chase-sapphire-preferred&offer=1/);
        await expect(page.getByLabel("Card product (catalog)")).toHaveValue("chase-sapphire-preferred");
        await expect(page.getByLabel("Bonus", { exact: true })).toHaveValue("75000");
        await expect(page.getByLabel("Months to spend")).toHaveValue("3");

        // Copy my situation: plain text on the clipboard, nothing sent.
        await gotoReady(page, "/find-card");
        await page.getByTestId("copy-situation").click();
        await expect(page.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();
        const text = await page.evaluate(() => navigator.clipboard.readText());
        expect(text).toMatch(/Open cards \(\d\):/);
        expect(text).toContain("Chase Sapphire Reserve (personal), opened 2025-01-15, $795 annual fee");
        expect(text).toContain("5/24: 3/24");
        expect(text).toContain("Rough monthly spend (total $2,000):");
        expect(text).toContain("Looking for: personal cards; goal: welcome bonus");
        expect(text).toMatch(/1\. .+net first-year value about \$/);
      });
    });
  }
}
