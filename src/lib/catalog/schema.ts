import { z } from "zod";

/**
 * Catalog schema. Every factual field carries provenance:
 *   source_url     official issuer page / benefits guide (preferred)
 *   last_verified  date the fact was last checked against source_url
 *   source_type    "official" (issuer page / guide; the default when omitted) or "community"
 *                  (community-curated: data points the issuer never publishes,
 *                  e.g. 5/24 or product-change paths). Community facts need a note.
 *   verified       false when the fact could not be confirmed from an
 *                  official source; `note` must then explain why.
 */

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const provenance = {
  source_url: z.url(),
  last_verified: isoDate,
  verified: z.boolean(),
  source_type: z.enum(["official", "community"]).optional(),
  note: z.string().optional(),
};

const requireNoteWhenUnverified = <T extends { verified: boolean; source_type?: string; note?: string }>(v: T) =>
  (v.verified && v.source_type !== "community") || (v.note !== undefined && v.note.trim().length > 0);
const unverifiedNoteMsg = { message: "verified: false and community facts require a note explaining why" };

export const CYCLES = [
  "monthly",
  "quarterly",
  "semiannual",
  "calendar_year",
  "cardmember_year",
  "per_use",
  "one_time",
  "none",
] as const;
export type Cycle = (typeof CYCLES)[number];

export const BENEFIT_KINDS = ["credit", "perk", "protection", "status", "other"] as const;
export type BenefitKind = (typeof BENEFIT_KINDS)[number];

/** Spend categories used by the best-card helper. */
export const SPEND_CATEGORIES = [
  "dining",
  "groceries",
  "gas",
  "travel",
  "airfare",
  "hotels",
  "transit",
  "drugstores",
  "streaming",
  "phone",
  "online",
  "entertainment",
  "other",
] as const;
export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

export const EarnRateSchema = z
  .object({
    categories: z.array(z.enum(SPEND_CATEGORIES)).min(1),
    label: z.string(),
    rate: z.number().nonnegative().nullable(),
    unit: z.enum(["percent", "points_per_dollar", "miles_per_dollar"]),
    conditions: z.string().optional(),
    cap: z.string().optional(),
    ...provenance,
  })
  .refine(requireNoteWhenUnverified, unverifiedNoteMsg);
export type EarnRate = z.infer<typeof EarnRateSchema>;

export const ProtectionTermsSchema = z.object({
  coverage: z.string().nullable(),
  conditions: z.array(z.string()).default([]),
  how_to_claim: z.string().nullable(),
});

export const BenefitSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    kind: z.enum(BENEFIT_KINDS),
    name: z.string(),
    /** Display-only short title for one-line rows (e.g. "DoorDash"); derived from `name` when omitted. */
    short_name: z.string().optional(),
    description: z.string(),
    amount: z.number().nonnegative().nullable().default(null),
    unit: z.enum(["USD", "count"]).nullable().default(null),
    cycle: z.enum(CYCLES),
    /** For cardmember_year: which holding date the year is anchored to. */
    anniversary_basis: z.enum(["approval", "af_date"]).optional(),
    enrollment_required: z.boolean().default(false),
    how_to_use: z.string().nullable().default(null),
    /** For perks: id into perk-defaults.yaml for the default $ value per use. */
    perk_default: z.string().optional(),
    protection: ProtectionTermsSchema.optional(),
    /** Benefit availability window, when the issuer states one. */
    starts_on: isoDate.optional(),
    ends_on: isoDate.optional(),
    ...provenance,
  })
  .refine(requireNoteWhenUnverified, unverifiedNoteMsg)
  .refine((b) => b.kind !== "credit" || b.unit === "USD" || b.amount === null, {
    message: "credits are denominated in USD",
  })
  .refine((b) => b.cycle !== "cardmember_year" || b.anniversary_basis !== undefined, {
    message: "cardmember_year benefits must set anniversary_basis",
  })
  .refine((b) => b.kind !== "protection" || b.protection !== undefined, {
    message: "protections must include key terms (protection: {...})",
  });
export type Benefit = z.infer<typeof BenefitSchema>;

export const DowngradeOptionSchema = z
  .object({
    target_name: z.string(),
    target_card_id: z.string().nullable().default(null),
    keep: z.array(z.string()).default([]),
    lose: z.array(z.string()).default([]),
    ...provenance,
  })
  .refine(requireNoteWhenUnverified, unverifiedNoteMsg);
export type DowngradeOption = z.infer<typeof DowngradeOptionSchema>;

export const AnnualFeeSchema = z
  .object({
    amount: z.number().nonnegative().nullable(),
    first_year_waived: z.boolean().nullable(),
    ...provenance,
  })
  .refine(requireNoteWhenUnverified, unverifiedNoteMsg);

export const CardSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  issuer: z.string().regex(/^[a-z0-9_]+$/),
  network: z.enum(["visa", "mastercard", "amex", "discover"]),
  account_type: z.enum(["personal", "business"]),
  /** Product family, used by issuer rules (e.g. "sapphire"). */
  family: z.string().optional(),
  rewards_program: z.string(),
  /** Accent color for the UI. Not a fact; no provenance needed. */
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Text colour on the Wallet card face (brand_color background); pick one with ≥ 4.5:1 contrast. Not a fact. */
  card_ink: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Rotating-category program id (catalog/rotating/<id>.yaml), if any. */
  rotating_program: z.string().optional(),
  product_page: z.url(),
  annual_fee: AnnualFeeSchema,
  earn_rates: z.array(EarnRateSchema).min(1),
  benefits: z.array(BenefitSchema),
  downgrade_options: z.array(DowngradeOptionSchema).default([]),
});
export type Card = z.infer<typeof CardSchema>;

// ------------------------------------------------------------------ rules --

export const RuleCheckSchema = z.discriminatedUnion("type", [
  z.object({
    /** At most `max_new_accounts` openings in the window, or fail. */
    type: z.literal("x_in_y"),
    max_new_accounts: z.number().int().nonnegative(),
    window_months: z.number().int().positive().optional(),
    window_days: z.number().int().positive().optional(),
    counted_account_types: z.array(z.enum(["personal", "business"])),
    /** Business cards from these issuers also count (they report to personal credit). */
    business_counted_issuers: z.array(z.string()).default([]),
    /** null = accounts from every issuer count. */
    counted_issuers: z.array(z.string()).nullable().default(null),
  }),
  z.object({
    /** No current card in family, and no account in family opened within months. */
    type: z.literal("family_window"),
    family: z.string(),
    months: z.number().int().positive(),
    blocks_if_currently_held: z.boolean(),
  }),
  z.object({
    /** "Have or have had": any account ever in these families blocks the bonus. */
    type: z.literal("lifetime_family"),
    families: z.array(z.string()).min(1),
  }),
  z.object({
    type: z.literal("max_open"),
    issuer: z.string(),
    max_open: z.number().int().positive(),
    counted_account_types: z.array(z.enum(["personal", "business"])),
  }),
  z.object({ type: z.literal("manual") }),
]);
export type RuleCheck = z.infer<typeof RuleCheckSchema>;

export const RuleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    issuer: z.string(),
    /** What the rule blocks: approval for a card, or only the welcome bonus. */
    effect: z.enum(["approval", "bonus"]),
    description: z.string(),
    check: RuleCheckSchema,
    ...provenance,
  })
  .refine(requireNoteWhenUnverified, unverifiedNoteMsg);
export type Rule = z.infer<typeof RuleSchema>;

export const RulesFileSchema = z.object({
  issuer: z.string(),
  rules: z.array(RuleSchema),
});

// ------------------------------------------------------- perks & programs --

export const PerkDefaultSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    value_usd: z.number().nonnegative().nullable(),
    basis: z.string(),
    ...provenance,
  })
  .refine(requireNoteWhenUnverified, unverifiedNoteMsg);
export type PerkDefault = z.infer<typeof PerkDefaultSchema>;

export const PerkDefaultsFileSchema = z.object({ perks: z.array(PerkDefaultSchema) });

export const ProgramSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  kind: z.enum(["cash", "points", "miles"]),
  /**
   * Valuation assumption used to compare earn rates across programs. Not an
   * issuer fact; the owner can override it in Settings.
   */
  default_cents_per_point: z.number().positive(),
});
export type Program = z.infer<typeof ProgramSchema>;
export const ProgramsFileSchema = z.object({ programs: z.array(ProgramSchema) });

// ---------------------------------------------------------------- rotating --

export const QuarterKey = z.string().regex(/^\d{4}-Q[1-4]$/);

export const RotatingQuarterSchema = z
  .object({
    quarter: QuarterKey,
    announced: z.boolean(),
    categories: z
      .array(z.object({ name: z.string(), maps_to: z.array(z.enum(SPEND_CATEGORIES)) }))
      .default([]),
    activation_deadline: isoDate.nullable().default(null),
    ...provenance,
  })
  .refine(requireNoteWhenUnverified, unverifiedNoteMsg)
  .refine((q) => !q.announced || q.categories.length > 0, {
    message: "announced quarters must list categories",
  });
export type RotatingQuarter = z.infer<typeof RotatingQuarterSchema>;

export const RotatingProgramSchema = z.object({
  id: z.string(),
  name: z.string(),
  card_ids: z.array(z.string()).min(1),
  rate: z
    .object({
      value: z.number().nonnegative(),
      unit: z.enum(["percent", "points_per_dollar"]),
      cap: z.string().nullable(),
      ...provenance,
    })
    .refine(requireNoteWhenUnverified, unverifiedNoteMsg),
  calendar_url: z.url(),
  quarters: z.array(RotatingQuarterSchema),
});
export type RotatingProgram = z.infer<typeof RotatingProgramSchema>;

export interface Catalog {
  hash: string;
  cards: Card[];
  rules: Rule[];
  perkDefaults: PerkDefault[];
  programs: Program[];
  rotating: RotatingProgram[];
}
