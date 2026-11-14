/** Plain user-data shapes shared by server, client and the pure domain logic. */
import type { SpendCategory } from "../catalog/schema";

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
  /** Owner override of the issuer's annual fee refund window, in days. */
  afRefundDays: number | null;
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

/** `pending`: the fee posted and the keep / downgrade / close decision is still open. */
export type AfOutcome = "pending" | "paid" | "retention_offer" | "downgraded" | "closed";
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

export type BonusUnit = "points" | "miles" | "usd";

/**
 * A card's welcome bonus offer (docs/SPEC-v6-welcome-bonus.md §2), at most one
 * per holding. Spend is never logged: `spentSoFar` is an optional figure typed
 * from the issuer's own tracker. Status and deadline are derived (welcomeBonus.ts).
 */
export interface WelcomeOffer {
  id: string;
  holdingId: string;
  bonusAmount: number;
  bonusUnit: BonusUnit;
  /** Points program id; null = the card's `rewards_program`. */
  program: string | null;
  /** USD; null for "approved = bonus" offers. */
  minSpend: number | null;
  windowMonths: number | null;
  /** Owner-set exact deadline; when null it is estimated from the approval date. */
  deadline: string | null;
  spentSoFar: number | null;
  spentAsOf: string | null;
  metDate: string | null;
  postedDate: string | null;
  /** What actually posted; null = `bonusAmount`. */
  postedAmount: number | null;
  outcome: "missed" | null;
  note: string | null;
}

/**
 * Kinds of Up next item a skip can apply to (mirrors AttentionKind). `sub` is
 * a welcome bonus spend deadline, `subpost` a met bonus that hasn't posted.
 */
export type SkipKind = "af" | "credit" | "payment" | "rotating" | "enroll" | "sub" | "subpost" | "unverified";

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
  /** Days after the anniversary that "Watch for fee" stays in Up next. */
  afWatchDays: number;
  creditLeadDays: number;
  paymentLeadDays: number;
  /** Welcome bonus: days before the spend deadline it shows in Up next. */
  subLeadDays: number;
  /** Welcome bonus: days after "Met" before "Bonus not posted" shows. */
  subPostingDays: number;
  /** Count a posted welcome bonus in the headline ROI. */
  countBonusInRoi: boolean;
  perkValueOverrides: Record<string, number>;
  centsPerPoint: Record<string, number>;
  paymentTrackingStart: string | null;
  /** Find a card: rough monthly USD per spend category, typed once. Blank categories are absent. */
  spendProfile: Partial<Record<SpendCategory, number>>;
  /** Find a card: the page's criteria as last left; missing keys take their defaults. */
  findCardCriteria: Partial<FindCardCriteria>;
  /** Deals: ids of feed items the owner dismissed. */
  dismissedDeals: string[];
  /** Deals: the date of the feed run that was current when the Deals page was last opened. */
  dealsSeenAt: string | null;
}

/** Find a card's filters (docs/SPEC-v8-find-a-card.md §2.2). */
export interface FindCardCriteria {
  accountType: "personal" | "business" | "both";
  goal: "bonus" | "everyday";
  /** A program id, `cash` for any cash-back program, or `any`. */
  program: string;
  /** USD; null = no limit. */
  maxFee: number | null;
  /** Issuer ids left out (empty = every issuer). */
  excludedIssuers: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  afLeadDays: 45,
  afWatchDays: 45,
  creditLeadDays: 30,
  paymentLeadDays: 7,
  subLeadDays: 30,
  subPostingDays: 56,
  countBonusInRoi: false,
  perkValueOverrides: {},
  centsPerPoint: {},
  paymentTrackingStart: null,
  spendProfile: {},
  findCardCriteria: {},
  dismissedDeals: [],
  dealsSeenAt: null,
};

export interface UserData {
  holdings: Holding[];
  usages: BenefitUsage[];
  enrollments: BenefitEnrollment[];
  welcomeOffers: WelcomeOffer[];
  payments: PaymentRecord[];
  afEvents: AnnualFeeEvent[];
  lifecycle: LifecycleEvent[];
  points: PointsBalance[];
  activations: RotatingActivation[];
  dismissals: Dismissal[];
  mutes: ReminderMute[];
  settings: Settings;
}
