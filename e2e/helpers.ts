import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

/** Replace all data with examples/demo-seed.json (fake demo data). */
export async function importDemo(page: Page) {
  await page.goto("/settings");
  await page.getByLabel("Replace all my data").check();
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Import JSON file").setInputFiles(path.join(__dirname, "..", "examples", "demo-seed.json"));
  await expect(page.getByRole("status")).toContainText("Imported 5 card(s)");
}

/** Navigate and wait until the client has loaded its data and rendered the page heading. */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  // Phone and desktop layouts share the DOM; the heading that shows depends on the width.
  await expect(page.locator("main h1:visible").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** The open sheet (bottom sheet on phones, side panel on desktop). */
export const sheet = (page: Page) => page.getByTestId("sheet");

/** Wait for the sheet's slide-in to finish (so its geometry is final). */
export async function sheetSettled(page: Page) {
  await expect(sheet(page)).toBeVisible();
  await sheet(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
}

/**
 * Swipe a row left with real touch input (CDP touch events → pointer events,
 * pointerType "touch"). The page must run with `hasTouch: true`.
 */
export async function touchSwipeLeft(page: Page, target: Locator, distance = 200) {
  const box = (await target.boundingBox())!;
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width - 30;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 - (distance * i) / 10, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  // Let the row snap, and let Chromium's gesture detector settle: a tap a few ms after a fling is swallowed.
  await page.waitForTimeout(400);
}

/** Same gesture with a mouse drag (pointerType "mouse"). */
export async function mouseSwipeLeft(page: Page, target: Locator, distance = 200) {
  const box = (await target.boundingBox())!;
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width - 30;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x0 - distance / 2, y, { steps: 6 });
  await page.mouse.move(x0 - distance, y, { steps: 6 });
  await page.mouse.up();
}
