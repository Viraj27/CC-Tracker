import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { describe, expect, it } from "vitest";
import {
  AllowListSchema,
  type AllowEntry,
  type DatasetCard,
  ImportError,
  mapIssuer,
  mapNetwork,
  mapProgram,
  planImport,
  publicOfferOf,
  renderStub,
  stubOf,
  withPublicOffer,
} from "@/lib/catalog/importStubs";
import { loadCatalog } from "@/lib/catalog/loader";
import { CardSchema } from "@/lib/catalog/schema";
import { buildAttention } from "@/lib/domain/attention";
import { rankCards } from "@/lib/domain/bestCard";
import { fiveTwentyFourStatus, chase524Params } from "@/lib/domain/fiveTwentyFour";
import { checkApplication } from "@/lib/domain/rules";
import { holding, userData } from "./fixtures";

// Catalog stubs (docs/SPEC-v6.2-catalog.md). The dataset rows here are invented.

const programs = [
  { id: "chase-ur", kind: "points" as const },
  { id: "cash-back", kind: "cash" as const },
  { id: "delta-skymiles", kind: "miles" as const },
];
const row = (over: Partial<DatasetCard> = {}): DatasetCard => ({
  cardId: "abc123",
  name: "Demo Preferred",
  issuer: "CHASE",
  network: "VISA",
  currency: "CHASE",
  isBusiness: false,
  annualFee: 95,
  isAnnualFeeWaived: false,
  url: "https://example.com/demo-preferred",
  offers: [{ spend: 4000, amount: [{ amount: 60000 }], days: 90 }],
  discontinued: false,
  ...over,
});
const entry: AllowEntry = { card_id: "abc123", id: "chase-demo-preferred", name: "Chase Demo Preferred" };
const AS_OF = "2026-06-08";

describe("mapping the dataset's values", () => {
  it("maps issuers, networks and currencies", () => {
    expect(mapIssuer("AMERICAN_EXPRESS")).toBe("amex");
    expect(mapIssuer("US_BANK")).toBe("us_bank");
    expect(mapNetwork("MASTERCARD")).toBe("mastercard");
    expect(mapNetwork("AMERICAN_EXPRESS")).toBe("amex");
    expect(mapProgram("USD")).toBe("cash-back");
    expect(mapProgram("HILTON")).toBe("hilton-honors");
  });
  it("fails loudly on a value it does not know", () => {
    expect(() => mapIssuer("SYNCHRONY", "Demo")).toThrow(/Demo: unknown issuer "SYNCHRONY"/);
    expect(() => mapNetwork("JCB")).toThrow(ImportError);
    expect(() => mapProgram("LUFTHANSA")).toThrow(/unknown currency/);
    expect(() => stubOf(entry, row({ currency: "DELTA" }), [programs[0]], AS_OF)).toThrow(/not in catalog\/programs.yaml/);
  });
});

describe("public offer", () => {
  it("takes the first offer, in the program's unit", () => {
    expect(publicOfferOf(row(), programs, AS_OF)).toEqual({
      bonus: 60000,
      unit: "points",
      min_spend: 4000,
      days: 90,
      as_of: AS_OF,
      source_url: "https://github.com/andenacitelli/credit-card-bonuses-api",
      source_type: "community",
    });
    expect(publicOfferOf(row({ currency: "DELTA" }), programs, AS_OF)?.unit).toBe("miles");
    expect(publicOfferOf(row({ currency: "USD", offers: [{ spend: 500, amount: [{ amount: 200 }], days: 90 }] }), programs, AS_OF)).toMatchObject({ bonus: 200, unit: "usd" });
  });
  it("an offer's own currency wins over the card's (cash bonus on a points card)", () => {
    expect(publicOfferOf(row({ offers: [{ spend: 10000, amount: [{ amount: 1000, currency: "USD" }], days: 90 }] }), programs, AS_OF)).toMatchObject({ bonus: 1000, unit: "usd" });
  });
  it("'any purchase' (one cent) means no minimum spend", () => {
    expect(publicOfferOf(row({ offers: [{ spend: 0.01, amount: [{ amount: 150 }], days: 365 }] }), programs, AS_OF)?.min_spend).toBeNull();
  });
  it("skips expired and zero-amount offers", () => {
    const offers = [
      { spend: 5000, amount: [{ amount: 110000 }], days: 90, expiration: "2026-05-20" },
      { spend: 4000, amount: [{ amount: 80000 }], days: 90 },
    ];
    expect(publicOfferOf(row({ offers }), programs, AS_OF)?.bonus).toBe(80000);
    expect(publicOfferOf(row({ offers: [{ ...offers[0], expiration: "2026-07-01" }] }), programs, AS_OF)).toMatchObject({ bonus: 110000, expires: "2026-07-01" });
    expect(publicOfferOf(row({ offers: [{ spend: 3000, amount: [{ amount: 0 }], days: 90 }] }), programs, AS_OF)).toBeNull();
    expect(publicOfferOf(row({ offers: [] }), programs, AS_OF)).toBeNull();
  });
});

describe("stubs", () => {
  it("renders a stub that passes the card schema, unverified and community-sourced", () => {
    const text = renderStub(stubOf({ ...entry, family: "demo-family" }, row({ isAnnualFeeWaived: true }), programs, AS_OF));
    expect(text).toMatch(/^# Stub: basic facts only/);
    const card = CardSchema.parse(YAML.parse(text));
    expect(card).toMatchObject({
      id: "chase-demo-preferred",
      depth: "stub",
      name: "Chase Demo Preferred",
      issuer: "chase",
      network: "visa",
      account_type: "personal",
      family: "demo-family",
      rewards_program: "chase-ur",
      earn_rates: [],
      benefits: [],
    });
    expect(card.annual_fee).toMatchObject({ amount: 95, first_year_waived: true, verified: false, source_type: "community", last_verified: AS_OF });
    expect(card.annual_fee.note).toMatch(/imported from credit-card-bonuses-api 2026-06-08; not yet checked/);
  });
  it("the allow-list can correct the dataset's business flag", () => {
    expect(stubOf({ ...entry, account_type: "business" }, row(), programs, AS_OF).account_type).toBe("business");
    expect(stubOf(entry, row({ isBusiness: true }), programs, AS_OF).account_type).toBe("business");
  });
  it("a full card still needs earn rates; a stub does not", () => {
    const stub = YAML.parse(renderStub(stubOf(entry, row(), programs, AS_OF)));
    expect(CardSchema.safeParse({ ...stub, depth: "full" }).success).toBe(false);
    expect(CardSchema.safeParse({ ...stub, depth: undefined }).success).toBe(false); // default is full
  });
});

describe("planning an import", () => {
  const full = "id: chase-demo-full\nname: Demo Full\n# a hand-written comment\nearn_rates:\n  - rate: 1\n";
  it("writes new stubs, and a second run with no upstream change writes nothing (idempotent)", () => {
    const first = planImport([row()], [entry], new Map(), programs, AS_OF);
    expect(first.writes.map((w) => [w.id, w.kind])).toEqual([["chase-demo-preferred", "stub"]]);
    const existing = new Map([["chase-demo-preferred", { text: first.writes[0].text, depth: "stub" as const }]]);
    expect(planImport([row()], [entry], existing, programs, AS_OF).writes).toEqual([]);
    expect(planImport([row({ annualFee: 150 })], [entry], existing, programs, AS_OF).writes).toHaveLength(1);
  });
  it("never rewrites a researched card: it only gains or updates public_offer, every other byte kept", () => {
    const fullEntry = { ...entry, id: "chase-demo-full" };
    const existing = new Map([["chase-demo-full", { text: full, depth: "full" as const }]]);
    const [w] = planImport([row()], [fullEntry], existing, programs, AS_OF).writes;
    expect(w.kind).toBe("offer");
    expect(w.text.startsWith(full)).toBe(true);
    expect(YAML.parse(w.text).public_offer).toMatchObject({ bonus: 60000, as_of: AS_OF });
    // Again with the updated file: nothing to do. With a new offer: only the block changes.
    const after = new Map([["chase-demo-full", { text: w.text, depth: "full" as const }]]);
    expect(planImport([row()], [fullEntry], after, programs, AS_OF).writes).toEqual([]);
    const changed = planImport([row({ offers: [{ spend: 5000, amount: [{ amount: 75000 }], days: 90 }] })], [fullEntry], after, programs, AS_OF).writes[0].text;
    expect(changed.startsWith(full)).toBe(true);
    expect(YAML.parse(changed).public_offer.bonus).toBe(75000);
    expect(changed.match(/public_offer:/g)).toHaveLength(1);
    expect(withPublicOffer(changed, null)).toBe(full);
  });
  it("a full card that is not on the allow-list is not touched at all", () => {
    const existing = new Map([["chase-demo-full", { text: full, depth: "full" as const }]]);
    expect(planImport([row()], [entry], existing, programs, AS_OF).writes.map((w) => w.id)).toEqual(["chase-demo-preferred"]);
  });
  it("skips discontinued cards and rejects allow-list mistakes", () => {
    expect(planImport([row({ discontinued: true })], [entry], new Map(), programs, AS_OF)).toEqual({ writes: [], skipped: [{ id: "chase-demo-preferred", reason: "discontinued in the dataset" }] });
    expect(() => planImport([row()], [{ ...entry, card_id: "nope" }], new Map(), programs, AS_OF)).toThrow(/not in the dataset/);
    expect(() => planImport([row()], [entry, entry], new Map(), programs, AS_OF)).toThrow(/duplicate id/);
  });
});

describe("the real catalog with stubs", () => {
  const cat = loadCatalog();
  const stubs = cat.cards.filter((c) => c.depth === "stub");
  const allow = AllowListSchema.parse(YAML.parse(fs.readFileSync(path.join(process.cwd(), "catalog", "import-allowlist.yaml"), "utf8"))).cards;

  it("has the 7 researched cards plus one stub per allow-list entry, all unverified and community-sourced", () => {
    expect(cat.cards.filter((c) => c.depth === "full").map((c) => c.id).sort()).toEqual([
      "amex-delta-skymiles-gold",
      "capital-one-venture-x",
      "chase-freedom-flex",
      "chase-sapphire-reserve",
      "chase-united-explorer",
      "discover-it-cash-back",
      "wells-fargo-autograph",
    ]);
    expect(stubs.map((c) => c.id).sort()).toEqual(allow.map((a) => a.id).sort());
    expect(stubs.length).toBeGreaterThanOrEqual(40);
    expect(stubs.length).toBeLessThanOrEqual(80);
    for (const s of stubs) {
      expect(s.annual_fee).toMatchObject({ verified: false, source_type: "community" });
      expect(s.earn_rates).toEqual([]);
      expect(s.benefits).toEqual([]);
    }
  });

  it("the catalog carries the dataset's licence notice", () => {
    const notice = fs.readFileSync(path.join(process.cwd(), "catalog", "THIRD_PARTY.md"), "utf8");
    expect(notice).toMatch(/MIT License/);
    expect(notice).toMatch(/Commons Clause/);
  });

  it("a held stub works for 5/24, the annual fee and issuer rules, and is left out of Best card (acceptance 3, 4)", () => {
    const h = holding({ id: "h1", catalogCardId: "chase-sapphire-preferred", approvalDate: "2025-12-01" });
    const data = userData({ holdings: [h] });
    expect(fiveTwentyFourStatus([h], cat, "2026-11-13", chase524Params(cat)).count).toBe(1);
    const items = buildAttention(cat, data, "2026-11-13");
    expect(items.find((a) => a.kind === "af")).toMatchObject({ amount: 95, short: "Annual fee" });
    // The imported fee is flagged as unverified next to it.
    expect(items.some((a) => a.kind === "unverified" && a.title.includes("Chase Sapphire Preferred annual fee"))).toBe(true);
    expect(rankCards("dining", [h], cat, data.settings, [], "2026-11-13")).toEqual([]);
    // Rules: the Delta family rule now sees a held Delta Platinum stub.
    const delta = holding({ id: "h2", catalogCardId: "amex-delta-skymiles-platinum", approvalDate: "2024-01-10" });
    const gold = cat.cards.find((c) => c.id === "amex-delta-skymiles-gold")!;
    expect(checkApplication(gold, [delta], cat, "2026-11-13", { nll: false }).bonus.outcome).toBe("fail");
    expect(checkApplication(cat.cards.find((c) => c.id === "chase-sapphire-preferred")!, [h], cat, "2026-11-13", { nll: false }).approval.outcome).toBe("pass");
  });
});
