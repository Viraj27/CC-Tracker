import { expect, test, type Page } from "@playwright/test";
import { daysAgo, gotoReady, importDemoWithSettings, saved } from "./helpers";

// v9 Deals and "What changed" (docs/SPEC-v9-daily-refresh.md §8): 390px and desktop, both themes.
// The server runs on a copy of the catalog with the made-up feed from e2e/feedFixture.ts
// (scripts/e2e-catalog.ts), dated relative to the day it was built. Demo seed only: it holds
// Chase, Capital One and Wells Fargo cards and nothing from Amex.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** `Nov 13`, as the app prints the date `n` days ago (negative = ahead). */
const monthDay = (n: number) => {
  const [, m, d] = daysAgo(n).split("-").map(Number);
  return `${MON[m - 1]} ${d}`;
};
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const deal = (page: Page, id: string) => page.getByTestId(`deal-${id}`);
const dot = (page: Page) => page.locator('[data-testid="deals-dot"]:visible');

for (const [label, width, height] of [
  ["390", 390, 844],
  ["desktop", 1280, 900],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test.describe(`${label} ${scheme}`, () => {
      test.use({ viewport: { width, height } });
      test.beforeEach(async ({ page }) => {
        await importDemoWithSettings(page); // nothing dismissed, Deals never opened
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      });

      test("Deals groups the feed for the demo cards; opening it clears the dot", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await gotoReady(page, "/more");
        await expect(dot(page)).toHaveCount(1);
        const link = page.getByRole("main").getByRole("link", { name: /Deals/ });
        await expect(link).toContainText("New");
        await link.click();
        await expect(page.locator("main h1:visible").first()).toHaveText(/Deals/);
        await expect(page.getByTestId("deals-status")).toHaveText(`Updated ${monthDay(0)} · community-sourced`);

        // For your cards: a Chase card-linked offer (issuer match) and an item for the Reserve (card match).
        const yours = page.getByTestId("deals-yours");
        await expect(yours.locator("li")).toHaveCount(2);
        await expect(deal(page, "reserve-transfer-bonus")).toContainText(`Example Feed · ${monthDay(1)}`);
        await expect(yours.getByTestId("deal-chase-offers-grocery")).toContainText(`ends ${monthDay(-10)}`);
        await expect(page.getByText("For your cards · 2")).toBeVisible();
        // New card offers: a catalog card the demo does not hold, with a way into Should I apply?
        const offers = page.getByTestId("deals-card-offers");
        await expect(offers.locator("li")).toHaveCount(1);
        await expect(offers.getByTestId("deal-amex-gold-100k").getByRole("link", { name: /^Should I apply\?/ })).toHaveAttribute("href", "/apply?card=amex-gold");
        // Shopping: the plain deal, and a card-linked offer for an issuer the demo has no card with.
        const shopping = page.getByTestId("deals-shopping");
        await expect(shopping.locator("li")).toHaveCount(2);
        await expect(shopping.getByTestId("deal-amex-offers-laptops")).toBeVisible();
        await expect(shopping.getByTestId("deal-portal-10x")).toBeVisible();
        // Every deal opens the post in a new tab; past-dated items are gone.
        await expect(deal(page, "portal-10x").getByRole("link").first()).toHaveAttribute("href", "https://example.com/posts/portal-10x");
        await expect(deal(page, "portal-10x").getByRole("link").first()).toHaveAttribute("target", "_blank");
        await expect(deal(page, "expired-deal")).toHaveCount(0);
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // Opening the page marked the run as seen: no dot, here or after a reload.
        await expect(dot(page)).toHaveCount(0);
        await gotoReady(page, "/more");
        await expect(dot(page)).toHaveCount(0);
        await expect(page.getByRole("main").getByRole("link", { name: /Deals/ })).not.toContainText("New");
        expect(errors).toEqual([]);
      });

      test("dismiss hides an item for good; restore brings it back", async ({ page }) => {
        await gotoReady(page, "/deals");
        await expect(page.getByTestId("deals-show-dismissed")).toHaveCount(0);
        await saved(page, () => page.getByRole("button", { name: "Dismiss — Demo: 30% transfer bonus for Sapphire Reserve" }).click());
        await expect(page.getByTestId("deals-yours").locator("li")).toHaveCount(1);
        await expect(page.getByText("For your cards · 1")).toBeVisible();
        await expect(deal(page, "reserve-transfer-bonus")).toHaveCount(0);
        await expect(page.getByTestId("deals-show-dismissed")).toHaveText("1 dismissed · show");
        // Stored, not just hidden.
        await gotoReady(page, "/deals");
        await expect(deal(page, "reserve-transfer-bonus")).toHaveCount(0);
        await page.getByTestId("deals-show-dismissed").click();
        await expect(page.getByTestId("deals-dismissed").getByTestId("deal-reserve-transfer-bonus")).toBeVisible();
        await saved(page, () => page.getByRole("button", { name: "Restore — Demo: 30% transfer bonus for Sapphire Reserve" }).click());
        await expect(page.getByTestId("deals-yours").locator("li")).toHaveCount(2);
        await expect(page.getByTestId("deals-show-dismissed")).toHaveCount(0);
        await gotoReady(page, "/deals");
        await expect(page.getByTestId("deals-yours").getByTestId("deal-reserve-transfer-bonus")).toBeVisible();
        // The last one in a group leaves its empty line behind.
        await page.getByRole("button", { name: /^Dismiss — Demo: Amex Gold 100K/ }).click();
        await expect(page.getByText("No card offers in the feed.")).toBeVisible();
      });

      test("What changed lists confirmed changes with their source, and reported ones apart", async ({ page }) => {
        await gotoReady(page, "/deals");
        await expect(page.getByText("What changed · 3")).toBeVisible();
        const changed = page.getByTestId("deals-changed");
        const rows = changed.getByTestId("change-row");
        await expect(rows).toHaveCount(2); // the 90-day-old entry is not listed
        await expect(rows.nth(0)).toContainText(`Chase Sapphire Reserve · Dining credit · $5/mo → $10/mo · from ${monthDay(-20)}`);
        await expect(rows.nth(0)).toContainText(`Changed ${monthDay(3)}`);
        await expect(rows.nth(1)).toContainText("Public offer · 60,000 → 100,000");
        // Reported, not confirmed: says the catalog is unchanged and until when it is retried.
        const reported = changed.getByTestId("deal-venture-x-lounge-reported");
        await expect(reported).toContainText("Reported");
        await expect(reported).toContainText("not confirmed on the issuer's page, so the catalog is unchanged");
        await expect(reported).toContainText(`retrying until ${monthDay(-24)}`);
        // Source behind ⓘ: official for the benefit, community for the offer.
        await rows.nth(0).getByRole("button", { name: "Source" }).click();
        await expect(rows.nth(0)).toContainText("Confirmed on the issuer's page");
        await expect(rows.nth(0).getByRole("link", { name: "Source", exact: true })).toHaveAttribute("href", "https://example.com/reserve-terms");
        await rows.nth(1).getByRole("button", { name: "Source" }).click();
        await expect(rows.nth(1)).toContainText("it only ever prefills the welcome offer form");
        // Report: a prefilled issue with the refresh label.
        const report = rows.nth(0).getByRole("link", { name: "Something looks wrong? Report" });
        const href = new URL((await report.getAttribute("href"))!);
        expect(href.origin + href.pathname).toBe("https://github.com/Viraj27/CC-Tracker/issues/new");
        expect(href.searchParams.get("labels")).toBe("refresh");
        expect(href.searchParams.get("body")).toContain("Path: benefits.demo-dining-credit.amount");
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      });

      test("a changed card carries a chip that opens its changes", async ({ page }) => {
        await gotoReady(page, "/cards/demo-reserve");
        const chip = page.getByTestId("changed-chip");
        await expect(chip).toHaveText(new RegExp(`^CHANGED ${monthDay(3).toUpperCase()}`));
        await chip.click();
        await expect(page).toHaveURL(/\/deals\?card=chase-sapphire-reserve#changed$/);
        await expect(page.getByText("What changed · 1 · Chase Sapphire Reserve")).toBeVisible();
        await expect(page.getByTestId("deals-changed").locator("li")).toHaveCount(1);
        await page.getByRole("button", { name: "Show every card" }).click();
        await expect(page.getByText("What changed · 3")).toBeVisible();
        // A card nothing changed on has no chip.
        await gotoReady(page, "/cards/demo-flex");
        await expect(page.locator("main h1:visible").first()).toBeVisible();
        await expect(page.getByTestId("changed-chip")).toHaveCount(0);
      });

      test("desktop header: every link fits beside Add card; the rest are under More", async ({ page }) => {
        test.skip(label !== "desktop", "phones use the tab bar");
        await gotoReady(page, "/deals");
        const nav = page.getByRole("navigation", { name: "Main" });
        const more = page.getByTestId("nav-more");
        const edge = async (l: ReturnType<Page["locator"]>) => (await l.boundingBox())!;
        const add = await edge(page.getByRole("banner").getByRole("link", { name: "Add card" }));
        const last = await edge(more);
        expect(last.x + last.width).toBeLessThanOrEqual(add.x);
        await expect(nav.getByRole("link", { name: "Deals" })).toHaveAttribute("aria-current", "page");
        await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
        await more.click();
        await expect(more).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByTestId("nav-more-menu").getByRole("link")).toHaveText(["Rotating 5%", "Points", "Settings"]);
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("nav-more-menu")).toHaveCount(0);
        await more.click();
        await page.getByTestId("nav-more-menu").getByRole("link", { name: "Settings" }).click();
        await expect(page).toHaveURL(/\/settings$/);
        await expect(page.getByTestId("nav-more-menu")).toHaveCount(0);
        await expect(more).toHaveClass(/font-semibold/);
      });

      test("warns when the refresh has not run for more than 3 days", async ({ page }) => {
        const now = new Date();
        await page.clock.setFixedTime(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4, 12));
        await gotoReady(page, "/deals");
        const status = page.getByTestId("deals-status");
        await expect(status).toHaveText(`Not updated since ${monthDay(0)}`);
        await expect(status).toHaveAttribute("data-stale", "true");
        // Three days is still fine.
        await page.clock.setFixedTime(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 12));
        await gotoReady(page, "/deals");
        await expect(status).toHaveText(`Updated ${monthDay(0)} · community-sourced`);
      });
    });
  }
}
