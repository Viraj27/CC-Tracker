import { expect, test } from "@playwright/test";
import { gotoReady, importDemo, mouseSwipeLeft, sheet, sheetSettled } from "./helpers";

// WCAG AA text contrast: every visible text run (and input placeholder) against the
// background it is actually painted on, in both colour schemes, with disclosures and
// every ⓘ open, on the list surface, in sheets and with a swiped Up next row.
const PAGES = [
  "/",
  "/?card=demo-reserve",
  "/cards/demo-reserve",
  "/up-next",
  "/eligibility",
  "/apply",
  "/payments",
  "/rotating",
  "/best-card",
  "/points",
  "/settings",
  "/more",
  "/cards",
];

type Hit = { color: string; bg: string; ratio: number; text: string; where: string };

test.describe("contrast", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const [label, width] of [
      ["desktop", 1280],
      ["390", 390],
    ] as const) {
      test(`${scheme} ${label}: text ≥ 4.5:1 on its background`, async ({ page }) => {
        test.setTimeout(240_000);
        await importDemo(page);
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.setViewportSize({ width, height: 900 });
        const failures: Hit[] = [];
        const check = async (where: string) => {
          // Open every disclosure and every ⓘ (provenance, screen help) before measuring.
          await page.evaluate(() => {
            document.querySelectorAll("details").forEach((d) => (d.open = true));
            document.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"][aria-label="Source"], button[aria-expanded="false"][aria-label="About this screen"]').forEach((b) => b.click());
          });
          const hits: Hit[] = await page.evaluate(measure);
          if (process.env.CONTRAST_REPORT) console.log(JSON.stringify({ scheme, label, where, hits }));
          failures.push(...hits.filter((h) => h.ratio < 4.5).map((h) => ({ ...h, where: `${where} ${h.where}` })));
        };
        for (const p of PAGES) {
          await gotoReady(page, p);
          await check(p);
        }

        // Sheets (docs/SPEC-v5-app-pass.md §3.4): a credit, a drill-in list and a benefit, ROI, rotating, an Up next item.
        const openSheet = async (where: string, open: () => Promise<void>) => {
          await open();
          await sheetSettled(page);
          await check(where);
          await page.keyboard.press("Escape");
          await expect(sheet(page)).toHaveCount(0);
        };
        await gotoReady(page, "/cards/demo-reserve");
        await openSheet("credit sheet", () => page.getByRole("button", { name: "Lyft in-app credit", exact: true }).click());
        await openSheet("ROI sheet", () => page.getByTestId("roi-panel").click());
        for (const list of ["perks", "protections", "earn", "downgrade", "fees", "lifecycle"]) {
          await openSheet(`${list} sheet`, () => page.getByTestId(`drill-${list}`).click());
        }
        await openSheet("edit sheet", () => page.getByRole("button", { name: "Edit", exact: true }).click());
        await gotoReady(page, "/cards/demo-flex");
        await openSheet("rotating sheet", () => page.getByTestId("rotating-row").click());

        // v7 (docs/SPEC-v7-phone-feedback.md): a verdict on Should I apply?, and StubHub used up
        // (greyed row, sheet with the disabled "Opens …" pill and the enrollment line).
        await gotoReady(page, "/apply");
        await page.getByTestId("apply-card").selectOption("capital-one-venture-x");
        await expect(page.getByTestId("verdict-bonus")).toBeVisible();
        await check("/apply (verdict)");
        await gotoReady(page, "/cards/demo-reserve");
        await page.getByRole("button", { name: "StubHub / viagogo credit", exact: true }).click();
        await sheetSettled(page);
        await sheet(page).getByRole("button", { name: "Log $150" }).click();
        await expect(sheet(page).getByTestId("log-primary")).toBeDisabled();
        await check("StubHub sheet (used up)");
        await page.keyboard.press("Escape");
        await expect(sheet(page)).toHaveCount(0);
        await expect(page.getByTestId("credit-sub-stubhub-credit")).toHaveAttribute("data-state", /^used_/);
        await check("/cards/demo-reserve (StubHub greyed)");

        // Up next: a swiped row (Skip + action showing), an item sheet, and the greyed skipped list (docs/SPEC-v4.1-skip.md).
        await gotoReady(page, "/up-next");
        const lyft = "Demo Reserve: $10 Lyft in-app credit left";
        const row = page.getByTestId("up-next-item").filter({ has: page.getByRole("button", { name: lyft, exact: true }) });
        await mouseSwipeLeft(page, row.getByTestId("up-next-row"));
        await expect(row).toHaveAttribute("data-open", "true");
        await check("/up-next (row swiped)");
        await row.getByTestId("up-next-row").click(); // a tap closes the open row
        await expect(row).not.toHaveAttribute("data-open", "true");
        await openSheet("item sheet", () => page.getByTestId("attention-list").getByRole("button", { name: "Demo Reserve: Payment due", exact: true }).click());
        await row.getByTestId("up-next-row").click();
        await sheet(page).getByRole("button", { name: `Skip this month — ${lyft}` }).click();
        await page.getByTestId("show-skipped").click();
        await expect(page.getByTestId("skipped-item")).toBeVisible();
        await check("/up-next (skipped shown)");
        expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
      });
    }
  }
});

// Runs in the page. Returns one entry per distinct (text colour, background) pair, at its lowest ratio.
function measure(): Hit[] {
  type RGBA = [number, number, number, number];
  const ctx = document.createElement("canvas").getContext("2d")!;
  const parse = (c: string): RGBA => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = c; // normalises oklab/oklch/color-mix etc. to sRGB
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top: RGBA, under: RGBA): RGBA => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1) as RGBA;
  };
  const lum = (c: RGBA) => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: RGBA, b: RGBA) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const hex = (c: RGBA) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // Background actually behind an element: composite translucent layers down to the first opaque one.
  const background = (el: Element): RGBA => {
    const layers: RGBA[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    let out: RGBA = layers.at(-1)?.[3] === 1 ? layers.pop()! : [255, 255, 255, 1];
    while (layers.length) out = over(layers.pop()!, out);
    return out;
  };
  const opacity = (el: Element) => {
    let o = 1;
    for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };
  const describe = (el: Element) => {
    const cls = typeof el.className === "string" ? el.className.split(" ").slice(0, 4).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`;
  };

  const pairs = new Map<string, Hit>();
  const record = (fg: RGBA, el: Element, text: string, alpha: number) => {
    const bg = background(el);
    const ink = over([fg[0], fg[1], fg[2], fg[3] * alpha], bg);
    const r = Math.round(ratio(ink, bg) * 100) / 100;
    const key = `${hex(ink)}|${hex(bg)}`;
    const prev = pairs.get(key);
    if (!prev || r < prev.ratio) pairs.set(key, { color: hex(ink), bg: hex(bg), ratio: r, text: text.slice(0, 40), where: describe(el) });
  };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent?.trim();
    const el = n.parentElement;
    if (!text || !el || el.closest("script,style,noscript,[aria-hidden=true]")) continue;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!rect.width || !rect.height || cs.visibility === "hidden" || el.closest("[hidden]")) continue;
    const o = opacity(el);
    if (o === 0 || (el as HTMLElement).closest("button:disabled")) continue; // disabled controls are exempt
    record(parse(cs.color), el, text, o);
  }
  document.querySelectorAll("input[placeholder],textarea[placeholder]").forEach((el) => {
    if (!(el as HTMLElement).offsetParent) return;
    record(parse(getComputedStyle(el, "::placeholder").color), el, `placeholder: ${el.getAttribute("placeholder")}`, opacity(el));
  });
  return [...pairs.values()].sort((a, b) => a.ratio - b.ratio);
}
