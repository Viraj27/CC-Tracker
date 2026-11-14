import { describe, expect, it } from "vitest";
import type { AfPolicy, Rule } from "@/lib/catalog/schema";
import { afCycle, bestExit, hasRetentionCall, refundWindow } from "@/lib/domain/annualFee";
import { buildAttention } from "@/lib/domain/attention";
import { splitAttention } from "@/lib/domain/skips";
import type { AnnualFeeEvent, AfOutcome, LifecycleEvent } from "@/lib/domain/types";
import { DEFAULT_SETTINGS } from "@/lib/domain/types";
import { cardChip, cardHeadline } from "@/lib/domain/wallet";
import { closeGuard } from "@/lib/domain/welcomeBonus";
import { buildExport, parseImport } from "@/lib/importExport";
import { card, catalog, holding, userData } from "./fixtures";

// Annual fee, after it posts (docs/SPEC-v6.1-annual-fee-decision.md). Fake demo data only.

const prov = { source_url: "https://example.com/terms", last_verified: "2026-01-01", verified: true };
const policy: AfPolicy = { issuer: "testbank", refund_days: 30, basis: "posting", source_type: "community", note: "demo", ...prov };
const fee = card({ id: "demo-fee", annual_fee: { amount: 795, first_year_waived: false, ...prov } });
const waived = card({ id: "demo-waived", annual_fee: { amount: 95, first_year_waived: true, ...prov } });
const free = card({ id: "demo-free", annual_fee: { amount: 0, first_year_waived: null, ...prov } });
const other = card({ id: "demo-other", issuer: "otherbank", annual_fee: { amount: 95, first_year_waived: false, ...prov } });
const cat = catalog({ cards: [fee, waived, free, other], afPolicies: [policy] });
const h = holding({ id: "h1", catalogCardId: "demo-fee", approvalDate: "2024-11-16" });
const ev = (postedDate: string, outcome: AfOutcome = "pending", over: Partial<AnnualFeeEvent> = {}): AnnualFeeEvent => ({ id: "e1", holdingId: "h1", postedDate, amount: 795, outcome, note: null, ...over });
const life = (date: string, type: LifecycleEvent["type"] = "retention_call"): LifecycleEvent => ({ id: "l1", holdingId: "h1", type, date, offer: null, accepted: null, fromCard: null, toCard: null, details: null });
const cycleOf = (today: string, afEvents: AnnualFeeEvent[] = [], lifecycle: LifecycleEvent[] = [], hold = h) =>
  afCycle(hold, cat.cards.find((c) => c.id === hold.catalogCardId)!, { afEvents, lifecycle }, DEFAULT_SETTINGS, cat, today);
const af = (today: string, over = {}) => buildAttention(cat, userData({ holdings: [h], ...over }), today).filter((a) => a.kind === "af");

describe("phases around the anniversary", () => {
  it("upcoming from the lead time through the anniversary itself", () => {
    expect(cycleOf("2026-10-01")).toBeNull(); // 46 days out
    expect(cycleOf("2026-10-02")).toMatchObject({ phase: "upcoming", date: "2026-11-16", estimated: true });
    expect(cycleOf("2026-11-16")).toMatchObject({ phase: "upcoming", date: "2026-11-16" });
  });

  it("the day after the anniversary the fee is watched for, not dropped (acceptance 1)", () => {
    expect(cycleOf("2026-11-17")).toMatchObject({ phase: "watch", anniversary: "2026-11-16", date: "2026-12-31" });
    const [item] = af("2026-11-17");
    expect(item).toMatchObject({ id: "af:h1:watch@2026-11-16", short: "Watch for fee", amount: 795, afPhase: "watch", date: "2026-12-31", mute: null, href: "/cards/h1#af-history" });
  });

  it("the watch ends on its own after afWatchDays; the next cycle starts as normal", () => {
    expect(cycleOf("2026-12-31")).toMatchObject({ phase: "watch" });
    expect(cycleOf("2027-01-01")).toBeNull();
    expect(cycleOf("2027-10-02")).toMatchObject({ phase: "upcoming", date: "2027-11-16" });
  });

  it("crosses the year end: a December anniversary is watched into January", () => {
    const dec = holding({ id: "h1", catalogCardId: "demo-fee", approvalDate: "2023-12-20" });
    expect(cycleOf("2027-01-15", [], [], dec)).toMatchObject({ phase: "watch", anniversary: "2026-12-20", date: "2027-02-03" });
  });

  it("Feb 29 anniversaries fall on Feb 28 in common years", () => {
    const leap = holding({ id: "h1", catalogCardId: "demo-fee", approvalDate: "2024-02-29" });
    expect(cycleOf("2026-02-28", [], [], leap)).toMatchObject({ phase: "upcoming", date: "2026-02-28" });
    expect(cycleOf("2026-03-01", [], [], leap)).toMatchObject({ phase: "watch", anniversary: "2026-02-28" });
    expect(cycleOf("2028-02-29", [], [], leap)).toMatchObject({ phase: "upcoming", date: "2028-02-29" });
    expect(cycleOf("2028-03-01", [], [], leap)).toMatchObject({ phase: "watch", anniversary: "2028-02-29" });
  });

  it("uses the owner's fee date over the approval date", () => {
    const dated = holding({ id: "h1", catalogCardId: "demo-fee", approvalDate: "2024-11-16", afMonth: 12, afDay: 1 });
    expect(cycleOf("2026-12-02", [], [], dated)).toMatchObject({ phase: "watch", anniversary: "2026-12-01", estimated: false });
  });

  it("no fee, closed cards and custom cards have no cycle", () => {
    expect(cycleOf("2026-11-17", [], [], holding({ id: "h1", catalogCardId: "demo-free", approvalDate: "2024-11-16" }))).toBeNull();
    expect(cycleOf("2026-11-17", [], [], { ...h, status: "closed" })).toBeNull();
    expect(afCycle(h, null, { afEvents: [], lifecycle: [] }, DEFAULT_SETTINGS, cat, "2026-11-17")).toBeNull();
  });
});

describe("posting and deciding", () => {
  it("logging the posting starts the refund window, counted from the post date (acceptance 2)", () => {
    const c = cycleOf("2026-11-20", [ev("2026-11-18")])!;
    expect(c).toMatchObject({ phase: "decide", date: "2026-12-18", anniversary: "2026-11-16" });
    expect(c.window).toMatchObject({ days: 30, source: "catalog", policy });
    const [item] = af("2026-11-20", { afEvents: [ev("2026-11-18")] });
    expect(item).toMatchObject({ id: "af:h1:decide@2026-11-18", short: "Decide by Dec 18", daysUntil: 28, severity: "warning", afPhase: "decide" });
  });

  it("is urgent in the last 5 days and ends when the window closes", () => {
    expect(af("2026-12-12", { afEvents: [ev("2026-11-18")] })[0].severity).toBe("warning");
    expect(af("2026-12-13", { afEvents: [ev("2026-11-18")] })[0].severity).toBe("critical");
    expect(cycleOf("2026-12-18", [ev("2026-11-18")])).toMatchObject({ phase: "decide" });
    expect(cycleOf("2026-12-19", [ev("2026-11-18")])).toBeNull(); // not back to "watch" either
  });

  it.each(["paid", "retention_offer", "downgraded", "closed"] as const)("%s ends the cycle (acceptance 3)", (outcome) => {
    expect(cycleOf("2026-11-20", [ev("2026-11-18", outcome)])).toBeNull();
  });

  it("a fee logged before the anniversary (the old flow) still ends the cycle", () => {
    expect(cycleOf("2026-11-10", [ev("2026-11-05", "paid")])).toBeNull();
    expect(cycleOf("2026-11-17", [ev("2026-11-05", "paid")])).toBeNull();
  });

  it("a retention call clears the upcoming prompt but the fee is still watched for; a closure or product change ends it", () => {
    expect(cycleOf("2026-11-10", [], [life("2026-11-05")])).toBeNull();
    expect(cycleOf("2026-11-17", [], [life("2026-11-05")])).toMatchObject({ phase: "watch" });
    expect(cycleOf("2026-11-17", [], [life("2026-11-05", "product_change")])).toBeNull();
    expect(hasRetentionCall({ anniversary: "2026-11-16" }, "h1", [life("2026-11-05")], DEFAULT_SETTINGS)).toBe(true);
    expect(hasRetentionCall({ anniversary: "2026-11-16" }, "h1", [life("2025-11-05")], DEFAULT_SETTINGS)).toBe(false);
  });

  it("each phase can be skipped on its own and none can be muted (acceptance 4)", () => {
    const items = af("2026-11-17");
    const skipWatch = { id: "d", holdingId: "h1", kind: "af" as const, benefitId: null, period: "watch@2026-11-16", date: "2026-11-17" };
    expect(splitAttention(items, [skipWatch], []).visible).toEqual([]);
    // Skipping the upcoming occurrence does not hide the watch; skipping the watch does not hide the decision.
    expect(splitAttention(items, [{ ...skipWatch, period: "2026-11-16" }], []).visible).toHaveLength(1);
    const decide = af("2026-11-20", { afEvents: [ev("2026-11-18")] });
    expect(splitAttention(decide, [skipWatch], []).visible).toHaveLength(1);
    expect([...items, ...decide].every((a) => a.mute === null)).toBe(true);
  });
});

describe("refund window sources", () => {
  it("falls back to a 30-day placeholder when the issuer has no policy, and says so", () => {
    const o = holding({ id: "h1", catalogCardId: "demo-other", approvalDate: "2024-11-16" });
    expect(refundWindow(o, other, cat)).toEqual({ days: 30, source: "placeholder", policy: null });
    const [item] = buildAttention(cat, userData({ holdings: [o], afEvents: [ev("2026-11-18", "pending", { amount: 95 })] }), "2026-11-20").filter((a) => a.kind === "af");
    expect(item).toMatchObject({ short: "Decide soon", date: "2026-12-18" });
    expect(item.detail).toMatch(/not in the catalog/);
  });

  it("the per-card override wins over the catalog", () => {
    const o = { ...h, afRefundDays: 45 };
    expect(refundWindow(o, fee, cat)).toMatchObject({ days: 45, source: "override", policy });
    expect(cycleOf("2026-11-20", [ev("2026-11-18")], [], o)).toMatchObject({ date: "2027-01-02" });
  });
});

describe("first year waived", () => {
  const w = holding({ id: "h1", catalogCardId: "demo-waived", approvalDate: "2026-11-01" });
  it("nothing to watch at opening when the first year is waived", () => {
    expect(cycleOf("2026-11-01", [], [], w)).toBeNull();
    expect(cycleOf("2026-11-10", [], [], w)).toBeNull();
  });
  it("the first billed fee, a year in, is a normal cycle", () => {
    expect(cycleOf("2027-10-20", [], [], w)).toMatchObject({ phase: "upcoming", date: "2027-11-01" });
    expect(cycleOf("2027-11-02", [], [], w)).toMatchObject({ phase: "watch" });
  });
  it("a card that bills from day one is watched from approval", () => {
    const n = holding({ id: "h1", catalogCardId: "demo-fee", approvalDate: "2026-11-01" });
    expect(cycleOf("2026-11-10", [], [], n)).toMatchObject({ phase: "watch", anniversary: "2026-11-01" });
  });
});

describe("best exit window (with the v6 close guard)", () => {
  const decide = (posted: string, today: string) => cycleOf(today, [ev(posted)]);
  it("guard clears before the refund window ends: a window that keeps the bonus and refunds the fee", () => {
    expect(bestExit("2026-11-30", decide("2026-11-18", "2026-11-20"), "2026-11-20")).toEqual({ type: "window", from: "2026-11-30", to: "2026-12-18" });
    expect(bestExit("2026-11-10", decide("2026-11-18", "2026-11-20"), "2026-11-20")).toEqual({ type: "window", from: "2026-11-20", to: "2026-12-18" });
  });
  it("guard clears after it: no recommendation, just the trade", () => {
    expect(bestExit("2027-01-10", decide("2026-11-18", "2026-11-20"), "2026-11-20")).toEqual({ type: "trade", fee: 795 });
  });
  it("null without a guard or a posted fee", () => {
    expect(bestExit(null, decide("2026-11-18", "2026-11-20"), "2026-11-20")).toBeNull();
    expect(bestExit("2026-11-30", cycleOf("2026-11-17"), "2026-11-17")).toBeNull();
  });
  it("works from a real close guard: a card opened a year ago with a posted bonus", () => {
    const rule = { id: "g", name: "g", issuer: "any", effect: "close", description: "d", check: { type: "bonus_clawback_window", months: 12 }, source_type: "community", note: "n", ...prov } as Rule;
    const young = holding({ id: "h1", catalogCardId: "demo-fee", approvalDate: "2025-12-01", afMonth: 11, afDay: 16 });
    const offer = { id: "o", holdingId: "h1", bonusAmount: 60000, bonusUnit: "points" as const, program: null, minSpend: 4000, windowMonths: 3, deadline: null, spentSoFar: null, spentAsOf: null, metDate: "2026-02-01", postedDate: "2026-02-20", postedAmount: null, outcome: null, note: null };
    const guard = closeGuard(offer, young, { rules: [rule] }, "2026-11-20");
    expect(guard?.until).toBe("2026-12-01");
    expect(bestExit(guard!.until, cycleOf("2026-11-20", [ev("2026-11-18")], [], young), "2026-11-20")).toEqual({ type: "window", from: "2026-12-01", to: "2026-12-18" });
  });
});

describe("wallet chips and headlines follow the phase", () => {
  const chip = (today: string, over = {}) => cardChip(h, af(today, over));
  it("FEE IN → WATCH FEE → DECIDE", () => {
    expect(chip("2026-10-17")).toBe("FEE IN 30D");
    expect(chip("2026-11-17")).toBe("WATCH FEE");
    expect(chip("2026-12-09", { afEvents: [ev("2026-11-18")] })).toBe("DECIDE · 9D");
    expect(chip("2026-12-18", { afEvents: [ev("2026-11-18")] })).toBe("DECIDE TODAY");
  });
  it("headlines", () => {
    const head = (today: string, over = {}) => cardHeadline({ holding: h, attention: af(today, over), unusedCredits: 0, fee: 795, realized: 0 });
    expect(head("2026-11-17")).toMatch(/should post soon/);
    expect(head("2026-12-09", { afEvents: [ev("2026-11-18")] })).toBe("The annual fee posted. Keep, downgrade or close in 9 days to get it back.");
  });
});

describe("import / export", () => {
  it("round-trips a pending fee event, the per-card override and the watch setting", () => {
    const d = userData({ holdings: [{ ...h, afRefundDays: 45 }], afEvents: [ev("2026-11-18")], settings: { ...DEFAULT_SETTINGS, afWatchDays: 60 } });
    const again = parseImport(JSON.parse(JSON.stringify(buildExport(d, "2026-11-20T00:00:00.000Z")))).data;
    expect(again.afEvents).toEqual(d.afEvents);
    expect(again.holdings[0].afRefundDays).toBe(45);
    expect(again.settings.afWatchDays).toBe(60);
  });
  it("older files import with the defaults", () => {
    const old = parseImport({ version: 4, holdings: [{ nickname: "Demo", approvalDate: "2025-01-15", afEvents: [{ postedDate: "2026-01-15", amount: 95, outcome: "paid" }] }], settings: { afLeadDays: 30 } }).data;
    expect(old.holdings[0].afRefundDays).toBeNull();
    expect(old.settings.afWatchDays).toBe(45);
    expect(old.afEvents[0].outcome).toBe("paid");
  });
});
