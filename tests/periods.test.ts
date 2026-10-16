import { describe, expect, it } from "vitest";
import { addMonths, anniversaryInYear } from "@/lib/domain/dates";
import { benefitAnchor, benefitStatus, computePeriod } from "@/lib/domain/periods";
import { benefit, holding } from "./fixtures";

describe("computePeriod", () => {
  it("monthly: calendar month", () => {
    expect(computePeriod("monthly", "2026-02-10")).toEqual({
      key: "2026-02",
      start: "2026-02-01",
      end: "2026-02-28",
      expiry: "2026-02-28",
    });
  });

  it("monthly: February in a leap year ends on the 29th", () => {
    expect(computePeriod("monthly", "2028-02-29").end).toBe("2028-02-29");
  });

  it("quarterly: calendar quarters", () => {
    expect(computePeriod("quarterly", "2026-10-16")).toMatchObject({ key: "2026-Q4", start: "2026-10-01", end: "2026-12-31" });
    expect(computePeriod("quarterly", "2026-03-31")).toMatchObject({ key: "2026-Q1", start: "2026-01-01", end: "2026-03-31" });
    expect(computePeriod("quarterly", "2026-04-01")).toMatchObject({ key: "2026-Q2", end: "2026-06-30" });
  });

  it("semiannual: Jan–Jun and Jul–Dec", () => {
    expect(computePeriod("semiannual", "2026-06-30")).toMatchObject({ key: "2026-H1", start: "2026-01-01", end: "2026-06-30" });
    expect(computePeriod("semiannual", "2026-07-01")).toMatchObject({ key: "2026-H2", start: "2026-07-01", end: "2026-12-31" });
  });

  it("calendar_year: Jan 1 – Dec 31, rolls over on Jan 1", () => {
    expect(computePeriod("calendar_year", "2026-12-31")).toMatchObject({ key: "2026", end: "2026-12-31" });
    expect(computePeriod("calendar_year", "2027-01-01")).toMatchObject({ key: "2027", start: "2027-01-01" });
  });

  it("period rollover on Jan 1 for every calendar cycle", () => {
    expect(computePeriod("monthly", "2027-01-01").key).toBe("2027-01");
    expect(computePeriod("quarterly", "2027-01-01").key).toBe("2027-Q1");
    expect(computePeriod("semiannual", "2027-01-01").key).toBe("2027-H1");
    expect(computePeriod("monthly", "2026-12-31").key).toBe("2026-12");
  });

  it("cardmember_year: anniversary to day before next anniversary", () => {
    const p = computePeriod("cardmember_year", "2026-10-16", { month: 6, day: 12 });
    expect(p).toEqual({ key: "cm-2026-06", start: "2026-06-12", end: "2027-06-11", expiry: "2027-06-11" });
    const before = computePeriod("cardmember_year", "2026-06-11", { month: 6, day: 12 });
    expect(before).toMatchObject({ key: "cm-2025-06", start: "2025-06-12", end: "2026-06-11" });
    const onDay = computePeriod("cardmember_year", "2026-06-12", { month: 6, day: 12 });
    expect(onDay.key).toBe("cm-2026-06");
  });

  it("cardmember_year: Feb 29 approval anniversaries clamp to Feb 28 in non-leap years", () => {
    const anchor = { month: 2, day: 29 };
    expect(computePeriod("cardmember_year", "2025-03-01", anchor)).toMatchObject({
      start: "2025-02-28",
      end: "2026-02-27",
    });
    expect(computePeriod("cardmember_year", "2028-02-28", anchor)).toMatchObject({
      start: "2027-02-28",
      end: "2028-02-28",
    });
    expect(computePeriod("cardmember_year", "2028-02-29", anchor)).toMatchObject({
      key: "cm-2028-02",
      start: "2028-02-29",
      end: "2029-02-27",
    });
  });

  it("cardmember_year: approvals on the 31st clamp in short months", () => {
    expect(anniversaryInYear(1, 31, 2026)).toBe("2026-01-31");
    expect(computePeriod("cardmember_year", "2026-02-15", { month: 1, day: 31 })).toMatchObject({
      start: "2026-01-31",
      end: "2027-01-30",
    });
  });

  it("cardmember_year: approval on Dec 31 rolls across the year boundary", () => {
    expect(computePeriod("cardmember_year", "2027-01-01", { month: 12, day: 31 })).toMatchObject({
      key: "cm-2026-12",
      start: "2026-12-31",
      end: "2027-12-30",
    });
  });

  it("non-periodic cycles never expire", () => {
    expect(computePeriod("one_time", "2026-05-05")).toEqual({ key: "once", start: null, end: null, expiry: null });
    expect(computePeriod("per_use", "2026-05-05").expiry).toBeNull();
    expect(computePeriod("none", "2026-05-05").expiry).toBeNull();
  });
});

describe("addMonths", () => {
  it("clamps month-end dates", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2024-02-29", 24)).toBe("2026-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
});

describe("benefitAnchor", () => {
  it("uses approval date or AF date per the benefit", () => {
    const h = holding({ id: "h1", approvalDate: "2024-03-20", afMonth: 4, afDay: 2 });
    expect(benefitAnchor(benefit({ id: "a", cycle: "cardmember_year", anniversary_basis: "approval" }), h)).toEqual({ month: 3, day: 20 });
    expect(benefitAnchor(benefit({ id: "b", cycle: "cardmember_year", anniversary_basis: "af_date" }), h)).toEqual({ month: 4, day: 2 });
    // AF basis without an AF date falls back to approval.
    const noAf = holding({ id: "h2", approvalDate: "2024-03-20" });
    expect(benefitAnchor(benefit({ id: "c", cycle: "cardmember_year", anniversary_basis: "af_date" }), noAf)).toEqual({ month: 3, day: 20 });
  });
});

describe("benefitStatus", () => {
  const h = holding({ id: "h1" });
  const b = benefit({ id: "dining", cycle: "semiannual", amount: 150 });
  const use = (amount: number, periodKey: string, id = String(Math.random())) => ({
    id,
    holdingId: "h1",
    benefitId: "dining",
    periodKey,
    amount,
    valueOverride: null,
    date: "2026-08-01",
    note: null,
  });

  it("partial use reduces remaining; multiple entries add up", () => {
    const s = benefitStatus(b, h, [use(40, "2026-H2"), use(35.5, "2026-H2")], "2026-10-16");
    expect(s).toMatchObject({ available: 150, used: 75.5, remaining: 74.5, daysToExpiry: 76 });
  });

  it("ignores usage from other periods, holdings and benefits", () => {
    const other = { ...use(50, "2026-H2"), holdingId: "h2" };
    const s = benefitStatus(b, h, [use(100, "2026-H1"), other, { ...use(20, "2026-H2"), benefitId: "x" }], "2026-10-16");
    expect(s.remaining).toBe(150);
  });

  it("remaining never goes negative", () => {
    expect(benefitStatus(b, h, [use(200, "2026-H2")], "2026-10-16").remaining).toBe(0);
  });

  it("respects benefit end dates", () => {
    const ending = benefit({ id: "dining", cycle: "calendar_year", amount: 100, ends_on: "2026-11-30" });
    const s = benefitStatus(ending, h, [], "2026-10-16");
    expect(s.period.expiry).toBe("2026-11-30");
    expect(benefitStatus(ending, h, [], "2026-12-01").active).toBe(false);
  });
});
