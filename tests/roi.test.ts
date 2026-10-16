import { describe, expect, it } from "vitest";
import { afYear, cardRoi, cardUtilization, nextAfDate } from "@/lib/domain/roi";
import type { BenefitUsage } from "@/lib/domain/types";
import { benefit, card, catalog, holding } from "./fixtures";

const demo = card({
  id: "demo-premium",
  annual_fee: { amount: 400, first_year_waived: false, source_url: "https://example.com", last_verified: "2026-01-01", verified: true },
  benefits: [
    benefit({ id: "travel", cycle: "cardmember_year", anniversary_basis: "approval", amount: 200 }),
    benefit({ id: "dining", cycle: "semiannual", amount: 50 }),
    benefit({ id: "rides", cycle: "monthly", amount: 10 }),
    benefit({ id: "bag", kind: "perk", cycle: "per_use", amount: null, unit: "count", perk_default: "demo-bag" }),
    benefit({ id: "insurance", kind: "protection", cycle: "none", amount: null, unit: null, protection: { coverage: "x", conditions: [], how_to_claim: null } }),
  ],
});
const cat = catalog({
  cards: [demo],
  perkDefaults: [
    { id: "demo-bag", name: "Bag", value_usd: 30, basis: "test", source_url: "https://example.com", last_verified: "2026-01-01", verified: true },
  ],
});
const h = holding({ id: "h1", catalogCardId: "demo-premium", approvalDate: "2025-03-10", afMonth: 4, afDay: 1 });

let n = 0;
const use = (benefitId: string, amount: number, date: string, periodKey: string, valueOverride: number | null = null): BenefitUsage => ({
  id: `u${n++}`,
  holdingId: "h1",
  benefitId,
  periodKey,
  amount,
  valueOverride,
  date,
  note: null,
});

describe("AF year & next AF date", () => {
  it("uses the actual AF posting month/day", () => {
    expect(afYear(h, "2026-10-16")).toEqual({ start: "2026-04-01", end: "2027-03-31" });
    expect(afYear(h, "2026-03-31")).toEqual({ start: "2025-04-01", end: "2026-03-31" });
    expect(nextAfDate(h, "2026-10-16")).toEqual({ date: "2027-04-01", estimated: false });
    expect(nextAfDate(h, "2026-04-01")).toEqual({ date: "2026-04-01", estimated: false });
  });

  it("falls back to the approval anniversary (estimated)", () => {
    const noAf = holding({ id: "x", approvalDate: "2024-02-29" });
    expect(nextAfDate(noAf, "2026-01-10")).toEqual({ date: "2026-02-28", estimated: true });
    expect(afYear(noAf, "2026-03-01")).toEqual({ start: "2026-02-28", end: "2027-02-27" });
  });
});

describe("ROI", () => {
  const usages = [
    use("travel", 120, "2026-05-01", "cm-2026-03"),
    use("dining", 50, "2026-06-20", "2026-H1"),
    use("dining", 20, "2026-08-02", "2026-H2"),
    use("bag", 2, "2026-07-04", "per-use"), // 2 × $30 default
    use("bag", 1, "2026-09-04", "per-use", 45), // overridden value
    use("dining", 50, "2026-02-01", "2026-H1"), // previous AF year — excluded
  ];

  it("sums credits and perk values in the current AF year vs AF", () => {
    const r = cardRoi(h, demo, usages, cat, { perkValueOverrides: {} }, "2026-10-16");
    expect(r.realized).toBe(120 + 50 + 20 + 60 + 45);
    expect(r.annualFee).toBe(400);
    expect(r.net).toBe(295 - 400);
    expect(r.ratio).toBe(0.74);
    expect(r.breakdown.find((b) => b.benefitId === "bag")).toMatchObject({ value: 105, uses: 2 });
  });

  it("applies settings perk overrides", () => {
    const r = cardRoi(h, demo, usages, cat, { perkValueOverrides: { "demo-bag": 35 } }, "2026-10-16");
    expect(r.realized).toBe(120 + 50 + 20 + 70 + 45);
  });

  it("no-fee cards have no ratio", () => {
    const free = { ...demo, annual_fee: { ...demo.annual_fee, amount: 0 } };
    expect(cardRoi(h, free, [], cat, { perkValueOverrides: {} }, "2026-10-16").ratio).toBeNull();
  });
});

describe("utilization", () => {
  it("is credit value used / available in current periods", () => {
    const usages = [
      use("travel", 50, "2026-05-01", "cm-2026-03"),
      use("dining", 60, "2026-08-02", "2026-H2"), // capped at 50
      use("rides", 10, "2026-09-01", "2026-09"), // last month: not this cycle
    ];
    const u = cardUtilization(h, demo, usages, "2026-10-16");
    expect(u.available).toBe(260);
    expect(u.used).toBe(100);
    expect(u.pct).toBeCloseTo(100 / 260);
  });
});
