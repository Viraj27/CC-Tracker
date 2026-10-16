import { describe, expect, it } from "vitest";
import type { Rule } from "@/lib/catalog/schema";
import { buildAttention } from "@/lib/domain/attention";
import { evaluateRule } from "@/lib/domain/rules";
import { benefit, card, catalog, holding, userData } from "./fixtures";

const prov = { source_url: "https://example.com", last_verified: "2026-01-01", verified: true };
const today = "2026-10-16";

const cat = catalog({
  cards: [
    card({ id: "demo-gold", family: "demo-family" }),
    card({ id: "demo-silver", family: "demo-family" }),
    card({
      id: "demo-credits",
      annual_fee: { amount: 250, first_year_waived: false, ...prov, verified: false, note: "demo unverified" },
      benefits: [
        benefit({ id: "q-credit", cycle: "quarterly", amount: 50 }),
        benefit({ id: "y-credit", cycle: "calendar_year", amount: 100, verified: false, note: "demo unverified" }),
      ],
    }),
  ],
});

describe("issuer rules", () => {
  const familyRule: Rule = {
    id: "demo-48",
    name: "Demo 48",
    issuer: "testbank",
    effect: "bonus",
    description: "test",
    check: { type: "family_window", family: "demo-family", months: 48, blocks_if_currently_held: true },
    ...prov,
  };

  it("family window: fails when a family card is held or recently opened", () => {
    const held = [holding({ id: "a", catalogCardId: "demo-gold", approvalDate: "2020-01-01" })];
    expect(evaluateRule(familyRule, held, cat, today).outcome).toBe("fail");
    const closedOld = [holding({ id: "a", catalogCardId: "demo-gold", approvalDate: "2020-01-01", status: "closed" })];
    expect(evaluateRule(familyRule, closedOld, cat, today).outcome).toBe("pass");
    const closedRecent = [holding({ id: "a", catalogCardId: "demo-gold", approvalDate: "2024-01-01", status: "closed" })];
    const r = evaluateRule(familyRule, closedRecent, cat, today);
    expect(r.outcome).toBe("fail");
    expect(r.reasons.join(" ")).toMatch(/Jan 1, 2028/);
  });

  it("lifetime family: any history blocks", () => {
    const rule: Rule = { ...familyRule, check: { type: "lifetime_family", families: ["demo-family"] } };
    const h = [holding({ id: "a", catalogCardId: "demo-silver", approvalDate: "2015-01-01", status: "closed" })];
    expect(evaluateRule(rule, h, cat, today).outcome).toBe("fail");
    expect(evaluateRule(rule, [], cat, today).outcome).toBe("pass");
  });

  it("x_in_y: reports when eligible again", () => {
    const rule: Rule = {
      ...familyRule,
      check: { type: "x_in_y", max_new_accounts: 1, window_months: 24, counted_account_types: ["personal"], business_counted_issuers: [], counted_issuers: null },
    };
    const h = [
      holding({ id: "a", nickname: "Demo A", approvalDate: "2025-01-10" }),
      holding({ id: "b", nickname: "Demo B", approvalDate: "2025-06-10" }),
    ];
    const r = evaluateRule(rule, h, cat, today);
    expect(r.outcome).toBe("fail");
    expect(r.reasons.at(-1)).toMatch(/Jan 10, 2027/);
  });

  it("max_open counts open cards from the issuer", () => {
    const rule: Rule = { ...familyRule, check: { type: "max_open", issuer: "testbank", max_open: 2, counted_account_types: ["personal"] } };
    const h = [holding({ id: "a", catalogCardId: "demo-gold" }), holding({ id: "b", catalogCardId: "demo-silver" })];
    expect(evaluateRule(rule, h, cat, today).outcome).toBe("fail");
    expect(evaluateRule(rule, h.slice(0, 1), cat, today).outcome).toBe("pass");
  });
});

describe("needs attention", () => {
  const h = holding({ id: "h1", catalogCardId: "demo-credits", approvalDate: "2023-11-20", afMonth: 11, afDay: 20, paymentDueDay: 20 });

  it("flags AF, expiring credits, payments and unverified facts, sorted by urgency", () => {
    const items = buildAttention(cat, userData({ holdings: [h] }), "2026-12-10");
    expect(items.map((i) => i.id)).toEqual([
      "payment:h1:2026-10", // past due, oldest first
      "payment:h1:2026-11",
      "credit:h1:q-credit:2026-Q4", // 21 days left
      "credit:h1:y-credit:2026",
      "unverified:credit:h1:y-credit",
    ]);
    expect(items[0]).toMatchObject({ kind: "payment", severity: "critical", daysUntil: -51 });
    const ids = items.map((i) => i.id);
    expect(ids.some((i) => i.startsWith("af:"))).toBe(false); // next AF is Nov 2027
  });

  it("AF within lead time prompts for retention; unverified AF is flagged", () => {
    const items = buildAttention(cat, userData({ holdings: [{ ...h, paymentDueDay: null }] }), "2026-10-16");
    const af = items.find((i) => i.kind === "af")!;
    expect(af.daysUntil).toBe(35);
    expect(af.title).toMatch(/\$250 annual fee posts Nov 20, 2026/);
    expect(items.some((i) => i.id === `unverified:af:h1`)).toBe(true);
  });

  it("logging a partial use updates the remaining amount; fully used credits drop off", () => {
    const usage = (amount: number) => ({ id: "u", holdingId: "h1", benefitId: "q-credit", periodKey: "2026-Q4", amount, valueOverride: null, date: "2026-12-01", note: null });
    const partial = buildAttention(cat, userData({ holdings: [h], usages: [usage(20)] }), "2026-12-10");
    expect(partial.find((i) => i.id === "credit:h1:q-credit:2026-Q4")!.title).toMatch(/\$30 /);
    const full = buildAttention(cat, userData({ holdings: [h], usages: [usage(50)] }), "2026-12-10");
    expect(full.some((i) => i.id === "credit:h1:q-credit:2026-Q4")).toBe(false);
  });

  it("a retention call in the window clears the AF prompt", () => {
    const lifecycle = [{ id: "l", holdingId: "h1", type: "retention_call" as const, date: "2026-10-10", offer: null, accepted: null, fromCard: null, toCard: null, details: null }];
    const items = buildAttention(cat, userData({ holdings: [h], lifecycle }), "2026-10-16");
    expect(items.some((i) => i.kind === "af")).toBe(false);
  });

  it("paid payments are not flagged", () => {
    const payments = [{ id: "p", holdingId: "h1", statementMonth: "2026-10", dueDate: "2026-10-20", paid: true, paidDate: "2026-10-15" }];
    const data = userData({ holdings: [h], payments });
    data.settings.paymentTrackingStart = "2026-10"; // earlier months are not tracked
    const items = buildAttention(cat, data, "2026-10-16");
    expect(items.some((i) => i.kind === "payment")).toBe(false);
  });
});
