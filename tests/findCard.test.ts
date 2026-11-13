import { describe, expect, it } from "vitest";
import type { Card, EarnRate, PublicOffer, Rule } from "@/lib/catalog/schema";
import { loadCatalog } from "@/lib/catalog/loader";
import { criteriaOf, DEFAULT_CRITERIA, everydayUplift, findCards, isElevated, matchesCriteria, offerLine, reachOf, situationText, yearlyCredits } from "@/lib/domain/findCard";
import { monthlySpend } from "@/lib/domain/spend";
import { DEFAULT_SETTINGS, type FindCardCriteria } from "@/lib/domain/types";
import { buildExport, EXPORT_VERSION, parseImport } from "@/lib/importExport";
import { benefit, card, catalog, holding, userData } from "./fixtures";

// Find a card (docs/SPEC-v8-find-a-card.md). Invented cards and numbers only.

const prov = { source_url: "https://example.com/terms", last_verified: "2026-01-01", verified: true };
const TODAY = "2026-11-13";
const offer = (over: Partial<PublicOffer> = {}): PublicOffer => ({ bonus: 60000, unit: "points", min_spend: 4000, days: 90, as_of: "2026-06-08", source_url: "https://example.com/offers", ...over });
const rate = (categories: EarnRate["categories"], r: number, over: Partial<EarnRate> = {}): EarnRate => ({ categories, label: categories.join(", "), rate: r, unit: "points_per_dollar", ...prov, ...over }) as EarnRate;
const fee = (amount: number, first_year_waived = false) => ({ amount, first_year_waived, ...prov });
const programs = [
  { id: "test-points", name: "Test Points", kind: "points" as const, default_cents_per_point: 1 },
  { id: "test-cash", name: "Test Cash", kind: "cash" as const, default_cents_per_point: 1 },
  { id: "hotel-points", name: "Hotel Points", kind: "points" as const, default_cents_per_point: 0.5 },
];
const mk = (id: string, over: Partial<Card> = {}) => card({ id, name: id, public_offer: offer(), annual_fee: fee(95), ...over });
const held = mk("held", { earn_rates: [rate(["dining"], 3), rate(["other"], 1)] });
const cat = (cards: Card[], rules: Rule[] = []) => catalog({ cards: [held, ...cards], rules, programs });
const data = (over: Parameters<typeof userData>[0] = {}, spend: Record<string, number> = { dining: 500, groceries: 600, other: 900 }) =>
  userData({ holdings: [holding({ id: "h1", catalogCardId: "held", approvalDate: "2025-01-10" })], ...over, settings: { ...DEFAULT_SETTINGS, spendProfile: spend, ...(over.settings ?? {}) } });
const find = (cards: Card[], criteria: Partial<FindCardCriteria> = {}, d = data(), rules: Rule[] = []) => findCards(cat(cards, rules), d, criteriaOf(criteria), TODAY);
const ids = (xs: { card: Card }[]) => xs.map((x) => x.card.id);

describe("bonus value", () => {
  it("uses the catalog default, the owner's Settings value, then the Points balance value", () => {
    const c = [mk("a")];
    expect(find(c).ranked[0]).toMatchObject({ bonusValue: 600, bonusCpp: 1, firstYearFee: 95, netBonus: 505 });
    expect(find(c, {}, data({ settings: { ...DEFAULT_SETTINGS, centsPerPoint: { "test-points": 1.5 } } })).ranked[0]).toMatchObject({ bonusValue: 900, netBonus: 805 });
    const withBalance = data({ points: [{ id: "p", program: "test-points", balance: 1000, asOf: TODAY, centsPerPoint: 2 }], settings: { ...DEFAULT_SETTINGS, centsPerPoint: { "test-points": 1.5 } } });
    expect(find(c, {}, withBalance).ranked[0]).toMatchObject({ bonusValue: 1200, bonusCpp: 2 });
  });
  it("cash is face value, whatever the card's program is worth", () => {
    const c = [mk("cash", { rewards_program: "hotel-points", public_offer: offer({ bonus: 200, unit: "usd", min_spend: 500 }), annual_fee: fee(0) })];
    expect(find(c).ranked[0]).toMatchObject({ bonusValue: 200, bonusCpp: 100, netBonus: 200 });
  });
  it("hotel points use their lower default", () => {
    expect(find([mk("hotel", { rewards_program: "hotel-points", public_offer: offer({ bonus: 150000 }) })]).ranked[0]).toMatchObject({ bonusValue: 750, netBonus: 655 });
  });
  it("a waived first year costs nothing in year one; the ongoing fee is kept for everyday value", () => {
    expect(find([mk("w", { annual_fee: fee(95, true) })]).ranked[0]).toMatchObject({ firstYearFee: 0, annualFee: 95, netBonus: 600 });
  });
  it("no public offer: nothing to value", () => {
    expect(find([mk("none", { public_offer: undefined })]).ranked[0]).toMatchObject({ bonusValue: null, netBonus: null, reach: null });
  });
});

describe("reachability", () => {
  it("≤ 100% of monthly spend is reachable, up to 150% a stretch, above that out of reach", () => {
    expect(reachOf(6000, 90, 2000)).toMatchObject({ state: "reachable", neededPerMonth: 2000, monthlySpend: 2000 });
    expect(reachOf(6000, 90, 1999)).toMatchObject({ state: "stretch" });
    expect(reachOf(9000, 90, 2000)).toMatchObject({ state: "stretch", neededPerMonth: 3000 });
    expect(reachOf(9001, 90, 2000)).toMatchObject({ state: "out" });
    expect(reachOf(6000, 180, 1000)).toMatchObject({ state: "reachable", neededPerMonth: 1000 });
  });
  it("is not judged without a spend profile; no minimum is always reachable; a missing window assumes 90 days", () => {
    expect(reachOf(4000, 90, 0)).toBeNull();
    expect(reachOf(null, 90, 500)).toMatchObject({ state: "reachable", neededPerMonth: 0 });
    expect(reachOf(3000, null, 1000)).toMatchObject({ state: "reachable", days: 90, assumedDays: true });
    expect(find([mk("a")], {}, data({}, {})).ranked[0].reach).toBeNull();
    expect(monthlySpend({ dining: 500, other: 900 })).toBe(1400);
  });
});

describe("everyday uplift", () => {
  const d = data(); // dining 500, groceries 600, other 900 a month; holds 3x dining / 1x other
  it("counts only what beats the best open card, per category, over a year", () => {
    const c = mk("grocer", { earn_rates: [rate(["groceries"], 4), rate(["dining"], 2), rate(["other"], 1)] });
    const u = everydayUplift(c, d, cat([c]))!;
    expect(u.rows.find((r) => r.category === "groceries")).toMatchObject({ candidateCents: 4, bestCents: 1, bestName: "held", value: 216 }); // 600 × 12 × 3¢
    expect(u.rows.find((r) => r.category === "dining")).toMatchObject({ candidateCents: 2, bestCents: 3, value: 0 }); // worse: never negative
    expect(u.rows.find((r) => r.category === "other")!.value).toBe(0);
    expect(u.total).toBe(216);
    expect(u.rows[0].category).toBe("groceries"); // biggest first
  });
  it("compares against the best of several open cards, each valued with its own program", () => {
    const second = mk("second", { earn_rates: [rate(["groceries"], 6)], rewards_program: "hotel-points" }); // 6 × 0.5¢ = 3¢
    const c = mk("grocer", { earn_rates: [rate(["groceries"], 4), rate(["other"], 1)] });
    const two = data({ holdings: [holding({ id: "h1", catalogCardId: "held", approvalDate: "2025-01-10" }), holding({ id: "h2", catalogCardId: "second", approvalDate: "2025-02-10" })] });
    const u = everydayUplift(c, two, cat([second, c]))!;
    expect(u.rows.find((r) => r.category === "groceries")).toMatchObject({ candidateCents: 4, bestCents: 3, bestName: "second", value: 72 });
  });
  it("ignores portal-only rates and closed cards; is null for a stub; empty without a profile", () => {
    const portal = mk("portal", { earn_rates: [rate(["groceries"], 10, { channel: "portal", portal_name: "Demo Travel" } as Partial<EarnRate>), rate(["other"], 1)] });
    expect(everydayUplift(portal, d, cat([portal]))!.total).toBe(0);
    const closed = data({ holdings: [holding({ id: "h1", catalogCardId: "held", approvalDate: "2025-01-10", status: "closed" })] });
    const c = mk("dine", { earn_rates: [rate(["dining"], 3), rate(["other"], 1)] });
    expect(everydayUplift(c, closed, cat([c]))!.rows.find((r) => r.category === "dining")).toMatchObject({ bestCents: 0, bestName: null, value: 180 });
    expect(everydayUplift(mk("stub", { earn_rates: [] }), d, cat([]))).toBeNull();
    expect(everydayUplift(c, data({}, {}), cat([c]))).toEqual({ total: 0, rows: [] });
  });
  it("credits are listed per year but never counted", () => {
    const c = mk("credits", { benefits: [benefit({ id: "m", cycle: "monthly", amount: 10 }), benefit({ id: "y", cycle: "calendar_year", amount: 300 }), benefit({ id: "p", cycle: "per_use", amount: 50 })] });
    expect(yearlyCredits(c, TODAY)).toBe(420);
    expect(yearlyCredits(mk("none"), TODAY)).toBeNull();
    const [r] = find([c]).ranked;
    expect(r.credits).toBe(420);
    expect(r.netBonus).toBe(505); // unchanged by credits
  });
});

describe("order", () => {
  const cards = [
    mk("big-out", { public_offer: offer({ bonus: 200000, min_spend: 30000 }) }), // 10,000/mo
    mk("stretch", { public_offer: offer({ bonus: 100000, min_spend: 8000 }) }), // 2,667/mo vs 2,000
    mk("small", { public_offer: offer({ bonus: 20000, min_spend: 500 }), annual_fee: fee(0) }),
    mk("good", { public_offer: offer({ bonus: 75000, min_spend: 4000 }) }),
    mk("no-offer", { public_offer: undefined }),
  ];
  it("welcome bonus: net value, reachable before stretch before out of reach, no offer last (acceptance 3)", () => {
    const r = find(cards);
    expect(ids(r.ranked)).toEqual(["good", "small", "stretch", "big-out", "no-offer"]);
    expect(r.ranked.map((c) => c.reach?.state ?? null)).toEqual(["reachable", "reachable", "stretch", "out", null]);
  });
  it("without a profile it ranks on the bonus alone", () => {
    expect(ids(find(cards, {}, data({}, {})).ranked)).toEqual(["big-out", "stretch", "good", "small", "no-offer"]);
  });
  it("everyday value: uplift minus the ongoing fee; cards with no earn rates last", () => {
    const every = [
      mk("grocer", { earn_rates: [rate(["groceries"], 4), rate(["other"], 1)], annual_fee: fee(95, true) }), // 216 − 95 (waiver ignored)
      mk("flat2", { earn_rates: [rate(["other"], 2)], annual_fee: fee(0) }), // groceries 600×12×1¢ + other 900×12×1¢ = 180
      mk("stub", { earn_rates: [] }),
    ];
    const r = find(every, { goal: "everyday" });
    expect(ids(r.ranked)).toEqual(["flat2", "grocer", "stub"]);
    expect(r.ranked.map((c) => c.netEveryday)).toEqual([180, 121, null]);
  });
});

describe("candidates, criteria and eligibility", () => {
  const biz = mk("biz", { account_type: "business" });
  const cashCard = mk("cashy", { rewards_program: "test-cash", annual_fee: fee(0), issuer: "otherbank" });
  const pricey = mk("pricey", { annual_fee: fee(550) });
  const all = [biz, cashCard, pricey, mk("plain")];

  it("lists only cards with no open holding; a closed one can come back (acceptance 1)", () => {
    expect(ids(find(all, { accountType: "both" }).ranked)).not.toContain("held");
    const closed = data({ holdings: [holding({ id: "h1", catalogCardId: "held", approvalDate: "2025-01-10", status: "closed" })] });
    expect(ids(find(all, { accountType: "both" }, closed).ranked)).toContain("held");
  });
  it("Card type, Points in, Annual fee and Issuers filter both groups (acceptance 2)", () => {
    expect(ids(find(all).ranked).sort()).toEqual(["cashy", "plain", "pricey"]); // personal by default
    expect(ids(find(all, { accountType: "business" }).ranked)).toEqual(["biz"]);
    expect(ids(find(all, { program: "cash" }).ranked)).toEqual(["cashy"]);
    expect(ids(find(all, { program: "test-points" }).ranked).sort()).toEqual(["plain", "pricey"]);
    expect(ids(find(all, { maxFee: 100 }).ranked).sort()).toEqual(["cashy", "plain"]);
    expect(ids(find(all, { maxFee: 0 }).ranked)).toEqual(["cashy"]);
    expect(ids(find(all, { excludedIssuers: ["otherbank"] }).ranked).sort()).toEqual(["plain", "pricey"]);
    expect(matchesCriteria(biz, DEFAULT_CRITERIA, cat(all))).toBe(false);
    expect(criteriaOf({ goal: "everyday" })).toEqual({ ...DEFAULT_CRITERIA, goal: "everyday" });
  });

  const rule = (over: Partial<Rule>): Rule => ({ id: "r", name: "Demo rule", issuer: "testbank", effect: "bonus", description: "d", check: { type: "manual" }, ...prov, ...over }) as Rule;
  it("a failing rule moves the card to Not right now with its reason and date", () => {
    const fam = mk("again", { family: "demo-fam" });
    const heldFam = mk("held-fam", { family: "demo-fam" });
    const r = rule({ name: "Demo 48 months", check: { type: "family_window", family: "demo-fam", months: 48, blocks_if_currently_held: false }, applies_to: { families: ["demo-fam"] } });
    const d = data({ holdings: [holding({ id: "h1", catalogCardId: "held-fam", approvalDate: "2025-01-10", status: "closed", closedDate: "2026-01-10" })] });
    const res = findCards(catalog({ cards: [heldFam, fam, mk("free")], rules: [r], programs }), d, criteriaOf({}), TODAY);
    expect(ids(res.ranked)).toEqual(["free"]);
    expect(res.notNow.map((c) => [c.card.id, c.eligibility.state, c.eligibility.reasons, c.eligibility.eligibleFrom])).toEqual([
      ["again", "blocked", ["Demo 48 months"], "2029-01-10"],
      ["held-fam", "blocked", ["Demo 48 months"], "2029-01-10"],
    ]);
  });
  it("a manual rule keeps the card ranked with CHECK; no rules at all is said so", () => {
    const res = find([mk("a")], {}, data(), [rule({ name: "Read this" })]);
    expect(res.ranked[0].eligibility).toMatchObject({ state: "check", reasons: ["Read this"], noRules: false });
    expect(find([mk("a")]).ranked[0].eligibility).toMatchObject({ state: "ok", noRules: true });
  });
  it("shows the 5/24 cost for a card that would count", () => {
    expect(find([mk("a")]).ranked[0].fiveTwentyFour).toEqual({ after: 2, limit: 5 });
    expect(find([biz], { accountType: "business" }).ranked[0].fiveTwentyFour).toBeNull();
  });
});

describe("elevated offers, notices and text", () => {
  it("elevated needs three earlier offers and a bonus above their median", () => {
    expect(isElevated(80000, [60000, 60000])).toBe(false);
    expect(isElevated(80000, [60000, 60000, 75000])).toBe(true);
    expect(isElevated(60000, [60000, 60000, 75000])).toBe(false);
    expect(isElevated(70000, [50000, 60000, 80000, 90000])).toBe(false); // median 70,000
    const res = findCards(cat([mk("a", { public_offer: offer({ bonus: 80000 }) })]), data(), criteriaOf({}), TODAY, { a: [60000, 60000, 75000] });
    expect(res.ranked[0].elevated).toBe(true);
  });
  it("names the programs still on the catalog's default value, and the newest offer date", () => {
    const cards = [mk("a"), mk("h", { rewards_program: "hotel-points", public_offer: offer({ as_of: "2026-07-01" }) }), mk("c", { rewards_program: "test-cash", public_offer: offer({ bonus: 200, unit: "usd" }) })];
    const res = find(cards);
    expect(res.defaultValued).toEqual(["Hotel Points", "Test Points"]);
    expect(res.newestAsOf).toBe("2026-07-01");
    expect(find(cards, {}, data({ settings: { ...DEFAULT_SETTINGS, centsPerPoint: { "test-points": 1.4, "hotel-points": 0.6 } } })).defaultValued).toEqual([]);
  });
  it("offer line", () => {
    expect(offerLine(mk("a"))).toBe("60K pts · $4,000 in 3 mo");
    expect(offerLine(mk("a", { public_offer: offer({ bonus: 62500, unit: "miles", days: 180 }) }))).toBe("62.5K mi · $4,000 in 6 mo");
    expect(offerLine(mk("a", { public_offer: offer({ bonus: 200, unit: "usd", min_spend: null }) }))).toBe("$200 · no minimum spend");
    expect(offerLine(mk("a", { public_offer: undefined }))).toBe("No public offer on file");
  });
  it("Copy my situation is plain text with cards, 5/24, spend, criteria and the top five", () => {
    const c = cat([mk("good"), mk("small", { public_offer: offer({ bonus: 20000, min_spend: 500 }) })]);
    const d = data({ points: [{ id: "p", program: "test-points", balance: 12345, asOf: TODAY, centsPerPoint: null }] });
    const criteria = criteriaOf({});
    const text = situationText(c, d, criteria, findCards(c, d, criteria, TODAY), TODAY);
    expect(text).toContain("Open cards (1):");
    expect(text).toContain("- held (personal), opened 2025-01-10, $95 annual fee");
    expect(text).toContain("5/24: 1/24, next drops off 2027-01-10");
    expect(text).toContain("- Test Points: 12,345 (valued at 1¢ each)");
    expect(text).toContain("Rough monthly spend (total $2,000):");
    expect(text).toContain("- groceries: $600");
    expect(text).toContain("Looking for: personal cards; goal: welcome bonus; points in: any; annual fee: no limit");
    expect(text).toContain("1. good: 60K pts · $4,000 in 3 mo; annual fee $95; net first-year value about $505; spend reachable; offer as of 2026-06-08");
    expect(text).not.toMatch(/<|\{|\}/);
  });
});

describe("the real catalog", () => {
  it("ranks without a profile, offers or holdings and errors nowhere (acceptance 5)", () => {
    const real = loadCatalog();
    for (const goal of ["bonus", "everyday"] as const) {
      const res = findCards(real, userData(), criteriaOf({ accountType: "both", goal }), TODAY);
      expect(res.ranked.length + res.notNow.length).toBe(real.cards.length);
      expect(res.monthlySpend).toBe(0);
      expect(res.ranked.every((c) => c.reach === null)).toBe(true);
    }
    const noOffers = { ...real, cards: real.cards.map((c) => ({ ...c, public_offer: undefined })) };
    expect(findCards(noOffers, userData(), criteriaOf({}), TODAY).ranked.every((c) => c.netBonus === null)).toBe(true);
  });
});

describe("import / export", () => {
  it("round-trips the spend profile and the criteria; older files import with empty ones", () => {
    const d = userData({ settings: { ...DEFAULT_SETTINGS, spendProfile: { dining: 500, other: 900 }, findCardCriteria: { goal: "everyday", maxFee: 100, excludedIssuers: ["amex"] } } });
    const exported = JSON.parse(JSON.stringify(buildExport(d, "2026-11-13T00:00:00.000Z")));
    expect(exported.version).toBe(EXPORT_VERSION);
    expect(EXPORT_VERSION).toBe(5);
    expect(parseImport(exported).data.settings).toMatchObject({ spendProfile: { dining: 500, other: 900 }, findCardCriteria: { goal: "everyday", maxFee: 100, excludedIssuers: ["amex"] } });
    const old = parseImport({ version: 4, holdings: [], settings: { afLeadDays: 30 } }).data.settings;
    expect(old.spendProfile).toEqual({});
    expect(old.findCardCriteria).toEqual({});
  });
});
