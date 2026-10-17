import { describe, expect, it } from "vitest";
import { buildAttention } from "@/lib/domain/attention";
import { dayDate, shortDate } from "@/lib/domain/dates";
import { cardChip, cardHeadline, walletOrder } from "@/lib/domain/wallet";
import { benefit, card, catalog, holding, userData } from "./fixtures";

const today = "2026-10-16";

const cat = catalog({
  cards: [
    card({ id: "demo-fee", annual_fee: { amount: 250, first_year_waived: false, source_url: "https://example.com", last_verified: "2026-01-01", verified: true } }),
    card({ id: "demo-credit", benefits: [benefit({ id: "m-credit", name: "Demo monthly credit", cycle: "monthly", amount: 10 })] }),
    card({ id: "demo-free", annual_fee: { amount: 0, first_year_waived: null, source_url: "https://example.com", last_verified: "2026-01-01", verified: true } }),
  ],
});

const holdings = [
  holding({ id: "free", catalogCardId: "demo-free", approvalDate: "2024-03-01" }),
  holding({ id: "fee", catalogCardId: "demo-fee", approvalDate: "2023-11-15", afMonth: 11, afDay: 15 }), // AF in 30 days
  holding({ id: "credit", catalogCardId: "demo-credit", approvalDate: "2024-04-02" }), // $10 expires Oct 31
  holding({ id: "late", catalogCardId: "demo-free", approvalDate: "2024-05-01", paymentDueDay: 10 }), // past due
  holding({ id: "gone", catalogCardId: "demo-fee", approvalDate: "2022-01-01", status: "closed" }),
];
const data = userData({ holdings, settings: { ...userData().settings, paymentTrackingStart: "2026-10" } });
const attention = buildAttention(cat, data, today);
const entries = holdings.map((h) => ({ holding: h, name: h.id, fee: h.catalogCardId === "demo-fee" ? 250 : h.catalogCardId === "demo-credit" ? 95 : 0 }));

describe("short dates", () => {
  it("formats mono short dates, adding the year only when it differs", () => {
    expect(shortDate("2026-10-31", today)).toBe("31 OCT");
    expect(shortDate("2027-01-15", today)).toBe("15 JAN 2027");
    expect(shortDate("2027-01-15")).toBe("15 JAN 2027");
    expect(shortDate(null)).toBe("—");
    expect(dayDate("2026-10-17", today)).toBe("SAT 17 OCT");
  });
});

describe("attention items carry structured parts", () => {
  it("splits the card name from the label and keeps amounts and targets", () => {
    const credit = attention.find((a) => a.kind === "credit")!;
    expect(credit).toMatchObject({ cardName: "Test Card demo-credit", label: "$10 Demo monthly credit left", amount: 10, benefitId: "m-credit" });
    const pay = attention.find((a) => a.kind === "payment")!;
    expect(pay).toMatchObject({ label: "Payment past due", month: "2026-10" });
    const af = attention.find((a) => a.kind === "af")!;
    expect(af).toMatchObject({ label: "$250 annual fee posts", amount: 250, daysUntil: 30 });
  });
});

describe("wallet stack order", () => {
  it("sorts open cards by urgency, then fee size; closed cards last", () => {
    expect(walletOrder(entries, attention).map((e) => e.holding.id)).toEqual(["late", "credit", "fee", "free", "gone"]);
  });
});

describe("card chip", () => {
  it("shows the most urgent state", () => {
    const by = (id: string) => holdings.find((h) => h.id === id)!;
    expect(cardChip(by("late"), attention)).toBe("PAST DUE");
    expect(cardChip(by("fee"), attention)).toBe("FEE IN 30D");
    expect(cardChip(by("credit"), attention)).toBe("CREDIT 15D");
    expect(cardChip(by("free"), attention)).toBeNull();
    expect(cardChip(by("gone"), attention)).toBe("CLOSED");
  });
});

describe("card headline", () => {
  const h = (id: string) => holdings.find((x) => x.id === id)!;
  it("derives one sentence from the card's state", () => {
    expect(cardHeadline({ holding: h("fee"), attention, unusedCredits: 250, fee: 250, realized: 0 })).toBe(
      "Fee posts in 30 days. Use the $250 of credits left first.",
    );
    expect(cardHeadline({ holding: h("fee"), attention, unusedCredits: 0, fee: 250, realized: 0 })).toBe(
      "Fee posts in 30 days. Keep, downgrade or cancel?",
    );
    expect(cardHeadline({ holding: h("credit"), attention, unusedCredits: 10, fee: 95, realized: 0 })).toBe(
      "$10 of Demo monthly credit expires in 15 days.",
    );
    expect(cardHeadline({ holding: h("late"), attention, unusedCredits: 0, fee: 0, realized: 0 })).toMatch(/past due/);
    expect(cardHeadline({ holding: h("free"), attention, unusedCredits: 0, fee: 0, realized: 0 })).toBe(
      "No annual fee. Nothing needs attention.",
    );
    expect(cardHeadline({ holding: h("free"), attention: [], unusedCredits: 12.5, fee: 95, realized: 40 })).toBe(
      "$40 realized against the $95 fee this year. $12.50 of credits unused.",
    );
    expect(cardHeadline({ holding: h("gone"), attention, unusedCredits: 0, fee: 250, realized: 0 })).toMatch(/^Closed/);
  });
});
