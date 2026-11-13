/**
 * Find a card (docs/SPEC-v8-find-a-card.md): rank the catalog cards the owner
 * doesn't hold by what they are worth to them, after the issuer rules. Pure
 * and deterministic: every figure can be rebuilt from the parts returned here.
 */
import { type Card, type Catalog, SPEND_CATEGORIES, type SpendCategory } from "../catalog/schema";
import { baseRate, centsPerPoint } from "./bestCard";
import { chase524Params, countsTowardRule, fiveTwentyFourStatus } from "./fiveTwentyFour";
import { cardFor, holdingName } from "./holdings";
import { round2 } from "./periods";
import { checkApplication, type ApplyCheck } from "./rules";
import { monthlySpend } from "./spend";
import type { FindCardCriteria, Holding, UserData } from "./types";

export const DEFAULT_CRITERIA: FindCardCriteria = { accountType: "personal", goal: "bonus", program: "any", maxFee: null, excludedIssuers: [] };
export const FEE_LIMITS = [0, 100, 250, 550] as const;

/** The stored criteria with every missing key at its default. */
export function criteriaOf(stored: Partial<FindCardCriteria> | undefined): FindCardCriteria {
  return { ...DEFAULT_CRITERIA, ...stored, excludedIssuers: stored?.excludedIssuers ?? [] };
}

/** Assumed spend window when an offer gives a minimum spend but no number of days. */
export const DEFAULT_OFFER_DAYS = 90;

export type ReachState = "reachable" | "stretch" | "out";
export interface Reach {
  state: ReachState;
  /** min spend ÷ (days ÷ 30). */
  neededPerMonth: number;
  monthlySpend: number;
  /** Days used; `assumedDays` when the offer did not say. */
  days: number;
  assumedDays: boolean;
}

/** Whether the minimum spend fits the owner's rough monthly spend. Null with no profile (not judged). */
export function reachOf(minSpend: number | null, days: number | null, monthly: number): Reach | null {
  if (monthly <= 0) return null;
  const d = days ?? DEFAULT_OFFER_DAYS;
  const neededPerMonth = minSpend ? round2(minSpend / (d / 30)) : 0;
  const ratio = neededPerMonth / monthly;
  return { state: ratio <= 1 ? "reachable" : ratio <= 1.5 ? "stretch" : "out", neededPerMonth, monthlySpend: monthly, days: d, assumedDays: days === null };
}

export interface UpliftRow {
  category: SpendCategory;
  monthly: number;
  /** Cents of value per dollar on the candidate, and on the best open card today. */
  candidateCents: number;
  bestCents: number;
  /** The open card it is compared with; null when no open card earns anything there. */
  bestName: string | null;
  /** monthly × 12 × max(0, candidate − best) ÷ 100. */
  value: number;
}

/**
 * What the card would add over a year of the owner's spend: per category, the
 * gain over the best open card. Each rate is valued in cents per dollar with
 * its own program's cents-per-point; non-portal rates only, rotating bonuses
 * left out. Null for a card with no earn rates (a stub).
 */
export function everydayUplift(card: Card, data: Pick<UserData, "holdings" | "settings" | "points">, catalog: Pick<Catalog, "cards" | "programs">): { total: number; rows: UpliftRow[] } | null {
  if (card.earn_rates.length === 0) return null;
  const cents = (c: Card, category: SpendCategory) => (baseRate(c, category, { portal: false })?.rate ?? 0) * centsPerPoint(c.rewards_program, catalog, data.settings, data.points);
  const open = data.holdings.filter((h) => h.status === "open").map((h) => ({ h, card: cardFor(h, catalog) })).filter((x): x is { h: Holding; card: Card } => !!x.card);
  const rows: UpliftRow[] = [];
  for (const category of SPEND_CATEGORIES) {
    const monthly = data.settings.spendProfile[category] ?? 0;
    if (monthly <= 0) continue;
    let best: { cents: number; name: string } | null = null;
    for (const o of open) {
      const c = cents(o.card, category);
      if (c > 0 && (!best || c > best.cents)) best = { cents: c, name: holdingName(o.h, o.card) };
    }
    const candidateCents = cents(card, category);
    const bestCents = best?.cents ?? 0;
    rows.push({ category, monthly, candidateCents, bestCents, bestName: best?.name ?? null, value: round2((monthly * 12 * Math.max(0, candidateCents - bestCents)) / 100) });
  }
  rows.sort((a, b) => b.value - a.value || a.category.localeCompare(b.category));
  return { total: round2(rows.reduce((s, r) => s + r.value, 0)), rows };
}

/** A full card's dollar credits over a year, as information (never ranked on). Null when it lists none. */
export function yearlyCredits(card: Card, today: string): number | null {
  const perYear = { monthly: 12, quarterly: 4, semiannual: 2, calendar_year: 1, cardmember_year: 1 } as const;
  let total = 0;
  let any = false;
  for (const b of card.benefits) {
    if (b.kind !== "credit" || !b.amount || !(b.cycle in perYear)) continue;
    if ((b.ends_on && b.ends_on < today) || (b.starts_on && b.starts_on > today)) continue;
    total += b.amount * perYear[b.cycle as keyof typeof perYear];
    any = true;
  }
  return any ? round2(total) : null;
}

/** The current bonus is elevated when at least three earlier offers are known and it beats their median. */
export function isElevated(currentBonus: number, earlierBonuses: number[]): boolean {
  if (earlierBonuses.length < 3) return false;
  const s = [...earlierBonuses].sort((a, b) => a - b);
  const mid = s.length / 2;
  const median = s.length % 2 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2;
  return currentBonus > median;
}

export type EligibilityState = "ok" | "check" | "blocked";

export interface Candidate {
  card: Card;
  /** USD value of the public offer; null without one. */
  bonusValue: number | null;
  /** Cents per point used for the bonus (100 for cash). */
  bonusCpp: number;
  /** Fee paid in year one: 0 when the first year is waived. */
  firstYearFee: number;
  annualFee: number;
  /** bonus value − first-year fee; null without a public offer. */
  netBonus: number | null;
  reach: Reach | null;
  uplift: { total: number; rows: UpliftRow[] } | null;
  /** everyday uplift − annual fee; null when the uplift is. */
  netEveryday: number | null;
  credits: number | null;
  eligibility: {
    state: EligibilityState;
    check: ApplyCheck;
    /** blocked: the rules that say no; check: the ones to read. */
    reasons: string[];
    /** blocked: when it changes, if every blocking rule gives a date. */
    eligibleFrom: string | null;
    /** No issuer rule in the catalog applies to this card. */
    noRules: boolean;
  };
  /** Set when the card would count toward 5/24: the count after opening it, and the count the rule denies at. */
  fiveTwentyFour: { after: number; limit: number } | null;
  elevated: boolean;
}

function eligibilityOf(check: ApplyCheck): Candidate["eligibility"] {
  const verdicts = [check.approval, check.bonus];
  const noRules = check.evaluations.length === 0;
  const failed = verdicts.filter((v) => v.outcome === "fail");
  if (failed.length) {
    const dates = failed.map((v) => v.eligibleFrom);
    return {
      state: "blocked",
      check,
      reasons: [...new Set(failed.flatMap((v) => v.rules.map((r) => r.name)))],
      eligibleFrom: dates.every((d): d is string => !!d) ? [...dates].sort().at(-1)! : null,
      noRules,
    };
  }
  const manual = verdicts.filter((v) => v.outcome === "manual");
  if (manual.length) return { state: "check", check, reasons: [...new Set(manual.flatMap((v) => v.rules.map((r) => r.name)))], eligibleFrom: null, noRules };
  return { state: "ok", check, reasons: [], eligibleFrom: null, noRules };
}

export interface FindResult {
  ranked: Candidate[];
  /** Likely denied, or not eligible for the bonus: each with its reason. */
  notNow: Candidate[];
  monthlySpend: number;
  /** Ranked programs still valued at the catalog's default cents per point (names). */
  defaultValued: string[];
  /** The newest `as_of` among ranked offers. */
  newestAsOf: string | null;
}

const REACH_ORDER: Record<ReachState, number> = { reachable: 0, stretch: 1, out: 2 };

export function matchesCriteria(card: Card, criteria: FindCardCriteria, catalog: Pick<Catalog, "programs">): boolean {
  if (criteria.accountType !== "both" && card.account_type !== criteria.accountType) return false;
  if (criteria.excludedIssuers.includes(card.issuer)) return false;
  if (criteria.maxFee !== null && (card.annual_fee.amount ?? Infinity) > criteria.maxFee) return false;
  if (criteria.program === "cash") return catalog.programs.find((p) => p.id === card.rewards_program)?.kind === "cash";
  if (criteria.program !== "any" && card.rewards_program !== criteria.program) return false;
  return true;
}

/**
 * Rank the catalog cards with no open holding. `offerHistory` (card id →
 * earlier bonuses) comes from the daily refresh's changelog when there is one.
 */
export function findCards(
  catalog: Catalog,
  data: Pick<UserData, "holdings" | "settings" | "points" | "welcomeOffers">,
  criteria: FindCardCriteria,
  today: string,
  offerHistory: Record<string, number[]> = {},
): FindResult {
  const held = new Set(data.holdings.filter((h) => h.status === "open").map((h) => h.catalogCardId));
  const monthly = monthlySpend(data.settings.spendProfile);
  const params = chase524Params(catalog);
  const status = fiveTwentyFourStatus(data.holdings, catalog, today, params);
  const all: Candidate[] = [];
  for (const card of catalog.cards) {
    if (held.has(card.id) || !matchesCriteria(card, criteria, catalog)) continue;
    const offer = card.public_offer ?? null;
    const cpp = offer?.unit === "usd" ? 100 : centsPerPoint(card.rewards_program, catalog, data.settings, data.points);
    const bonusValue = offer ? round2((offer.bonus * cpp) / 100) : null;
    const annualFee = card.annual_fee.amount ?? 0;
    const firstYearFee = card.annual_fee.first_year_waived ? 0 : annualFee;
    const uplift = everydayUplift(card, data, catalog);
    const hypothetical: Holding = {
      id: "__candidate__", catalogCardId: card.id, nickname: null, issuer: null, accountType: null, approvalDate: today, status: "open",
      closedDate: null, productChangedFromId: null, afMonth: null, afDay: null, afRefundDays: null, paymentDueDay: null, notes: null,
    };
    all.push({
      card,
      bonusValue,
      bonusCpp: cpp,
      firstYearFee,
      annualFee,
      netBonus: bonusValue === null ? null : round2(bonusValue - firstYearFee),
      reach: offer ? reachOf(offer.min_spend, offer.days, monthly) : null,
      uplift,
      netEveryday: uplift ? round2(uplift.total - annualFee) : null,
      credits: yearlyCredits(card, today),
      eligibility: eligibilityOf(checkApplication(card, data.holdings, catalog, today, { nll: false, offers: data.welcomeOffers })),
      fiveTwentyFour: countsTowardRule(hypothetical, catalog, params) ? { after: status.count + 1, limit: params.max_new_accounts + 1 } : null,
      elevated: offer ? isElevated(offer.bonus, offerHistory[card.id] ?? []) : false,
    });
  }
  const name = (a: Candidate, b: Candidate) => a.card.name.localeCompare(b.card.name);
  const byBonus = (a: Candidate, b: Candidate) =>
    Number(a.netBonus === null) - Number(b.netBonus === null) ||
    (a.reach ? REACH_ORDER[a.reach.state] : 0) - (b.reach ? REACH_ORDER[b.reach.state] : 0) ||
    (b.netBonus ?? 0) - (a.netBonus ?? 0) ||
    name(a, b);
  const byEveryday = (a: Candidate, b: Candidate) =>
    Number(a.netEveryday === null) - Number(b.netEveryday === null) || (b.netEveryday ?? 0) - (a.netEveryday ?? 0) || name(a, b);
  const sort = criteria.goal === "bonus" ? byBonus : byEveryday;
  const ranked = all.filter((c) => c.eligibility.state !== "blocked").sort(sort);
  const notNow = all.filter((c) => c.eligibility.state === "blocked").sort(sort);

  const defaults = new Set<string>();
  for (const c of ranked) {
    if (c.card.public_offer?.unit === "usd" && criteria.goal === "bonus") continue;
    const id = c.card.rewards_program;
    const program = catalog.programs.find((p) => p.id === id);
    if (!program || program.kind === "cash") continue;
    const own = data.points.find((p) => p.program === id)?.centsPerPoint || data.settings.centsPerPoint[id];
    if (!own) defaults.add(program.name);
  }
  const dates = ranked.map((c) => c.card.public_offer?.as_of).filter((d): d is string => !!d).sort();
  return { ranked, notNow, monthlySpend: monthly, defaultValued: [...defaults].sort(), newestAsOf: dates.at(-1) ?? null };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** `60K pts · $4,000 in 3 mo`: the offer in a row. */
export function offerLine(card: Card): string {
  const o = card.public_offer;
  if (!o) return "No public offer on file";
  const k = o.bonus >= 1000 ? `${Math.round(o.bonus / 100) / 10}K` : String(o.bonus);
  const bonus = o.unit === "usd" ? usd(o.bonus) : `${k} ${o.unit === "miles" ? "mi" : "pts"}`;
  if (o.min_spend === null) return `${bonus} · no minimum spend`;
  return `${bonus} · ${usd(o.min_spend)}${o.days ? ` in ${Math.max(1, Math.round(o.days / 30))} mo` : ""}`;
}

/**
 * "Copy my situation" (§6): plain text for pasting into a chat. Built here so
 * it is testable; the page only puts it on the clipboard.
 */
export function situationText(catalog: Catalog, data: Pick<UserData, "holdings" | "settings" | "points" | "welcomeOffers">, criteria: FindCardCriteria, result: FindResult, today: string): string {
  const lines: string[] = [`My credit card situation (as of ${today})`, ""];
  const open = data.holdings.filter((h) => h.status === "open");
  lines.push(`Open cards (${open.length}):`);
  for (const h of [...open].sort((a, b) => a.approvalDate.localeCompare(b.approvalDate))) {
    const card = cardFor(h, catalog);
    lines.push(`- ${card?.name ?? h.nickname ?? "Card"}${card ? ` (${card.account_type})` : ""}, opened ${h.approvalDate}${card?.annual_fee.amount ? `, $${card.annual_fee.amount} annual fee` : ""}`);
  }
  const status = fiveTwentyFourStatus(data.holdings, catalog, today, chase524Params(catalog));
  lines.push("", `5/24: ${status.count}/24${status.nextDropOff ? `, next drops off ${status.nextDropOff.dropOffDate}` : ""}`);
  if (data.points.length) {
    lines.push("", "Points:");
    for (const p of data.points) {
      const program = catalog.programs.find((x) => x.id === p.program);
      lines.push(`- ${program?.name ?? p.program}: ${p.balance.toLocaleString("en-US")} (valued at ${centsPerPoint(p.program, catalog, data.settings, data.points)}¢ each)`);
    }
  }
  const spend = SPEND_CATEGORIES.filter((c) => (data.settings.spendProfile[c] ?? 0) > 0);
  lines.push("", spend.length ? `Rough monthly spend (total ${usd(result.monthlySpend)}):` : "Rough monthly spend: not entered");
  for (const c of spend) lines.push(`- ${c}: ${usd(data.settings.spendProfile[c]!)}`);
  const fee = criteria.maxFee === null ? "no limit" : `up to $${criteria.maxFee}`;
  const programName = criteria.program === "any" ? "any" : criteria.program === "cash" ? "cash back" : (catalog.programs.find((p) => p.id === criteria.program)?.name ?? criteria.program);
  lines.push(
    "",
    `Looking for: ${criteria.accountType === "both" ? "personal or business" : criteria.accountType} cards; goal: ${criteria.goal === "bonus" ? "welcome bonus" : "everyday value"}; points in: ${programName}; annual fee: ${fee}${criteria.excludedIssuers.length ? `; not from: ${criteria.excludedIssuers.join(", ")}` : ""}`,
    "",
    `Top ${Math.min(5, result.ranked.length)} from my tracker (public offers, may be out of date):`,
  );
  result.ranked.slice(0, 5).forEach((c, i) => {
    const value = criteria.goal === "bonus" ? c.netBonus : c.netEveryday;
    const parts = [offerLine(c.card), `annual fee $${c.annualFee}${c.card.annual_fee.first_year_waived ? " (waived year one)" : ""}`];
    if (value !== null) parts.push(`net ${criteria.goal === "bonus" ? "first-year" : "yearly"} value about ${usd(value)}`);
    if (c.reach) parts.push(c.reach.state === "reachable" ? "spend reachable" : c.reach.state === "stretch" ? "spend is a stretch" : "spend out of reach");
    if (c.eligibility.state === "check") parts.push(`check: ${c.eligibility.reasons.join(", ")}`);
    if (c.card.public_offer) parts.push(`offer as of ${c.card.public_offer.as_of}`);
    lines.push(`${i + 1}. ${c.card.name}: ${parts.join("; ")}`);
  });
  return lines.join("\n");
}
