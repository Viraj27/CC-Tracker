/**
 * Catalog stubs from the open dataset andenacitelli/credit-card-bonuses-api
 * (docs/SPEC-v6.2-catalog.md §3). Pure: dataset rows + allow-list in, YAML
 * text out. scripts/catalog-import.ts does the fetching and file writing.
 * Licence of the source data: MIT + Commons Clause (catalog/THIRD_PARTY.md).
 */
import YAML from "yaml";
import { z } from "zod";
import { issuerCardColor } from "../cardColors";
import type { Program, PublicOffer } from "./schema";

export const DATASET_REPO = "andenacitelli/credit-card-bonuses-api";
/** `master` is the branch that still syncs; the README's `main` links were older when checked (2026-11-13). */
export const DATASET_URL = `https://raw.githubusercontent.com/${DATASET_REPO}/master/exports/data.json`;
export const DATASET_PAGE = `https://github.com/${DATASET_REPO}`;

const OfferAmount = z.object({ amount: z.number(), currency: z.string().optional() });
const DatasetOffer = z.object({
  spend: z.number(),
  amount: z.array(OfferAmount),
  days: z.number(),
  expiration: z.string().optional(),
});
export const DatasetCardSchema = z.object({
  cardId: z.string(),
  name: z.string(),
  issuer: z.string(),
  network: z.string(),
  currency: z.string(),
  isBusiness: z.boolean(),
  annualFee: z.number(),
  isAnnualFeeWaived: z.boolean(),
  url: z.url(),
  offers: z.array(DatasetOffer).default([]),
  discontinued: z.boolean().default(false),
});
export type DatasetCard = z.infer<typeof DatasetCardSchema>;

export const AllowEntrySchema = z.object({
  /** The dataset's `cardId`. */
  card_id: z.string(),
  /** Our catalog id (the file name). */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Display name; the dataset's are short ("Gold"). */
  name: z.string(),
  /** Set when an issuer rule in catalog/rules/ uses this family. */
  family: z.string().optional(),
  /** Overrides the dataset's business flag when it is wrong. */
  account_type: z.enum(["personal", "business"]).optional(),
});
export type AllowEntry = z.infer<typeof AllowEntrySchema>;
export const AllowListSchema = z.object({ cards: z.array(AllowEntrySchema) });

export class ImportError extends Error {}

const ISSUERS: Record<string, string> = {
  AMERICAN_EXPRESS: "amex",
  BANK_OF_AMERICA: "bank_of_america",
  BARCLAYS: "barclays",
  CAPITAL_ONE: "capital_one",
  CHASE: "chase",
  CITI: "citi",
  DISCOVER: "discover",
  US_BANK: "us_bank",
  WELLS_FARGO: "wells_fargo",
};
const NETWORKS: Record<string, "visa" | "mastercard" | "amex" | "discover"> = {
  VISA: "visa",
  MASTERCARD: "mastercard",
  AMERICAN_EXPRESS: "amex",
  DISCOVER: "discover",
};
/** The dataset's `currency` → our rewards program id (catalog/programs.yaml). */
const PROGRAMS: Record<string, string> = {
  USD: "cash-back",
  CHASE: "chase-ur",
  AMERICAN_EXPRESS: "amex-membership-rewards",
  CAPITAL_ONE: "capital-one-miles",
  CITI: "citi-thankyou",
  BANK_OF_AMERICA: "bank-of-america-points",
  US_BANK: "us-bank-points",
  WELLS_FARGO: "wells-fargo-rewards",
  DELTA: "delta-skymiles",
  UNITED: "united-mileageplus",
  SOUTHWEST: "southwest-rapid-rewards",
  AMERICAN: "american-aadvantage",
  ALASKA: "alaska-atmos-rewards",
  JETBLUE: "jetblue-trueblue",
  AVIOS: "avios",
  AEROPLAN: "aeroplan",
  MARRIOTT: "marriott-bonvoy",
  HILTON: "hilton-honors",
  IHG: "ihg-one-rewards",
  HYATT: "world-of-hyatt",
  WYNDHAM: "wyndham-rewards",
  CHOICE: "choice-privileges",
};

const lookup = <T>(map: Record<string, T>, key: string, what: string, card: string): T => {
  const v = map[key];
  if (v === undefined) throw new ImportError(`${card}: unknown ${what} "${key}" in the dataset; add it to the mapping in src/lib/catalog/importStubs.ts`);
  return v;
};
export const mapIssuer = (v: string, card = "card") => lookup(ISSUERS, v, "issuer", card);
export const mapNetwork = (v: string, card = "card") => lookup(NETWORKS, v, "network", card);
export const mapProgram = (v: string, card = "card") => lookup(PROGRAMS, v, "currency", card);

/**
 * The dataset's first offer that has not expired by `asOf`, as a public offer.
 * Null when there is none or its amount is zero (the dataset's "see details" rows).
 */
export function publicOfferOf(card: DatasetCard, programs: Pick<Program, "id" | "kind">[], asOf: string): PublicOffer | null {
  const offer = card.offers.find((o) => !o.expiration || o.expiration >= asOf);
  const amount = offer?.amount[0];
  if (!offer || !amount || amount.amount <= 0) return null;
  const programId = mapProgram(amount.currency ?? card.currency, card.name);
  const kind = programs.find((p) => p.id === programId)?.kind;
  if (!kind) throw new ImportError(`${card.name}: program "${programId}" is not in catalog/programs.yaml`);
  return {
    bonus: amount.amount,
    unit: kind === "cash" ? "usd" : kind,
    // The dataset writes "any purchase" as a spend of one cent.
    min_spend: offer.spend >= 1 ? offer.spend : null,
    days: offer.days > 0 ? Math.round(offer.days) : null,
    as_of: asOf,
    ...(offer.expiration ? { expires: offer.expiration } : {}),
    source_url: DATASET_PAGE,
    source_type: "community",
  };
}

const importNote = (asOf: string) => `imported from credit-card-bonuses-api ${asOf}; not yet checked against product_page`;

type StubFee = { amount: number | null; first_year_waived: boolean; source_url: string; last_verified: string; verified: boolean; source_type?: "official" | "community"; note?: string };

/**
 * A stub's annual fee once someone has checked it by hand (or tried and written down why not):
 * anything but the importer's own block. The importer keeps it, so a check against the issuer's
 * page survives the next import. Null when the file has only the imported fee.
 */
export function checkedFee(text: string): StubFee | null {
  const fee = (YAML.parse(text) as { annual_fee?: StubFee } | null)?.annual_fee;
  if (!fee) return null;
  const imported = fee.source_type === "community" && /^imported from credit-card-bonuses-api /.test(fee.note ?? "");
  return imported ? null : fee;
}

/** The stub's fields, in file order. */
/**
 * A public offer read on the issuer's own page (`source_type: official`, written by the daily
 * refresh). The importer keeps it rather than going back to the dataset's older copy.
 */
export function checkedOffer(text: string): PublicOffer | null {
  const offer = (YAML.parse(text) as { public_offer?: PublicOffer } | null)?.public_offer;
  return offer && offer.source_type === "official" ? offer : null;
}

export function stubOf(
  entry: AllowEntry,
  card: DatasetCard,
  programs: Pick<Program, "id" | "kind">[],
  asOf: string,
  keptFee: StubFee | null = null,
  keptOffer: PublicOffer | null = null,
) {
  const issuer = mapIssuer(card.issuer, card.name);
  const rewards_program = mapProgram(card.currency, card.name);
  if (!programs.some((p) => p.id === rewards_program)) throw new ImportError(`${card.name}: program "${rewards_program}" is not in catalog/programs.yaml`);
  const offer = keptOffer ?? publicOfferOf(card, programs, asOf);
  return {
    id: entry.id,
    depth: "stub" as const,
    name: entry.name,
    issuer,
    network: mapNetwork(card.network, card.name),
    account_type: entry.account_type ?? (card.isBusiness ? "business" : "personal"),
    ...(entry.family ? { family: entry.family } : {}),
    rewards_program,
    brand_color: issuerCardColor(issuer),
    product_page: card.url,
    annual_fee: keptFee ?? {
      amount: card.annualFee,
      first_year_waived: card.isAnnualFeeWaived,
      source_url: card.url,
      last_verified: asOf,
      verified: false,
      source_type: "community" as const,
      note: importNote(asOf),
    },
    ...(offer ? { public_offer: offer } : {}),
  };
}

const HEADER = `# Stub: basic facts only, imported from credit-card-bonuses-api (MIT + Commons Clause, see catalog/THIRD_PARTY.md).
# Generated by \`npm run catalog:import\`; edits here are overwritten, except an \`annual_fee\` checked against the
# issuer's page. To research this card, add its earn rates and benefits from official sources and set
# \`depth: full\`: the importer then leaves it alone.
`;

const toYaml = (v: unknown) => YAML.stringify(v, { lineWidth: 0 });

export function renderStub(stub: ReturnType<typeof stubOf>): string {
  return HEADER + toYaml(stub);
}

/**
 * A researched (`depth: full`) card's file with its `public_offer` block set
 * to `offer`; every other byte is kept. The block is the last thing in the file.
 */
export function withPublicOffer(text: string, offer: PublicOffer | null): string {
  const lines = text.replace(/\n+$/, "").split("\n");
  const start = lines.findIndex((l) => l.startsWith("public_offer:"));
  let kept = lines;
  if (start >= 0) {
    let end = start + 1;
    while (end < lines.length && (lines[end].startsWith(" ") || lines[end] === "")) end++;
    kept = [...lines.slice(0, start), ...lines.slice(end)];
    while (kept.length && kept.at(-1) === "") kept.pop();
  }
  const base = kept.join("\n") + "\n";
  return offer ? `${base}\n${toYaml({ public_offer: offer })}` : base;
}

export interface ImportPlan {
  /** Files to write: catalog id → YAML text. */
  writes: { id: string; text: string; kind: "stub" | "offer" }[];
  /** Allow-listed cards left alone, with the reason. */
  skipped: { id: string; reason: string }[];
}

/**
 * What an import would write. `existing` maps a catalog id to its current file
 * text and depth. Stubs are regenerated, keeping a checked annual fee and an official public offer;
 * a full card only gets `public_offer`, unless it already has an official one.
 * Deterministic: the same dataset, allow-list and `asOf` give the same text.
 */
export function planImport(
  dataset: DatasetCard[],
  allow: AllowEntry[],
  existing: Map<string, { text: string; depth: "stub" | "full" }>,
  programs: Pick<Program, "id" | "kind">[],
  asOf: string,
): ImportPlan {
  const byId = new Map(dataset.map((c) => [c.cardId, c]));
  const plan: ImportPlan = { writes: [], skipped: [] };
  const seen = new Set<string>();
  for (const entry of allow) {
    if (seen.has(entry.id)) throw new ImportError(`allow-list: duplicate id "${entry.id}"`);
    seen.add(entry.id);
    const card = byId.get(entry.card_id);
    if (!card) throw new ImportError(`allow-list: ${entry.id} points at card_id ${entry.card_id}, which is not in the dataset`);
    const current = existing.get(entry.id);
    if (current?.depth === "full") {
      if (checkedOffer(current.text)) continue; // read on the issuer's page: newer than the dataset
      const text = withPublicOffer(current.text, publicOfferOf(card, programs, asOf));
      if (text !== current.text) plan.writes.push({ id: entry.id, text, kind: "offer" });
      continue;
    }
    if (card.discontinued) {
      plan.skipped.push({ id: entry.id, reason: "discontinued in the dataset" });
      continue;
    }
    const text = renderStub(stubOf(entry, card, programs, asOf, current ? checkedFee(current.text) : null, current ? checkedOffer(current.text) : null));
    if (text !== current?.text) plan.writes.push({ id: entry.id, text, kind: "stub" });
  }
  return plan;
}
