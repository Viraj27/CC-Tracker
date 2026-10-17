import { describe, expect, it } from "vitest";
import type { RotatingProgram } from "@/lib/catalog/schema";
import { buildAttention } from "@/lib/domain/attention";
import { rankCards } from "@/lib/domain/bestCard";
import { isMuted, muteKey, occurrenceKey, splitAttention } from "@/lib/domain/skips";
import type { Dismissal, ReminderMute, UserData } from "@/lib/domain/types";
import { benefit, card, catalog, holding, userData } from "./fixtures";

// Up next skips and "Don't remind me" mutes (docs/SPEC-v4.1-skip.md). Fake demo data only.

const prov = { source_url: "https://example.com/terms", last_verified: "2026-01-01", verified: true };
const rotating: RotatingProgram = {
  id: "demo-5",
  name: "Demo 5% calendar",
  card_ids: ["demo-rotator"],
  rate: { value: 5, unit: "percent", cap: null, ...prov },
  calendar_url: "https://example.com/calendar",
  quarters: [
    { quarter: "2026-Q4", announced: true, categories: [{ name: "Restaurants", maps_to: ["dining"] }], activation_deadline: "2026-12-14", ...prov },
    { quarter: "2027-Q1", announced: true, categories: [{ name: "Groceries", maps_to: ["groceries"] }], activation_deadline: "2027-03-14", ...prov },
  ],
} as RotatingProgram;

const cat = catalog({
  cards: [
    card({ id: "demo-rotator", annual_fee: { amount: 0, first_year_waived: false, ...prov }, rotating_program: "demo-5" }),
    card({
      id: "demo-premium",
      annual_fee: { amount: 395, first_year_waived: false, ...prov },
      benefits: [
        benefit({ id: "ride-credit", cycle: "monthly", amount: 10 }),
        benefit({ id: "food-credit", cycle: "monthly", amount: 5 }),
        benefit({ id: "y-credit", cycle: "calendar_year", amount: 100, verified: false, note: "demo unverified" }),
      ],
    }),
  ],
  rotating: [rotating],
});

const rot = holding({ id: "h-rot", catalogCardId: "demo-rotator", paymentDueDay: 20 });
const prem = holding({ id: "h-prem", catalogCardId: "demo-premium", approvalDate: "2024-11-16", afMonth: 11, afDay: 16 });

const data = (over: Partial<UserData> = {}) => {
  const d = userData({ holdings: [rot, prem], ...over });
  d.settings.paymentTrackingStart = "2026-10";
  d.settings.creditLeadDays = 31;
  return d;
};

const skip = (key: Pick<Dismissal, "kind" | "holdingId" | "benefitId" | "period">): Dismissal => ({ id: `d-${occurrenceKey(key)}`, date: "2026-10-17", ...key });
const mute = (m: Pick<ReminderMute, "kind" | "holdingId" | "benefitId">): ReminderMute => ({ id: `m-${muteKey(m)}`, date: "2026-10-17", ...m });

const ids = (d: UserData, today: string) => {
  const { visible, hidden } = splitAttention(buildAttention(cat, d, today), d.dismissals, d.mutes);
  return { visible: visible.map((a) => a.id), hidden: hidden.map((h) => h.item.id) };
};

describe("occurrence keys", () => {
  it("are derived from kind + holding + benefit + period, never random", () => {
    expect(occurrenceKey({ kind: "rotating", holdingId: "h1", benefitId: null, period: "2026-Q4" })).toBe("rotating:h1:2026-Q4");
    expect(occurrenceKey({ kind: "payment", holdingId: "h1", benefitId: null, period: "2026-10" })).toBe("payment:h1:2026-10");
    expect(occurrenceKey({ kind: "credit", holdingId: "h1", benefitId: "lyft-credit", period: "2026-10" })).toBe("credit:h1:lyft-credit:2026-10");
    expect(occurrenceKey({ kind: "af", holdingId: "h1", benefitId: null, period: "2026-11-16" })).toBe("af:h1:2026-11-16");
    expect(muteKey({ kind: "rotating", holdingId: "h1", benefitId: null })).toBe("rotating:h1");
    expect(muteKey({ kind: "benefit", holdingId: "h1", benefitId: "lyft-credit" })).toBe("benefit:h1:lyft-credit");
  });

  it("every Up next item's id is its occurrence key, the same on every build", () => {
    const a = buildAttention(cat, data(), "2026-10-17");
    const b = buildAttention(cat, data(), "2026-10-17");
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    for (const item of a) expect(item.id).toBe(occurrenceKey(item.occurrence));
    expect(a.map((x) => x.id)).toEqual(
      expect.arrayContaining([
        "rotating:h-rot:2026-Q4",
        "payment:h-rot:2026-10",
        "af:h-prem:2026-11-16",
        "credit:h-prem:ride-credit:2026-10",
      ]),
    );
    // An unverified item is keyed by the occurrence it annotates.
    expect(buildAttention(cat, data(), "2026-12-10").map((x) => x.id)).toContain("unverified:h-prem:y-credit:credit@2026");
  });

  it("only rotating and credit items offer a permanent mute; payments and fees never do", () => {
    const items = buildAttention(cat, data(), "2026-10-17");
    const byKind = (k: string) => items.filter((i) => i.kind === k);
    for (const i of byKind("payment")) expect(i.mute).toBeNull();
    for (const i of byKind("af")) expect(i.mute).toBeNull();
    for (const i of byKind("unverified")) expect(i.mute).toBeNull();
    expect(byKind("rotating")[0].mute).toEqual({ kind: "rotating", benefitId: null });
    expect(byKind("credit").find((i) => i.benefitId === "ride-credit")!.mute).toEqual({ kind: "benefit", benefitId: "ride-credit" });
    expect(byKind("rotating")[0].periodNoun).toBe("quarter");
    expect(byKind("credit").find((i) => i.benefitId === "ride-credit")!.periodNoun).toBe("month");
  });
});

describe("skip one occurrence", () => {
  it("hides only that occurrence; nothing is marked activated/paid/used", () => {
    const d = data({ dismissals: [skip({ kind: "rotating", holdingId: "h-rot", benefitId: null, period: "2026-Q4" })] });
    const r = ids(d, "2026-10-17");
    expect(r.hidden).toEqual(["rotating:h-rot:2026-Q4"]);
    expect(r.visible).not.toContain("rotating:h-rot:2026-Q4");
    expect(r.visible).toContain("payment:h-rot:2026-10");
    expect(d.activations).toEqual([]);
  });

  it("the next period's occurrence appears normally (rotating quarter, credit month, payment month, AF year)", () => {
    const d = data({
      dismissals: [
        skip({ kind: "rotating", holdingId: "h-rot", benefitId: null, period: "2026-Q4" }),
        skip({ kind: "credit", holdingId: "h-prem", benefitId: "ride-credit", period: "2026-10" }),
        skip({ kind: "payment", holdingId: "h-rot", benefitId: null, period: "2026-10" }),
        skip({ kind: "af", holdingId: "h-prem", benefitId: null, period: "2026-11-16" }),
      ],
    });
    // October: all four are hidden.
    expect(ids(d, "2026-10-17").hidden).toEqual(
      expect.arrayContaining(["rotating:h-rot:2026-Q4", "credit:h-prem:ride-credit:2026-10", "payment:h-rot:2026-10", "af:h-prem:2026-11-16"]),
    );
    // November: the November credit and payment show. The October credit is over, so it is no longer
    // counted; the skipped October payment is still unpaid (past due), so it stays hidden and counted.
    const nov = ids(d, "2026-11-15");
    expect(nov.visible).toEqual(expect.arrayContaining(["credit:h-prem:ride-credit:2026-11", "payment:h-rot:2026-11"]));
    expect(nov.hidden).toEqual(["payment:h-rot:2026-10", "af:h-prem:2026-11-16", "rotating:h-rot:2026-Q4"]);
    // January: the 2027-Q1 activation shows. (October is past the payments look-back, so nothing is counted.)
    const jan = ids(d, "2027-01-05");
    expect(jan.visible).toContain("rotating:h-rot:2027-Q1");
    expect(jan.hidden).toEqual([]);
    // Next year's fee shows inside its own lead time.
    const fee = data({ ...d, afEvents: [], dismissals: d.dismissals });
    expect(ids(fee, "2027-10-20").visible).toContain("af:h-prem:2027-11-16");
  });

  it("skipping an item also hides the unverified note on it, with the same reason", () => {
    const d = data({ dismissals: [skip({ kind: "credit", holdingId: "h-prem", benefitId: "y-credit", period: "2026" })] });
    const { hidden } = splitAttention(buildAttention(cat, d, "2026-12-10"), d.dismissals, d.mutes);
    const note = hidden.find((h) => h.item.kind === "unverified")!;
    expect(note.item.parentId).toBe("credit:h-prem:y-credit:2026");
    expect(note.reason).toEqual({ type: "skip", occurrence: { kind: "credit", holdingId: "h-prem", benefitId: "y-credit", period: "2026" } });
    // The unverified note can also be skipped on its own; its parent stays.
    const own = data({ dismissals: [skip({ kind: "unverified", holdingId: "h-prem", benefitId: "y-credit", period: "credit@2026" })] });
    const r = ids(own, "2026-12-10");
    expect(r.hidden).toEqual(["unverified:h-prem:y-credit:credit@2026"]);
    expect(r.visible).toContain("credit:h-prem:y-credit:2026");
  });

  it("counts only items that would otherwise show now", () => {
    const d = data({
      dismissals: [
        skip({ kind: "rotating", holdingId: "h-rot", benefitId: null, period: "2025-Q4" }), // old
        skip({ kind: "payment", holdingId: "h-rot", benefitId: null, period: "2027-05" }), // not due yet
        skip({ kind: "payment", holdingId: "h-rot", benefitId: null, period: "2026-10" }),
      ],
    });
    expect(ids(d, "2026-10-17").hidden).toEqual(["payment:h-rot:2026-10"]);
  });
});

describe("don't remind me (mutes)", () => {
  it("a rotating mute removes every quarter's activation item for that card only", () => {
    const d = data({ mutes: [mute({ kind: "rotating", holdingId: "h-rot", benefitId: null })] });
    expect(ids(d, "2026-10-17").hidden).toEqual(["rotating:h-rot:2026-Q4"]);
    expect(ids(d, "2027-01-05").hidden).toEqual(["rotating:h-rot:2027-Q1"]);
    expect(ids(d, "2027-01-05").visible.some((i) => i.startsWith("rotating:"))).toBe(false);
    expect(isMuted(d.mutes, "h-rot", "rotating")).toBe(true);
    expect(isMuted(d.mutes, "h-prem", "rotating")).toBe(false);
  });

  it("a benefit mute silences that credit on that card, every period, and nothing else", () => {
    const d = data({ mutes: [mute({ kind: "benefit", holdingId: "h-prem", benefitId: "ride-credit" })] });
    const oct = ids(d, "2026-10-17");
    expect(oct.hidden).toEqual(["credit:h-prem:ride-credit:2026-10"]);
    expect(oct.visible).toContain("credit:h-prem:food-credit:2026-10");
    expect(ids(d, "2026-11-20").hidden).toEqual(["credit:h-prem:ride-credit:2026-11"]);
  });

  it("a mute wins over a skip (the hidden item offers 'turn reminders back on')", () => {
    const d = data({
      dismissals: [skip({ kind: "rotating", holdingId: "h-rot", benefitId: null, period: "2026-Q4" })],
      mutes: [mute({ kind: "rotating", holdingId: "h-rot", benefitId: null })],
    });
    const { hidden } = splitAttention(buildAttention(cat, d, "2026-10-17"), d.dismissals, d.mutes);
    expect(hidden.map((h) => h.reason.type)).toEqual(["mute"]);
  });

  it("muted rotating cards still rank with their categories in Best card, marked reminders off", () => {
    const mutes = [mute({ kind: "rotating", holdingId: "h-rot", benefitId: null })];
    const [r] = rankCards("dining", [rot], cat, { centsPerPoint: {} }, [], "2026-10-17", [], mutes);
    expect(r.remindersOff).toBe(true);
    expect(r.hint).toMatch(/Restaurants earns 5%/);
    const activated = [{ id: "a", holdingId: "h-rot", quarter: "2026-Q4", activated: true, date: "2026-10-01" }];
    const [a] = rankCards("dining", [rot], cat, { centsPerPoint: {} }, activated, "2026-10-17", [], mutes);
    expect(a).toMatchObject({ source: "rotating", rate: 5, remindersOff: true });
    expect(rankCards("dining", [rot], cat, { centsPerPoint: {} }, [], "2026-10-17")[0].remindersOff).toBeUndefined();
  });
});
