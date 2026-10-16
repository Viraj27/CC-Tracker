import type { Benefit, Card, Catalog } from "../catalog/schema";
import { addDays, lastAnniversary, nextAnniversary, parseIso } from "./dates";
import { benefitStatus, round2 } from "./periods";
import type { BenefitUsage, Holding, Settings } from "./types";

/** The AF year containing `today`: from the last AF posting date (or approval anniversary). */
export function afYear(holding: Holding, today: string): { start: string; end: string } {
  const { m, d } = holding.afMonth && holding.afDay
    ? { m: holding.afMonth, d: holding.afDay }
    : parseIso(holding.approvalDate);
  const start = lastAnniversary(m, d, today);
  const next = nextAnniversary(m, d, addDays(start, 1));
  return { start, end: addDays(next, -1) };
}

/** Next AF posting date on or after `today` (actual AF month/day, else approval anniversary). */
export function nextAfDate(holding: Holding, today: string): { date: string; estimated: boolean } {
  if (holding.afMonth && holding.afDay) {
    return { date: nextAnniversary(holding.afMonth, holding.afDay, today), estimated: false };
  }
  const { m, d } = parseIso(holding.approvalDate);
  return { date: nextAnniversary(m, d, today), estimated: true };
}

export function perkUnitValue(
  benefit: Benefit,
  catalog: Pick<Catalog, "perkDefaults">,
  settings: Pick<Settings, "perkValueOverrides">,
): number | null {
  if (!benefit.perk_default) return null;
  const override = settings.perkValueOverrides[benefit.perk_default];
  if (override !== undefined) return override;
  return catalog.perkDefaults.find((p) => p.id === benefit.perk_default)?.value_usd ?? null;
}

/** USD value of a single logged use. */
export function usageValue(
  usage: BenefitUsage,
  benefit: Benefit | undefined,
  catalog: Pick<Catalog, "perkDefaults">,
  settings: Pick<Settings, "perkValueOverrides">,
): number {
  if (usage.valueOverride !== null && usage.valueOverride !== undefined) return usage.valueOverride;
  if (!benefit) return 0;
  if (benefit.kind === "credit") return usage.amount;
  if (benefit.kind === "perk") return usage.amount * (perkUnitValue(benefit, catalog, settings) ?? 0);
  return 0;
}

export interface RoiResult {
  start: string;
  end: string;
  annualFee: number;
  realized: number;
  net: number;
  /** realized / AF; null when there is no fee. */
  ratio: number | null;
  breakdown: { benefitId: string; name: string; value: number; uses: number }[];
}

export function cardRoi(
  holding: Holding,
  card: Card | null,
  usages: BenefitUsage[],
  catalog: Pick<Catalog, "perkDefaults">,
  settings: Pick<Settings, "perkValueOverrides">,
  today: string,
): RoiResult {
  const { start, end } = afYear(holding, today);
  const annualFee = card?.annual_fee.amount ?? 0;
  const map = new Map<string, { benefitId: string; name: string; value: number; uses: number }>();
  for (const u of usages) {
    if (u.holdingId !== holding.id || u.date < start || u.date > end) continue;
    const benefit = card?.benefits.find((b) => b.id === u.benefitId);
    const value = usageValue(u, benefit, catalog, settings);
    const row = map.get(u.benefitId) ?? { benefitId: u.benefitId, name: benefit?.name ?? u.benefitId, value: 0, uses: 0 };
    row.value = round2(row.value + value);
    row.uses += 1;
    map.set(u.benefitId, row);
  }
  const breakdown = [...map.values()].sort((a, b) => b.value - a.value);
  const realized = round2(breakdown.reduce((s, r) => s + r.value, 0));
  return {
    start,
    end,
    annualFee,
    realized,
    net: round2(realized - annualFee),
    ratio: annualFee > 0 ? round2(realized / annualFee) : null,
    breakdown,
  };
}

export interface Utilization {
  used: number;
  available: number;
  /** 0–1; null when the card has no quantified credits this cycle. */
  pct: number | null;
}

/** Value used / value available across the card's dollar credits in their current periods. */
export function cardUtilization(
  holding: Holding,
  card: Card | null,
  usages: BenefitUsage[],
  today: string,
): Utilization {
  let used = 0;
  let available = 0;
  for (const b of card?.benefits ?? []) {
    if (b.kind !== "credit" || b.amount === null || b.amount === 0) continue;
    if (b.cycle === "per_use" || b.cycle === "none") continue;
    const s = benefitStatus(b, holding, usages, today);
    if (!s.active) continue;
    available += b.amount;
    used += Math.min(s.used, b.amount);
  }
  return { used: round2(used), available: round2(available), pct: available > 0 ? used / available : null };
}
