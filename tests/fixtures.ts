/**
 * Obviously fake test data. These cards and holdings are invented for tests
 * and do not describe any real product or anyone's real portfolio.
 */
import type { Benefit, Card, Catalog } from "@/lib/catalog/schema";
import type { Holding, UserData } from "@/lib/domain/types";
import { DEFAULT_SETTINGS } from "@/lib/domain/types";

const prov = { source_url: "https://example.com/terms", last_verified: "2026-01-01", verified: true };

export function benefit(over: Partial<Benefit> & Pick<Benefit, "id" | "cycle">): Benefit {
  return {
    kind: "credit",
    name: `Test ${over.id}`,
    description: "test benefit",
    amount: 100,
    unit: "USD",
    enrollment_required: false,
    how_to_use: null,
    ...prov,
    ...over,
  } as Benefit;
}

export function card(over: Partial<Card> & Pick<Card, "id">): Card {
  return {
    name: `Test Card ${over.id}`,
    issuer: "testbank",
    network: "visa",
    account_type: "personal",
    rewards_program: "test-points",
    brand_color: "#336699",
    product_page: "https://example.com/card",
    annual_fee: { amount: 95, first_year_waived: false, ...prov },
    earn_rates: [{ categories: ["other"], label: "Everything else", rate: 1, unit: "points_per_dollar", ...prov }],
    benefits: [],
    downgrade_options: [],
    ...over,
  } as Card;
}

export function holding(over: Partial<Holding> & Pick<Holding, "id">): Holding {
  return {
    catalogCardId: null,
    nickname: null,
    issuer: null,
    accountType: null,
    approvalDate: "2025-01-15",
    status: "open",
    closedDate: null,
    productChangedFromId: null,
    afMonth: null,
    afDay: null,
    paymentDueDay: null,
    notes: null,
    ...over,
  };
}

export function catalog(over: Partial<Catalog> = {}): Catalog {
  return {
    hash: "test",
    cards: [],
    rules: [],
    perkDefaults: [],
    programs: [
      { id: "test-points", name: "Test Points", kind: "points", default_cents_per_point: 1 },
      { id: "test-cash", name: "Test Cash", kind: "cash", default_cents_per_point: 1 },
    ],
    rotating: [],
    ...over,
  };
}

export function userData(over: Partial<UserData> = {}): UserData {
  return {
    holdings: [],
    usages: [],
    payments: [],
    afEvents: [],
    lifecycle: [],
    points: [],
    activations: [],
    settings: { ...DEFAULT_SETTINGS },
    ...over,
  };
}
