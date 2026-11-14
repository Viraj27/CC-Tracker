import { describe, expect, it } from "vitest";
import type { Rule } from "@/lib/catalog/schema";
import { buildAttention } from "@/lib/domain/attention";
import { cardRoi } from "@/lib/domain/roi";
import { checkApplication } from "@/lib/domain/rules";
import { splitAttention } from "@/lib/domain/skips";
import type { WelcomeOffer } from "@/lib/domain/types";
import { DEFAULT_SETTINGS } from "@/lib/domain/types";
import { cardChip, cardHeadline } from "@/lib/domain/wallet";
import {
  bonusLabel,
  bonusLogEntry,
  closeGuard,
  expectedPostBy,
  leftToSpend,
  offerDeadline,
  offerStatus,
  offerValue,
  roiBonus,
} from "@/lib/domain/welcomeBonus";
import { buildExport, EXPORT_VERSION, ImportError, parseImport } from "@/lib/importExport";
import { card, catalog, holding, userData } from "./fixtures";

// Welcome bonus (docs/SPEC-v6-welcome-bonus.md). Fake demo data only.

const prov = { source_url: "https://example.com/terms", last_verified: "2026-01-01", verified: true };
const offer = (over: Partial<WelcomeOffer> = {}): WelcomeOffer => ({
  id: "wo1",
  holdingId: "h1",
  bonusAmount: 60000,
  bonusUnit: "points",
  program: null,
  minSpend: 3000,
  windowMonths: 3,
  deadline: null,
  spentSoFar: null,
  spentAsOf: null,
  metDate: null,
  postedDate: null,
  postedAmount: null,
  outcome: null,
  note: null,
  ...over,
});
const guardRule = {
  id: "general-bonus-close-guard",
  name: "Close guard",
  issuer: "any",
  effect: "close",
  description: "demo",
  check: { type: "bonus_clawback_window", months: 12 },
  source_type: "community",
  note: "demo",
  ...prov,
} as Rule;
const demoCard = card({ id: "demo-card", annual_fee: { amount: 0, first_year_waived: false, ...prov } });
const cat = catalog({ cards: [demoCard], rules: [guardRule] });
const h1 = holding({ id: "h1", catalogCardId: "demo-card", approvalDate: "2026-09-14" });
const data = (o: WelcomeOffer | null, over = {}) => userData({ holdings: [h1], welcomeOffers: o ? [o] : [], ...over });
const upNext = (o: WelcomeOffer, today: string) => buildAttention(cat, data(o), today).filter((a) => a.kind === "sub" || a.kind === "subpost");

describe("deadline", () => {
  it("is the approval date plus the window, marked as an estimate", () => {
    expect(offerDeadline(offer(), h1)).toEqual({ date: "2026-12-14", estimated: true });
  });
  it("clamps to the month's end, leap years included", () => {
    expect(offerDeadline(offer(), { approvalDate: "2026-11-30" })?.date).toBe("2027-02-28");
    expect(offerDeadline(offer(), { approvalDate: "2027-11-30" })?.date).toBe("2028-02-29");
    expect(offerDeadline(offer({ windowMonths: 1 }), { approvalDate: "2026-01-31" })?.date).toBe("2026-02-28");
  });
  it("an exact date overrides the estimate; neither set → null", () => {
    expect(offerDeadline(offer({ deadline: "2026-12-20" }), h1)).toEqual({ date: "2026-12-20", estimated: false });
    expect(offerDeadline(offer({ windowMonths: null }), h1)).toBeNull();
  });
});

describe("status", () => {
  const today = "2026-11-22";
  it("posted → missed → met → overdue → earning", () => {
    expect(offerStatus(offer(), h1, today)).toBe("earning");
    expect(offerStatus(offer(), h1, "2026-12-14")).toBe("earning");
    expect(offerStatus(offer(), h1, "2026-12-15")).toBe("overdue");
    expect(offerStatus(offer({ metDate: "2026-11-01" }), h1, "2026-12-15")).toBe("met");
    expect(offerStatus(offer({ metDate: "2026-11-01", outcome: "missed" }), h1, today)).toBe("missed");
    expect(offerStatus(offer({ metDate: "2026-11-01", outcome: "missed", postedDate: "2026-11-20" }), h1, today)).toBe("posted");
  });
  it("an offer with no minimum spend only waits to post, from the approval date", () => {
    const o = offer({ minSpend: null, windowMonths: null });
    expect(offerStatus(o, h1, today)).toBe("met");
    expect(expectedPostBy(o, h1, DEFAULT_SETTINGS)).toBe("2026-11-09");
  });
  it("without a deadline it is never overdue", () => {
    expect(offerStatus(offer({ windowMonths: null }), h1, "2030-01-01")).toBe("earning");
  });
});

describe("left to spend, label and value", () => {
  it("left to spend uses 'spent so far' only when it is set", () => {
    expect(leftToSpend(offer())).toBe(3000);
    expect(leftToSpend(offer({ spentSoFar: 1800 }))).toBe(1200);
    expect(leftToSpend(offer({ spentSoFar: 5000 }))).toBe(0);
    expect(leftToSpend(offer({ minSpend: null }))).toBeNull();
  });
  it("labels points, miles and cash", () => {
    expect(bonusLabel(offer())).toBe("60K pts");
    expect(bonusLabel(offer({ bonusAmount: 62500, bonusUnit: "miles" }))).toBe("62.5K mi");
    expect(bonusLabel(offer({ bonusAmount: 200, bonusUnit: "usd" }))).toBe("$200");
    expect(bonusLabel(offer({ postedAmount: 50000 }), true)).toBe("50K pts");
  });
  it("values points at the owner's cents per point, the default without one, cash at face value", () => {
    expect(offerValue(offer(), demoCard, cat, { centsPerPoint: {} })).toBe(600);
    expect(offerValue(offer(), demoCard, cat, { centsPerPoint: { "test-points": 1.5 } })).toBe(900);
    expect(offerValue(offer({ postedAmount: 50000 }), demoCard, cat, { centsPerPoint: { "test-points": 1.5 } })).toBe(750);
    expect(offerValue(offer({ bonusAmount: 200, bonusUnit: "usd" }), demoCard, cat, { centsPerPoint: {} })).toBe(200);
    // A custom card with no program: nothing to value points with.
    expect(offerValue(offer(), null, cat, { centsPerPoint: {} })).toBeNull();
    expect(offerValue(offer({ program: "test-cash" }), null, cat, { centsPerPoint: {} })).toBe(600);
  });
});

describe("Up next", () => {
  it("shows the deadline within the lead time, urgent in the last week", () => {
    expect(upNext(offer(), "2026-11-13")).toEqual([]);
    const [a] = upNext(offer(), "2026-11-14");
    expect(a).toMatchObject({ id: "sub:h1:2026-12-14", kind: "sub", short: "Spend $3,000", amountText: "60K pts", daysUntil: 30, date: "2026-12-14", severity: "warning", mute: null });
    expect(upNext(offer(), "2026-12-07")[0].severity).toBe("critical");
  });
  it("words the row from 'spent so far'", () => {
    expect(upNext(offer({ spentSoFar: 1800 }), "2026-12-01")[0].short).toBe("Spend $1,200 more");
    expect(upNext(offer({ spentSoFar: 3000 }), "2026-12-01")[0].short).toBe("Confirm bonus met");
  });
  it("an overdue deadline stays 14 days, then drops out", () => {
    expect(upNext(offer(), "2026-12-15")[0]).toMatchObject({ short: "Deadline passed", daysUntil: -1, severity: "critical" });
    expect(upNext(offer(), "2026-12-28")).toHaveLength(1);
    expect(upNext(offer(), "2026-12-29")).toEqual([]);
  });
  it("Met removes the deadline; 56 days later 'Bonus not posted' shows until Posted", () => {
    const met = offer({ metDate: "2026-11-20" });
    expect(upNext(met, "2026-12-01")).toEqual([]);
    expect(upNext(met, "2027-01-14")).toEqual([]);
    const [a] = upNext(met, "2027-01-15");
    expect(a).toMatchObject({ id: "subpost:h1:2026-11-20", kind: "subpost", short: "Bonus not posted", amountText: "60K pts", date: "2027-01-15", mute: null });
    expect(upNext(met, "2027-06-01")).toHaveLength(1);
    expect(upNext({ ...met, postedDate: "2027-01-20" }, "2027-06-01")).toEqual([]);
    expect(upNext({ ...met, outcome: "missed" }, "2027-06-01")).toEqual([]);
  });
  it("lead times come from Settings", () => {
    const d = data(offer(), { settings: { ...DEFAULT_SETTINGS, subLeadDays: 60, subPostingDays: 10 } });
    expect(buildAttention(cat, d, "2026-10-20").some((a) => a.kind === "sub")).toBe(true);
    const met = data(offer({ metDate: "2026-11-20" }), { settings: { ...DEFAULT_SETTINGS, subPostingDays: 10 } });
    expect(buildAttention(cat, met, "2026-11-30").some((a) => a.kind === "subpost")).toBe(true);
  });
  it("can be skipped one occurrence at a time, never muted", () => {
    const d = data(offer());
    const items = buildAttention(cat, d, "2026-12-01");
    const sub = items.find((a) => a.kind === "sub")!;
    const split = splitAttention(items, [{ id: "d1", date: "2026-12-01", ...sub.occurrence }], []);
    expect(split.visible.some((a) => a.kind === "sub")).toBe(false);
    expect(split.hidden.map((x) => x.reason.type)).toEqual(["skip"]);
    // A changed deadline is a new occurrence.
    const moved = buildAttention(cat, data(offer({ deadline: "2026-12-20" })), "2026-12-01");
    expect(splitAttention(moved, [{ id: "d1", date: "2026-12-01", ...sub.occurrence }], []).visible.some((a) => a.kind === "sub")).toBe(true);
  });
  it("closed cards have no bonus rows", () => {
    const closed = userData({ holdings: [{ ...h1, status: "closed" }], welcomeOffers: [offer()] });
    expect(buildAttention(cat, closed, "2026-12-01")).toEqual([]);
  });
  it("drives the Wallet chip and headline", () => {
    const items = buildAttention(cat, data(offer()), "2026-11-22");
    expect(cardChip(h1, items)).toBe("BONUS · 22D");
    expect(cardHeadline({ holding: h1, attention: items, unusedCredits: 0, fee: 0, realized: 0 })).toBe("Spend $3,000 in 22 days for the 60K pts welcome bonus.");
    expect(cardChip(h1, buildAttention(cat, data(offer()), "2026-12-16"))).toBe("BONUS LATE");
    expect(cardChip(h1, buildAttention(cat, data(offer({ metDate: "2026-11-01" })), "2027-02-01"))).toBe("BONUS DUE");
  });
});

describe("close guard", () => {
  it("warns until 12 months after opening while the bonus is posted or pending", () => {
    expect(closeGuard(offer({ postedDate: "2026-12-03" }), h1, cat, "2027-03-01")).toMatchObject({ until: "2027-09-14", postedDate: "2026-12-03" });
    expect(closeGuard(offer(), h1, cat, "2026-11-01")).toMatchObject({ until: "2027-09-14", postedDate: null });
    expect(closeGuard(offer({ postedDate: "2026-12-03" }), h1, cat, "2027-09-14")).toBeNull();
  });
  it("not for a missed bonus, a card without an offer, a closed card or a catalog without the rule", () => {
    expect(closeGuard(offer({ outcome: "missed" }), h1, cat, "2026-11-01")).toBeNull();
    expect(closeGuard(null, h1, cat, "2026-11-01")).toBeNull();
    expect(closeGuard(offer(), { ...h1, status: "closed" }, cat, "2026-11-01")).toBeNull();
    expect(closeGuard(offer(), h1, catalog({ cards: [demoCard] }), "2026-11-01")).toBeNull();
  });
});

describe("ROI and lifecycle", () => {
  const settings = { ...DEFAULT_SETTINGS };
  it("a posted bonus is a one-time line in the AF year it posted in, left out of the total by default", () => {
    const posted = offer({ postedDate: "2026-12-03" });
    const b = roiBonus(posted, h1, demoCard, cat, settings, [], "2027-01-10");
    expect(b).toEqual({ value: 600, label: "60K pts", counted: false });
    expect(cardRoi(h1, demoCard, [], cat, settings, "2027-01-10", b).realized).toBe(0);
    expect(cardRoi(h1, demoCard, [], cat, settings, "2027-01-10", b).bonus).toEqual(b);
    // The next AF year no longer lists it.
    expect(roiBonus(posted, h1, demoCard, cat, settings, [], "2027-10-01")).toBeNull();
    expect(roiBonus(offer(), h1, demoCard, cat, settings, [], "2027-01-10")).toBeNull();
  });
  it("counts in the total when the setting is on", () => {
    const on = { ...settings, countBonusInRoi: true };
    const b = roiBonus(offer({ postedDate: "2026-12-03" }), h1, demoCard, cat, on, [], "2027-01-10");
    expect(b?.counted).toBe(true);
    expect(cardRoi(h1, demoCard, [], cat, on, "2027-01-10", b).realized).toBe(600);
  });
  it("the lifecycle entry appears once the offer is settled", () => {
    expect(bonusLogEntry(offer(), h1)).toBeNull();
    expect(bonusLogEntry(offer({ postedDate: "2026-12-03", postedAmount: 50000 }), h1)).toEqual({ date: "2026-12-03", text: "Bonus posted 50K pts" });
    expect(bonusLogEntry(offer({ outcome: "missed" }), h1)).toEqual({ date: "2026-12-14", text: "Bonus missed" });
  });
});

describe("bonus rules use the posted date", () => {
  const r48 = {
    id: "demo-48",
    name: "demo-48",
    issuer: "testbank",
    effect: "bonus",
    description: "demo",
    check: { type: "family_window", family: "fam-a", months: 48, blocks_if_currently_held: false },
    applies_to: { families: ["fam-a"] },
    ...prov,
  } as Rule;
  const famA = card({ id: "fam-a-card", family: "fam-a" });
  const c = catalog({ cards: [famA], rules: [r48, guardRule] });
  const held = [holding({ id: "a", catalogCardId: "fam-a-card", approvalDate: "2024-03-15" })];
  it("counts from the opening date until a posted bonus is recorded", () => {
    const before = checkApplication(famA, held, c, "2026-10-18");
    expect(before.bonus.eligibleFrom).toBe("2028-03-15");
    expect(before.evaluations[0].reasons.join(" ")).toMatch(/stand-in/);
    const after = checkApplication(famA, held, c, "2026-10-18", { nll: false, offers: [offer({ holdingId: "a", postedDate: "2024-06-20" })] });
    expect(after.bonus.eligibleFrom).toBe("2028-06-20");
    expect(after.evaluations[0].reasons.join(" ")).toMatch(/bonus posted Jun 20, 2024/);
    expect(after.evaluations[0].reasons.join(" ")).toMatch(/Counted from the dates the welcome bonuses posted/);
  });
  it("the close-guard rule never shows in Should I apply?", () => {
    expect(checkApplication(famA, held, c, "2026-10-18").evaluations.map((e) => e.rule.id)).toEqual(["demo-48"]);
  });
});

describe("import / export", () => {
  const file = {
    holdings: [
      { id: "demo-h1", nickname: "Demo", approvalDate: "2026-09-14", welcomeOffer: { bonusAmount: 60000, bonusUnit: "points", minSpend: 3000, windowMonths: 3, metDate: "2026-11-20" } },
      { id: "demo-h2", nickname: "Demo 2", approvalDate: "2025-01-15" },
    ],
  };
  it("round-trips the offer nested under its holding, with a deterministic id", () => {
    const { data: d } = parseImport(file);
    expect(d.welcomeOffers).toHaveLength(1);
    expect(d.welcomeOffers[0]).toMatchObject({ holdingId: "demo-h1", bonusAmount: 60000, metDate: "2026-11-20", postedDate: null, outcome: null });
    expect(parseImport(JSON.parse(JSON.stringify(file))).data.welcomeOffers[0].id).toBe(d.welcomeOffers[0].id);
    const exported = JSON.parse(JSON.stringify(buildExport(d, "2026-11-12T00:00:00Z")));
    expect(exported.version).toBe(EXPORT_VERSION);
    expect(EXPORT_VERSION).toBe(4);
    expect(exported.holdings[0].welcomeOffer).not.toHaveProperty("holdingId");
    expect(exported.holdings[1].welcomeOffer).toBeNull();
    expect(parseImport(exported).data).toEqual(d);
  });
  it("older exports import with no offers and the default bonus settings", () => {
    const v3 = { format: "cc-tracker-export", version: 3, holdings: [{ nickname: "Demo", approvalDate: "2025-01-15" }], settings: { afLeadDays: 30 } };
    const { data: d } = parseImport(v3);
    expect(d.welcomeOffers).toEqual([]);
    expect(d.settings).toMatchObject({ afLeadDays: 30, subLeadDays: 30, subPostingDays: 56, countBonusInRoi: false });
  });
  it("validates the offer and the new skip kinds", () => {
    const bad = (h: object) => () => parseImport({ holdings: [{ nickname: "Demo", approvalDate: "2025-01-15", ...h }] });
    expect(bad({ welcomeOffer: { bonusAmount: 0, bonusUnit: "points" } })).toThrow(ImportError);
    expect(bad({ welcomeOffer: { bonusAmount: 100, bonusUnit: "gold" } })).toThrow(ImportError);
    expect(bad({ skips: [{ kind: "sub", period: "2026-12-14", date: "2026-12-01" }] })).not.toThrow();
  });
});
