/**
 * Welcome bonus (docs/SPEC-v6-welcome-bonus.md): deadline, status and value are
 * derived from the stored offer; nothing here logs spend. Pure.
 */
import type { Card, Catalog, Rule } from "../catalog/schema";
import { centsPerPoint } from "./bestCard";
import { addDays, addMonths, diffDays } from "./dates";
import { round2 } from "./periods";
import { afYear } from "./roi";
import type { Holding, PointsBalance, Settings, WelcomeOffer } from "./types";

export type OfferStatus = "earning" | "overdue" | "met" | "posted" | "missed";

/** Days an overdue deadline stays in Up next before it drops out on its own. */
export const OVERDUE_TAIL_DAYS = 14;

export function offerFor(offers: WelcomeOffer[], holdingId: string): WelcomeOffer | null {
  return offers.find((o) => o.holdingId === holdingId) ?? null;
}

/**
 * The spend deadline: the owner's exact date, else approval date + window
 * (calendar months, clamped to the month's end) marked as an estimate, since
 * issuers word the window differently. Null when neither is set.
 */
export function offerDeadline(offer: WelcomeOffer, holding: Pick<Holding, "approvalDate">): { date: string; estimated: boolean } | null {
  if (offer.deadline) return { date: offer.deadline, estimated: false };
  if (offer.windowMonths) return { date: addMonths(holding.approvalDate, offer.windowMonths), estimated: true };
  return null;
}

/**
 * When the minimum was met: the "Met" date, or the approval date for an offer
 * with no minimum spend (approved = bonus), which only ever waits to post.
 */
export function offerMetDate(offer: WelcomeOffer, holding: Pick<Holding, "approvalDate">): string | null {
  return offer.metDate ?? (offer.minSpend === null ? holding.approvalDate : null);
}

/** posted → missed → met → overdue (past the deadline) → earning. */
export function offerStatus(offer: WelcomeOffer, holding: Pick<Holding, "approvalDate">, today: string): OfferStatus {
  if (offer.postedDate) return "posted";
  if (offer.outcome === "missed") return "missed";
  if (offerMetDate(offer, holding)) return "met";
  const deadline = offerDeadline(offer, holding);
  return deadline && today > deadline.date ? "overdue" : "earning";
}

/** USD still to spend: the minimum, less "spent so far" when the owner typed one. Null when there is no minimum. */
export function leftToSpend(offer: WelcomeOffer): number | null {
  if (offer.minSpend === null) return null;
  return Math.max(0, round2(offer.minSpend - (offer.spentSoFar ?? 0)));
}

/** The date a met bonus is expected to have posted by. */
export function expectedPostBy(offer: WelcomeOffer, holding: Pick<Holding, "approvalDate">, settings: Pick<Settings, "subPostingDays">): string | null {
  const met = offerMetDate(offer, holding);
  return met ? addDays(met, settings.subPostingDays) : null;
}

const compact = (n: number) => {
  if (Math.abs(n) < 1000) return String(round2(n));
  const k = Math.round(n / 100) / 10;
  return `${k}K`;
};

/** `60K pts`, `62.5K mi`, `$200`: the bonus as posted when known, else as offered. */
export function bonusLabel(offer: Pick<WelcomeOffer, "bonusAmount" | "bonusUnit" | "postedAmount">, posted = false): string {
  const n = posted ? (offer.postedAmount ?? offer.bonusAmount) : offer.bonusAmount;
  if (offer.bonusUnit === "usd") return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `${compact(n)} ${offer.bonusUnit === "miles" ? "mi" : "pts"}`;
}

/** The points program the bonus lands in: the offer's own, else the card's. */
export function offerProgram(offer: WelcomeOffer, card: Card | null): string | null {
  return offer.program ?? card?.rewards_program ?? null;
}

/**
 * USD value of the bonus (as posted when known): face value for cash; points
 * and miles at the owner's cents-per-point. Null when the program is unknown.
 */
export function offerValue(
  offer: WelcomeOffer,
  card: Card | null,
  catalog: Pick<Catalog, "programs">,
  settings: Pick<Settings, "centsPerPoint">,
  points: PointsBalance[] = [],
): number | null {
  const amount = offer.postedAmount ?? offer.bonusAmount;
  if (offer.bonusUnit === "usd") return round2(amount);
  const program = offerProgram(offer, card);
  if (!program) return null;
  return round2((amount * centsPerPoint(program, catalog, settings, points)) / 100);
}

/** The catalog's close-early rule (community rule of thumb), if any. */
export function closeGuardRule(catalog: Pick<Catalog, "rules">): (Rule & { check: { type: "bonus_clawback_window"; months: number } }) | null {
  const r = catalog.rules.find((x) => x.check.type === "bonus_clawback_window");
  return (r as (Rule & { check: { type: "bonus_clawback_window"; months: number } }) | undefined) ?? null;
}

export interface CloseGuard {
  /** Closing or downgrading before this date risks the bonus. */
  until: string;
  rule: Rule;
  /** Set once the bonus posted. */
  postedDate: string | null;
}

/**
 * Warn before closing or downgrading: the bonus is posted or still pending,
 * and the card is younger than the rule's window. Warns, never blocks.
 */
export function closeGuard(offer: WelcomeOffer | null, holding: Holding, catalog: Pick<Catalog, "rules">, today: string): CloseGuard | null {
  if (!offer || holding.status !== "open") return null;
  const rule = closeGuardRule(catalog);
  if (!rule) return null;
  if (offerStatus(offer, holding, today) === "missed") return null;
  const until = addMonths(holding.approvalDate, rule.check.months);
  return today < until ? { until, rule, postedDate: offer.postedDate } : null;
}

/**
 * The one-time "Welcome bonus" line of the ROI breakdown: a bonus that posted
 * in the AF year containing `today`. Left out of the headline unless the owner
 * turned `countBonusInRoi` on.
 */
export function roiBonus(
  offer: WelcomeOffer | null,
  holding: Holding,
  card: Card | null,
  catalog: Pick<Catalog, "programs">,
  settings: Pick<Settings, "centsPerPoint" | "countBonusInRoi">,
  points: PointsBalance[],
  today: string,
): { value: number | null; label: string; counted: boolean } | null {
  if (!offer?.postedDate) return null;
  const { start, end } = afYear(holding, today);
  if (offer.postedDate < start || offer.postedDate > end) return null;
  const value = offerValue(offer, card, catalog, settings, points);
  return { value, label: bonusLabel(offer, true), counted: settings.countBonusInRoi && value !== null };
}

/** The read-only Lifecycle log entry once the offer is settled. */
export function bonusLogEntry(offer: WelcomeOffer | null, holding: Pick<Holding, "approvalDate">): { date: string | null; text: string } | null {
  if (!offer) return null;
  if (offer.postedDate) return { date: offer.postedDate, text: `Bonus posted ${bonusLabel(offer, true)}` };
  if (offer.outcome === "missed") return { date: offerDeadline(offer, holding)?.date ?? null, text: "Bonus missed" };
  return null;
}

/** Days from `today` to the deadline (negative once passed); null without a deadline. */
export function daysToDeadline(offer: WelcomeOffer, holding: Pick<Holding, "approvalDate">, today: string): number | null {
  const d = offerDeadline(offer, holding);
  return d ? diffDays(today, d.date) : null;
}
