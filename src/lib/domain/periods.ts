import type { Benefit, Cycle } from "../catalog/schema";
import {
  addDays,
  anniversaryInYear,
  daysInMonth,
  diffDays,
  lastAnniversary,
  parseIso,
  quarterBounds,
  quarterOf,
  toIso,
} from "./dates";
import type { BenefitUsage, Holding } from "./types";

export interface Period {
  /** e.g. `2026`, `2026-H2`, `2026-Q4`, `2026-10`, `cm-2025-06` */
  key: string;
  start: string | null;
  end: string | null;
  /** Last day the period's value can be used (inclusive); null if it never expires. */
  expiry: string | null;
}

export interface Anchor {
  month: number;
  day: number;
}

/**
 * Compute the period containing `today` for a benefit cycle.
 * `anchor` is required for `cardmember_year` (month/day of approval or AF date).
 */
export function computePeriod(cycle: Cycle, today: string, anchor?: Anchor | null): Period {
  const { y, m } = parseIso(today);
  switch (cycle) {
    case "monthly": {
      const start = toIso(y, m, 1);
      const end = toIso(y, m, daysInMonth(y, m));
      return { key: today.slice(0, 7), start, end, expiry: end };
    }
    case "quarterly": {
      const key = quarterOf(today);
      const { start, end } = quarterBounds(key);
      return { key, start, end, expiry: end };
    }
    case "semiannual": {
      const h = m <= 6 ? 1 : 2;
      const start = toIso(y, h === 1 ? 1 : 7, 1);
      const end = h === 1 ? toIso(y, 6, 30) : toIso(y, 12, 31);
      return { key: `${y}-H${h}`, start, end, expiry: end };
    }
    case "calendar_year": {
      const end = toIso(y, 12, 31);
      return { key: String(y), start: toIso(y, 1, 1), end, expiry: end };
    }
    case "cardmember_year": {
      if (!anchor) return { key: "cm-unknown", start: null, end: null, expiry: null };
      const start = lastAnniversary(anchor.month, anchor.day, today);
      const sy = parseIso(start).y;
      const end = addDays(anniversaryInYear(anchor.month, anchor.day, sy + 1), -1);
      return { key: `cm-${start.slice(0, 7)}`, start, end, expiry: end };
    }
    case "one_time":
      return { key: "once", start: null, end: null, expiry: null };
    case "per_use":
      return { key: "per-use", start: null, end: null, expiry: null };
    case "none":
      return { key: "none", start: null, end: null, expiry: null };
  }
}

/** Anchor month/day for a cardmember-year benefit on a holding. */
export function benefitAnchor(benefit: Benefit, holding: Holding): Anchor | null {
  if (benefit.cycle !== "cardmember_year") return null;
  if (benefit.anniversary_basis === "af_date" && holding.afMonth && holding.afDay) {
    return { month: holding.afMonth, day: holding.afDay };
  }
  // Approval basis, or AF basis with no AF date recorded: fall back to approval.
  const { m, d } = parseIso(holding.approvalDate);
  return { month: m, day: d };
}

export function isBenefitActive(benefit: Benefit, today: string): boolean {
  if (benefit.starts_on && today < benefit.starts_on) return false;
  if (benefit.ends_on && today > benefit.ends_on) return false;
  return true;
}

export interface BenefitStatus {
  period: Period;
  /** Amount available this period (credits: USD; perks: count), null if not quantified. */
  available: number | null;
  used: number;
  remaining: number | null;
  /** Days until expiry (0 = expires today), null if no expiry. */
  daysToExpiry: number | null;
  active: boolean;
}

export function benefitStatus(
  benefit: Benefit,
  holding: Holding,
  usages: BenefitUsage[],
  today: string,
): BenefitStatus {
  const period = computePeriod(benefit.cycle, today, benefitAnchor(benefit, holding));
  // A benefit that ends mid-period expires on its end date.
  if (benefit.ends_on && period.expiry && benefit.ends_on < period.expiry) {
    period.expiry = benefit.ends_on;
  }
  const relevant = usages.filter(
    (u) => u.holdingId === holding.id && u.benefitId === benefit.id && u.periodKey === period.key,
  );
  const used = relevant.reduce((s, u) => s + u.amount, 0);
  const available = benefit.amount;
  const remaining = available === null ? null : Math.max(0, round2(available - used));
  const daysToExpiry = period.expiry ? diffDays(today, period.expiry) : null;
  return { period, available, used: round2(used), remaining, daysToExpiry, active: isBenefitActive(benefit, today) };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The period after `period` (null when `period` has no end, e.g. per-use or ongoing). */
export function nextPeriod(cycle: Cycle, period: Period, anchor?: Anchor | null): Period | null {
  if (!period.end) return null;
  return computePeriod(cycle, addDays(period.end, 1), anchor);
}

/**
 * What a credit row shows (docs/SPEC-v7-phone-feedback.md §2):
 *   open           value left this period (or not period-based)
 *   used_upcoming  this period is used up; `shown` is the next period, opening on `opensOn`
 *   used_final     used up and the benefit ends before another period starts
 *   not_started    `starts_on` is in the future
 *   ended          past `ends_on`
 */
export type CreditState = "open" | "used_upcoming" | "used_final" | "not_started" | "ended";

export interface CreditView {
  state: CreditState;
  status: BenefitStatus;
  /** The period the row describes: the current one, or the next one for `used_upcoming`. */
  shown: Period;
  opensOn: string | null;
}

const PERIODIC: ReadonlySet<Cycle> = new Set(["monthly", "quarterly", "semiannual", "calendar_year", "cardmember_year"]);

export function creditView(benefit: Benefit, holding: Holding, usages: BenefitUsage[], today: string): CreditView {
  const status = benefitStatus(benefit, holding, usages, today);
  const base = { status, shown: status.period, opensOn: null };
  if (benefit.ends_on && today > benefit.ends_on) return { ...base, state: "ended" };
  if (benefit.starts_on && today < benefit.starts_on) return { ...base, state: "not_started", opensOn: benefit.starts_on };
  if (!PERIODIC.has(benefit.cycle) || status.remaining === null || status.remaining > 0) return { ...base, state: "open" };
  const next = nextPeriod(benefit.cycle, status.period, benefitAnchor(benefit, holding));
  if (!next?.start || (benefit.ends_on && next.start > benefit.ends_on)) return { ...base, state: "used_final" };
  return { status, state: "used_upcoming", shown: next, opensOn: next.start };
}

/** Whether a use dated `date` can be logged: on or before today, in an active period with value left. */
export function canLogOn(benefit: Benefit, holding: Holding, usages: BenefitUsage[], date: string, today: string): boolean {
  if (date > today || !isBenefitActive(benefit, date)) return false;
  if (!PERIODIC.has(benefit.cycle) || benefit.amount === null) return true;
  const s = benefitStatus(benefit, holding, usages, date);
  return (s.remaining ?? 1) > 0;
}
