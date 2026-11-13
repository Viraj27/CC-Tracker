/**
 * The annual fee cycle (docs/SPEC-v6.1-annual-fee-decision.md): upcoming →
 * watch for the fee → refund window. Derived from the holding's anniversary,
 * its fee events and the issuer's refund policy; nothing here is stored. Pure.
 */
import type { AfPolicy, Card, Catalog } from "../catalog/schema";
import { addDays, addMonths, lastAnniversary, nextAnniversary, parseIso } from "./dates";
import type { AnnualFeeEvent, Holding, LifecycleEvent, Settings } from "./types";

export type AfPhase = "upcoming" | "watch" | "decide";

/** Used when the catalog has no policy for the issuer. A placeholder, not a fact. */
export const PLACEHOLDER_REFUND_DAYS = 30;

export interface RefundWindow {
  days: number;
  /** Where `days` comes from: the owner's per-card override, the catalog, or the placeholder. */
  source: "override" | "catalog" | "placeholder";
  /** The issuer's catalog policy, when there is one (also set under an override, for its ⓘ). */
  policy: AfPolicy | null;
}

export function refundWindow(holding: Pick<Holding, "afRefundDays" | "issuer">, card: Pick<Card, "issuer"> | null, catalog: Pick<Catalog, "afPolicies">): RefundWindow {
  const issuer = card?.issuer ?? holding.issuer;
  const policy = catalog.afPolicies.find((p) => p.issuer === issuer) ?? null;
  if (holding.afRefundDays) return { days: holding.afRefundDays, source: "override", policy };
  if (policy) return { days: policy.refund_days, source: "catalog", policy };
  return { days: PLACEHOLDER_REFUND_DAYS, source: "placeholder", policy: null };
}

export interface AfCycle {
  phase: AfPhase;
  /** The anniversary this cycle belongs to. */
  anniversary: string;
  /** True when the anniversary comes from the approval date, not the owner's fee date. */
  estimated: boolean;
  /** upcoming: the anniversary; watch: the date the fee is expected by; decide: the refund window's last day. */
  date: string;
  /** decide: the posted, undecided fee. */
  event: AnnualFeeEvent | null;
  /** decide: the refund window in use. */
  window: RefundWindow | null;
}

function feeDay(holding: Pick<Holding, "afMonth" | "afDay" | "approvalDate">): { m: number; d: number; estimated: boolean } {
  if (holding.afMonth && holding.afDay) return { m: holding.afMonth, d: holding.afDay, estimated: false };
  const { m, d } = parseIso(holding.approvalDate);
  return { m, d, estimated: true };
}

/**
 * The fee at opening (an anniversary inside the first 11 months) on a card
 * whose first year is waived: nothing posts, so there is nothing to watch.
 * The first billed fee, a year in, is a normal cycle.
 */
function waivedOpening(holding: Pick<Holding, "approvalDate">, card: Pick<Card, "annual_fee">, anniversary: string): boolean {
  return card.annual_fee.first_year_waived === true && anniversary < addMonths(holding.approvalDate, 11);
}

/** The last day a cancel still refunds a fee posted on `postedDate`. */
export function refundDeadline(postedDate: string, window: RefundWindow): string {
  return addDays(postedDate, window.days);
}

/**
 * Where the card is in its annual fee cycle on `today`, or null when nothing
 * is pending: no fee, the cycle is decided, or it is between cycles.
 */
export function afCycle(
  holding: Holding,
  card: Card | null,
  data: { afEvents: AnnualFeeEvent[]; lifecycle: LifecycleEvent[] },
  settings: Pick<Settings, "afLeadDays" | "afWatchDays">,
  catalog: Pick<Catalog, "afPolicies">,
  today: string,
): AfCycle | null {
  if (holding.status !== "open" || !card || card.annual_fee.amount === 0) return null;
  const { m, d, estimated } = feeDay(holding);
  const events = data.afEvents.filter((e) => e.holdingId === holding.id);
  const lifecycle = data.lifecycle.filter((e) => e.holdingId === holding.id);

  // 3. Refund window: a posted, undecided fee, until the window closes.
  const window = refundWindow(holding, card, catalog);
  const pending = events
    .filter((e) => e.outcome === "pending" && today <= refundDeadline(e.postedDate, window))
    .sort((a, b) => b.postedDate.localeCompare(a.postedDate))[0];
  if (pending) {
    const before = lastAnniversary(m, d, addDays(pending.postedDate, settings.afLeadDays));
    return { phase: "decide", anniversary: before, estimated, date: refundDeadline(pending.postedDate, window), event: pending, window };
  }

  // 1. Upcoming: from the lead time up to the anniversary itself.
  const next = nextAnniversary(m, d, today);
  const leadStart = addDays(next, -settings.afLeadDays);
  if (today >= leadStart && !waivedOpening(holding, card, next)) {
    const handled =
      events.some((e) => e.postedDate >= leadStart && e.postedDate <= next) || lifecycle.some((e) => e.date >= leadStart && e.date <= next);
    if (!handled) return { phase: "upcoming", anniversary: next, estimated, date: next, event: null, window: null };
  }

  // 2. Watch for the fee: the day after the anniversary until it is logged, or the watch runs out.
  const last = lastAnniversary(m, d, today);
  const watchEnd = addDays(last, settings.afWatchDays);
  if (today > last && today <= watchEnd && last >= holding.approvalDate && !waivedOpening(holding, card, last)) {
    const from = addDays(last, -settings.afLeadDays);
    const logged = events.some((e) => e.postedDate >= from);
    const left = lifecycle.some((e) => e.date >= from && e.type !== "retention_call");
    if (!logged && !left) return { phase: "watch", anniversary: last, estimated, date: watchEnd, event: null, window: null };
  }
  return null;
}

/** A retention call logged for this cycle (from its lead time on). */
export function hasRetentionCall(cycle: Pick<AfCycle, "anniversary">, holdingId: string, lifecycle: LifecycleEvent[], settings: Pick<Settings, "afLeadDays">): boolean {
  const from = addDays(cycle.anniversary, -settings.afLeadDays);
  return lifecycle.some((e) => e.holdingId === holdingId && e.type === "retention_call" && e.date >= from);
}

export type BestExit =
  /** Closing between these dates keeps the welcome bonus and refunds the fee. */
  | { type: "window"; from: string; to: string }
  /** The close guard outlasts the refund window: closing risks the bonus, keeping costs the fee. */
  | { type: "trade"; fee: number };

/**
 * With a welcome bonus close guard (v6) and a posted fee: when to leave.
 * Null without both.
 */
export function bestExit(guardUntil: string | null, cycle: AfCycle | null, today: string): BestExit | null {
  if (!guardUntil || cycle?.phase !== "decide" || !cycle.event) return null;
  if (guardUntil <= cycle.date) return { type: "window", from: guardUntil > today ? guardUntil : today, to: cycle.date };
  return { type: "trade", fee: cycle.event.amount };
}
