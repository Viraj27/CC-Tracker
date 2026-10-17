/** Plain user-data shapes shared by server, client and the pure domain logic. */

export type HoldingStatus = "open" | "closed" | "product_changed";
export type AccountType = "personal" | "business";

export interface Holding {
  id: string;
  catalogCardId: string | null;
  nickname: string | null;
  issuer: string | null;
  accountType: AccountType | null;
  approvalDate: string;
  status: HoldingStatus;
  closedDate: string | null;
  productChangedFromId: string | null;
  afMonth: number | null;
  afDay: number | null;
  paymentDueDay: number | null;
  notes: string | null;
}

export interface BenefitUsage {
  id: string;
  holdingId: string;
  benefitId: string;
  periodKey: string;
  amount: number;
  valueOverride: number | null;
  date: string;
  note: string | null;
}

/**
 * "Mark enrolled" on a benefit that needs enrollment (docs/SPEC-v7-phone-feedback.md §1.2).
 * Every enrollment is kept; the latest one decides whether it has lapsed.
 */
export interface BenefitEnrollment {
  id: string;
  holdingId: string;
  benefitId: string;
  enrolledOn: string;
}

export interface PaymentRecord {
  id: string;
  holdingId: string;
  statementMonth: string;
  dueDate: string;
  paid: boolean;
  paidDate: string | null;
}

export type AfOutcome = "paid" | "retention_offer" | "downgraded" | "closed";
export interface AnnualFeeEvent {
  id: string;
  holdingId: string;
  postedDate: string;
  amount: number;
  outcome: AfOutcome;
  note: string | null;
}

export type LifecycleType = "retention_call" | "product_change" | "closure";
export interface LifecycleEvent {
  id: string;
  holdingId: string;
  type: LifecycleType;
  date: string;
  offer: string | null;
  accepted: boolean | null;
  fromCard: string | null;
  toCard: string | null;
  details: string | null;
}

export interface PointsBalance {
  id: string;
  program: string;
  balance: number;
  asOf: string;
  centsPerPoint: number | null;
}

export interface RotatingActivation {
  id: string;
  holdingId: string;
  quarter: string;
  activated: boolean;
  date: string | null;
}

/** Kinds of Up next item a skip can apply to (mirrors AttentionKind). */
export type SkipKind = "af" | "credit" | "payment" | "rotating" | "enroll" | "unverified";

/**
 * "Skip" on one Up next occurrence (docs/SPEC-v4.1-skip.md). Hides only that
 * occurrence; nothing is marked paid, used or activated. `period` is the
 * occurrence's period or date (quarter, month, benefit period key, fee date);
 * together with kind, holding and benefit it forms the stable occurrence key.
 */
export interface Dismissal {
  id: string;
  holdingId: string;
  kind: SkipKind;
  benefitId: string | null;
  period: string;
  /** When it was skipped (YYYY-MM-DD). */
  date: string;
}

/** What a "Don't remind me" mute silences: a card's rotating activation, or one credit/perk on a card. */
export type MuteKind = "rotating" | "benefit";

/** A permanent (reversible) mute of a recurring reminder. Never offered for payments or annual fees. */
export interface ReminderMute {
  id: string;
  holdingId: string;
  kind: MuteKind;
  /** Set for `benefit`, null for `rotating`. */
  benefitId: string | null;
  date: string;
}

export interface Settings {
  afLeadDays: number;
  creditLeadDays: number;
  paymentLeadDays: number;
  perkValueOverrides: Record<string, number>;
  centsPerPoint: Record<string, number>;
  paymentTrackingStart: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  afLeadDays: 45,
  creditLeadDays: 30,
  paymentLeadDays: 7,
  perkValueOverrides: {},
  centsPerPoint: {},
  paymentTrackingStart: null,
};

export interface UserData {
  holdings: Holding[];
  usages: BenefitUsage[];
  enrollments: BenefitEnrollment[];
  payments: PaymentRecord[];
  afEvents: AnnualFeeEvent[];
  lifecycle: LifecycleEvent[];
  points: PointsBalance[];
  activations: RotatingActivation[];
  dismissals: Dismissal[];
  mutes: ReminderMute[];
  settings: Settings;
}
