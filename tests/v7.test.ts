/** v7 phone feedback pass (docs/SPEC-v7-phone-feedback.md). Fake data only. */
import { describe, expect, it } from "vitest";
import type { Rule } from "@/lib/catalog/schema";
import { buildAttention } from "@/lib/domain/attention";
import { rankCards } from "@/lib/domain/bestCard";
import { periodRange } from "@/lib/domain/dates";
import { enrollmentView, lapseDate } from "@/lib/domain/enrollment";
import { canLogOn, computePeriod, creditView, nextPeriod } from "@/lib/domain/periods";
import { checkApplication, rulesForCard } from "@/lib/domain/rules";
import { splitAttention } from "@/lib/domain/skips";
import type { BenefitEnrollment, BenefitUsage } from "@/lib/domain/types";
import { buildExport, parseImport } from "@/lib/importExport";
import { benefit, card, catalog, holding, userData } from "./fixtures";

const prov = { source_url: "https://example.com", last_verified: "2026-01-01", verified: true };
const h = holding({ id: "h1", catalogCardId: "demo" });
const use = (benefitId: string, periodKey: string, amount: number, date: string): BenefitUsage => ({
  id: `u-${benefitId}-${periodKey}-${amount}`,
  holdingId: "h1",
  benefitId,
  periodKey,
  amount,
  valueOverride: null,
  date,
  note: null,
});

describe("periods: next period and range labels", () => {
  it("nextPeriod rolls over year boundaries", () => {
    expect(nextPeriod("semiannual", computePeriod("semiannual", "2026-10-18"))).toMatchObject({ key: "2027-H1", start: "2027-01-01" });
    expect(nextPeriod("monthly", computePeriod("monthly", "2026-12-05"))).toMatchObject({ key: "2027-01" });
    expect(nextPeriod("quarterly", computePeriod("quarterly", "2026-11-01"))).toMatchObject({ key: "2027-Q1" });
    const anchor = { month: 6, day: 12 };
    expect(nextPeriod("cardmember_year", computePeriod("cardmember_year", "2026-10-18", anchor), anchor)).toMatchObject({
      key: "cm-2027-06",
      start: "2027-06-12",
    });
    expect(nextPeriod("per_use", computePeriod("per_use", "2026-10-18"))).toBeNull();
  });

  it("periodRange adds the year only when it isn't today's", () => {
    expect(periodRange("2026-07-01", "2026-12-31", "2026-10-18")).toBe("JUL–DEC");
    expect(periodRange("2027-01-01", "2027-06-30", "2026-10-18")).toBe("JAN–JUN 2027");
    expect(periodRange("2026-10-01", "2026-10-31", "2026-10-18")).toBe("OCT");
    expect(periodRange("2026-06-12", "2027-06-11", "2026-10-18")).toBe("JUN 2026–JUN 2027");
  });
});

describe("creditView: greyed-out upcoming periods", () => {
  const stubhub = benefit({ id: "tix", cycle: "semiannual", amount: 150, ends_on: "2027-12-31" });

  it("open while value is left", () => {
    expect(creditView(stubhub, h, [use("tix", "2026-H2", 50, "2026-08-01")], "2026-10-18")).toMatchObject({ state: "open", opensOn: null });
  });

  it("used up → shows the next half, opening Jan 1", () => {
    const v = creditView(stubhub, h, [use("tix", "2026-H2", 150, "2026-08-01")], "2026-10-18");
    expect(v.state).toBe("used_upcoming");
    expect(v.shown.key).toBe("2027-H1");
    expect(v.opensOn).toBe("2027-01-01");
    expect(v.status.remaining).toBe(0);
  });

  it("monthly and cardmember-year credits behave the same way", () => {
    const m = benefit({ id: "m", cycle: "monthly", amount: 10 });
    expect(creditView(m, h, [use("m", "2026-10", 10, "2026-10-02")], "2026-10-18")).toMatchObject({ state: "used_upcoming", opensOn: "2026-11-01" });
    const cm = benefit({ id: "cm", cycle: "cardmember_year", anniversary_basis: "approval", amount: 300 });
    // Approval 2025-01-15 → cardmember year Jan 15 – Jan 14.
    expect(creditView(cm, h, [use("cm", "cm-2026-01", 300, "2026-03-01")], "2026-10-18")).toMatchObject({
      state: "used_upcoming",
      opensOn: "2027-01-15",
    });
  });

  it("used up in the benefit's last period → used_final", () => {
    expect(creditView(stubhub, h, [use("tix", "2027-H2", 150, "2027-08-01")], "2027-10-01").state).toBe("used_final");
  });

  it("ends mid-period → still the current period until it ends, then ended", () => {
    const lyft = benefit({ id: "ly", cycle: "monthly", amount: 10, ends_on: "2027-09-30" });
    expect(creditView(lyft, h, [use("ly", "2027-09", 10, "2027-09-02")], "2027-09-10").state).toBe("used_final");
    expect(creditView(lyft, h, [], "2027-10-01").state).toBe("ended");
  });

  it("starts_on in the future → not_started, opening on that date", () => {
    const later = benefit({ id: "later", cycle: "calendar_year", amount: 100, starts_on: "2027-01-01" });
    expect(creditView(later, h, [], "2026-10-18")).toMatchObject({ state: "not_started", opensOn: "2027-01-01" });
  });

  it("per-use credits are always open", () => {
    const ge = benefit({ id: "ge", cycle: "per_use", amount: 120 });
    expect(creditView(ge, h, [use("ge", "per-use", 120, "2026-01-01")], "2026-10-18").state).toBe("open");
  });

  it("canLogOn: today blocked when used up; a back-dated use into a period with value left is allowed", () => {
    const usages = [use("tix", "2026-H2", 150, "2026-08-01")];
    expect(canLogOn(stubhub, h, usages, "2026-10-18", "2026-10-18")).toBe(false);
    expect(canLogOn(stubhub, h, usages, "2026-03-10", "2026-10-18")).toBe(true);
    expect(canLogOn(stubhub, h, [...usages, use("tix", "2026-H1", 150, "2026-03-10")], "2026-03-10", "2026-10-18")).toBe(false);
    expect(canLogOn(stubhub, h, [], "2026-10-19", "2026-10-18")).toBe(false);
  });
});

describe("enrollment", () => {
  const enr = (benefitId: string, enrolledOn: string, id = `e-${benefitId}-${enrolledOn}`): BenefitEnrollment => ({
    id,
    holdingId: "h1",
    benefitId,
    enrolledOn,
  });

  it("not required, or tracked on the Rotating page → none", () => {
    expect(enrollmentView(benefit({ id: "a", cycle: "monthly" }), h, [], "2026-10-18").state).toBe("none");
    const rot = benefit({ id: "r", cycle: "quarterly", enrollment_required: true, enrollment_lasts: "rotating" });
    expect(enrollmentView(rot, h, [], "2026-10-18").state).toBe("none");
  });

  it("needed until marked; holding enrollments never lapse", () => {
    const b = benefit({ id: "tix", cycle: "semiannual", enrollment_required: true });
    expect(enrollmentView(b, h, [], "2026-10-18").state).toBe("needed");
    expect(enrollmentView(b, h, [enr("tix", "2025-11-01")], "2030-01-01")).toMatchObject({ state: "enrolled", lapsesOn: null });
  });

  it("period / calendar_year / months lapse dates", () => {
    const semi = benefit({ id: "s", cycle: "semiannual", enrollment_required: true, enrollment_lasts: "period" });
    expect(lapseDate(semi, h, "2026-08-01")).toBe("2027-01-01");
    const cal = benefit({ id: "c", cycle: "monthly", enrollment_required: true, enrollment_lasts: "calendar_year" });
    expect(lapseDate(cal, h, "2026-03-05")).toBe("2027-01-01");
    const months = benefit({ id: "m", cycle: "none", enrollment_required: true, enrollment_lasts: { months: 12 } });
    expect(lapseDate(months, h, "2026-10-18")).toBe("2027-10-18");
    expect(enrollmentView(cal, h, [enr("c", "2026-03-05")], "2026-12-31").state).toBe("enrolled");
    expect(enrollmentView(cal, h, [enr("c", "2026-03-05")], "2027-01-01").state).toBe("lapsed");
  });

  it("the latest enrollment wins", () => {
    const cal = benefit({ id: "c", cycle: "monthly", enrollment_required: true, enrollment_lasts: "calendar_year" });
    const v = enrollmentView(cal, h, [enr("c", "2026-03-05"), enr("c", "2027-01-03")], "2027-02-01");
    expect(v).toMatchObject({ state: "enrolled", lapsesOn: "2028-01-01" });
  });

  describe("Re-enroll in Up next", () => {
    const rideshare = benefit({ id: "ride", cycle: "monthly", amount: 5, enrollment_required: true, enrollment_lasts: "calendar_year" });
    const cat = catalog({ cards: [card({ id: "demo", annual_fee: { amount: 0, first_year_waived: false, ...prov }, benefits: [rideshare] })] });
    const items = (today: string, over: Partial<ReturnType<typeof userData>> = {}) =>
      buildAttention(cat, userData({ holdings: [h], enrollments: [enr("ride", "2026-02-01")], ...over }), today).filter((a) => a.kind === "enroll");

    it("appears creditLeadDays before the lapse date, not earlier", () => {
      expect(items("2026-11-30")).toHaveLength(0);
      const [a] = items("2026-12-02");
      expect(a).toMatchObject({ short: "Re-enroll: Test ride", date: "2027-01-01", daysUntil: 30, mute: { kind: "benefit", benefitId: "ride" } });
    });

    it("stays once lapsed, until marked enrolled again", () => {
      expect(items("2027-02-10")[0].daysUntil).toBeLessThan(0);
      expect(items("2027-02-10", { enrollments: [enr("ride", "2026-02-01"), enr("ride", "2027-02-10")] })).toHaveLength(0);
    });

    it("never-enrolled benefits don't nag; skip and the benefit's mute hide it", () => {
      expect(items("2027-02-10", { enrollments: [] })).toHaveLength(0);
      const all = buildAttention(cat, userData({ holdings: [h], enrollments: [enr("ride", "2026-02-01")] }), "2026-12-15");
      const item = all.find((a) => a.kind === "enroll")!;
      const skipped = splitAttention(all, [{ id: "d", ...item.occurrence, date: "2026-12-15" }], []);
      expect(skipped.visible.some((a) => a.kind === "enroll")).toBe(false);
      const muted = splitAttention(all, [], [{ id: "m", holdingId: "h1", kind: "benefit", benefitId: "ride", date: "2026-12-15" }]);
      expect(muted.visible.some((a) => a.kind === "enroll")).toBe(false);
    });
  });
});

describe("Should I apply?", () => {
  const rule = (over: Partial<Rule> & Pick<Rule, "id" | "check" | "effect">): Rule =>
    ({ name: over.id, issuer: "testbank", description: "demo", ...prov, ...over }) as Rule;
  const r524 = rule({
    id: "demo-5-24",
    effect: "approval",
    check: { type: "x_in_y", max_new_accounts: 1, window_months: 24, counted_account_types: ["personal"], business_counted_issuers: [], counted_issuers: null },
  });
  const r48 = rule({
    id: "demo-48",
    effect: "bonus",
    check: { type: "family_window", family: "fam-a", months: 48, blocks_if_currently_held: false },
    applies_to: { families: ["fam-a"] },
  });
  const rLife = rule({
    id: "demo-life",
    effect: "bonus",
    check: { type: "lifetime_family", families: ["fam-b"] },
    applies_to: { families: ["fam-b"] },
    nll_waiver: { source_type: "community", note: "demo data points" },
  });
  const rBiz = rule({ id: "demo-biz", effect: "approval", check: { type: "manual" }, applies_to: { account_types: ["business"] } });
  const famA = card({ id: "fam-a-card", family: "fam-a" });
  const famB = card({ id: "fam-b-card", family: "fam-b" });
  const other = card({ id: "other-card", issuer: "otherbank" });
  const cat = catalog({ cards: [famA, famB, other], rules: [r524, r48, rLife, rBiz] });

  it("rulesForCard: issuer-wide by default, narrowed by families and account types", () => {
    expect(rulesForCard(famA, cat.rules).map((r) => r.id)).toEqual(["demo-5-24", "demo-48"]);
    expect(rulesForCard(famB, cat.rules).map((r) => r.id)).toEqual(["demo-5-24", "demo-life"]);
    expect(rulesForCard(other, cat.rules)).toEqual([]);
    expect(rulesForCard(card({ id: "biz", account_type: "business" }), cat.rules).map((r) => r.id)).toEqual(["demo-5-24", "demo-biz"]);
  });

  it("verdicts: pass with no history; no rules → none", () => {
    const c = checkApplication(famA, [], cat, "2026-10-18");
    expect(c.approval.outcome).toBe("pass");
    expect(c.bonus.outcome).toBe("pass");
    expect(checkApplication(other, [], cat, "2026-10-18").evaluations).toEqual([]);
  });

  it("family window fail carries an eligible-from date", () => {
    const held = [holding({ id: "a", catalogCardId: "fam-a-card", approvalDate: "2024-03-15" })];
    const c = checkApplication(famA, held, cat, "2026-10-18");
    expect(c.bonus).toMatchObject({ outcome: "fail", eligibleFrom: "2028-03-15" });
    expect(c.bonus.rules.map((r) => r.id)).toEqual(["demo-48"]);
  });

  it("x_in_y fail carries the drop-off date", () => {
    const opened = [
      holding({ id: "x1", catalogCardId: "other-card", approvalDate: "2025-05-01" }),
      holding({ id: "x2", catalogCardId: "other-card", approvalDate: "2026-02-01" }),
    ];
    const c = checkApplication(famA, opened, cat, "2026-10-18");
    expect(c.approval).toMatchObject({ outcome: "fail", eligibleFrom: "2027-05-01" });
  });

  it("NLL toggle waives only rules with an nll_waiver", () => {
    const had = [holding({ id: "b", catalogCardId: "fam-b-card", approvalDate: "2019-01-01", status: "closed", closedDate: "2021-01-01" })];
    const off = checkApplication(famB, had, cat, "2026-10-18");
    expect(off.nllApplies).toBe(true);
    expect(off.bonus).toMatchObject({ outcome: "fail", eligibleFrom: null });
    const on = checkApplication(famB, had, cat, "2026-10-18", { nll: true });
    expect(on.bonus.outcome).toBe("pass");
    expect(on.evaluations.find((e) => e.rule.id === "demo-life")!.waived).toBe(true);
    expect(checkApplication(famA, had, cat, "2026-10-18", { nll: true }).nllApplies).toBe(false);
  });
});

describe("Best card: portal vs. direct rows", () => {
  const reserve = card({
    id: "demo-reserve",
    name: "Demo Reserve",
    earn_rates: [
      { categories: ["travel", "airfare", "hotels"], label: "Demo Travel portal", rate: 8, unit: "points_per_dollar", channel: "portal", portal_name: "Demo Travel", ...prov },
      { categories: ["airfare", "hotels"], label: "Flights and hotels booked direct", rate: 4, unit: "points_per_dollar", channel: "direct", ...prov },
      { categories: ["other"], label: "Everything else", rate: 1, unit: "points_per_dollar", ...prov },
    ],
  });
  const flatPortal = card({
    id: "demo-flat",
    name: "Demo Flat",
    earn_rates: [
      { categories: ["airfare"], label: "Portal flights", rate: 2, unit: "points_per_dollar", channel: "portal", portal_name: "Flat Travel", ...prov },
      { categories: ["other"], label: "Everything", rate: 2, unit: "points_per_dollar", ...prov },
    ],
  });
  const cat = catalog({ cards: [reserve, flatPortal] });
  const holdings = [holding({ id: "res", catalogCardId: "demo-reserve" }), holding({ id: "flat", catalogCardId: "demo-flat" })];
  const rank = (c: "airfare" | "travel" | "dining") => rankCards(c, holdings, cat, { centsPerPoint: {} }, [], "2026-10-18");

  it("a portal rate that beats the direct rate gets its own row; both rows are ranked", () => {
    expect(rank("airfare").map((r) => [r.holdingId, r.channel, r.rate])).toEqual([
      ["res", "portal", 8],
      ["res", "off", 4],
      ["flat", "off", 2],
    ]);
    const [portal, direct] = rank("airfare");
    expect(portal).toMatchObject({ portalName: "Demo Travel" });
    expect(portal.bookedDirect).toBeUndefined();
    expect(direct).toMatchObject({ bookedDirect: true, label: "Flights and hotels booked direct" });
  });

  it("a portal rate equal to the direct rate → one row", () => {
    expect(rank("airfare").filter((r) => r.holdingId === "flat")).toHaveLength(1);
  });

  it("off-portal falls back to the everything-else rate", () => {
    expect(rank("travel").find((r) => r.holdingId === "res" && r.channel === "off")).toMatchObject({ rate: 1, bookedDirect: true });
  });

  it("categories without a portal rate are unchanged", () => {
    expect(rank("dining").map((r) => r.channel)).toEqual(["off", "off"]);
  });
});

describe("export v3: enrollments", () => {
  it("round-trips enrollments; older files import with none", () => {
    const file = {
      holdings: [{ catalogCardId: "demo", approvalDate: "2025-01-15", enrollments: [{ benefitId: "tix", enrolledOn: "2026-10-18" }] }],
    };
    const { data } = parseImport(file);
    expect(data.enrollments).toHaveLength(1);
    expect(data.enrollments[0]).toMatchObject({ holdingId: data.holdings[0].id, benefitId: "tix" });
    const again = parseImport(JSON.parse(JSON.stringify(buildExport(data, "2026-10-18T00:00:00Z"))));
    expect(again.data).toEqual(data);
    expect(parseImport({ version: 2, holdings: [{ catalogCardId: "demo", approvalDate: "2025-01-15" }] }).data.enrollments).toEqual([]);
  });

  it("accepts enroll skips", () => {
    const file = {
      holdings: [{ catalogCardId: "demo", approvalDate: "2025-01-15", skips: [{ kind: "enroll", benefitId: "ride", period: "2027-01-01", date: "2026-12-15" }] }],
    };
    expect(parseImport(file).data.dismissals[0].kind).toBe("enroll");
  });
});
