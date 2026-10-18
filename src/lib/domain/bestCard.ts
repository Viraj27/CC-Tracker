import type { Card, Catalog, EarnRate, SpendCategory } from "../catalog/schema";
import { quarterOf } from "./dates";
import { cardFor, holdingName } from "./holdings";
import { isActivated, quarterView } from "./rotating";
import { isMuted } from "./skips";
import type { Holding, PointsBalance, ReminderMute, RotatingActivation, Settings } from "./types";

export interface RankedCard {
  holdingId: string;
  name: string;
  brandColor: string;
  /** Rate as stated by the issuer (percent, or points/miles per dollar). */
  rate: number;
  unit: EarnRate["unit"];
  /** Cents of estimated value per dollar spent, used for ranking. */
  centsPerDollar: number;
  cpp: number;
  label: string;
  conditions: string[];
  verified: boolean;
  source: "base" | "rotating";
  /**
   * `portal`: earned only when booked through the issuer's portal (`portalName`).
   * `off`: everywhere else. A card gets a portal row only when it beats its off-portal rate
   * (docs/SPEC-v7-phone-feedback.md §5).
   */
  channel: "portal" | "off";
  portalName?: string;
  /** The off-portal row of a card that also has a portal row: "Booked direct". */
  bookedDirect?: boolean;
  /** Shown when a rotating bonus applies but the quarter isn't activated. */
  hint?: string;
  /** A rotating bonus matches this quarter but the owner turned its activation reminders off. */
  remindersOff?: boolean;
}

/** Cents-per-point used to compare programs: points balance > settings > catalog default. */
export function centsPerPoint(
  programId: string,
  catalog: Pick<Catalog, "programs">,
  settings: Pick<Settings, "centsPerPoint">,
  points: PointsBalance[] = [],
): number {
  const p = points.find((x) => x.program === programId)?.centsPerPoint;
  if (p) return p;
  const s = settings.centsPerPoint[programId];
  if (s) return s;
  return catalog.programs.find((x) => x.id === programId)?.default_cents_per_point ?? 1;
}

const isPortal = (r: EarnRate) => r.channel === "portal";

/**
 * Best base earn rate for a category on a card; falls back to the card's "other" rate.
 * `portal: true` → only portal rates (no fallback); `portal: false` → only rates earned outside a portal.
 */
export function baseRate(card: Card, category: SpendCategory, opts: { portal?: boolean } = {}): EarnRate | null {
  const usable = card.earn_rates.filter((r) => r.rate !== null && (opts.portal === undefined || isPortal(r) === opts.portal));
  const matching = usable.filter((r) => r.categories.includes(category));
  const pool = matching.length || opts.portal ? matching : usable.filter((r) => r.categories.includes("other"));
  return pool.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0] ?? null;
}

/**
 * Rank open cards for a category. Rates are per dollar in the program's
 * currency: 3% or 3x both mean 3 units per dollar (Chase "cash back" on
 * Freedom Flex is paid as Ultimate Rewards points), so value = rate × cpp.
 */
export function rankCards(
  category: SpendCategory,
  holdings: Holding[],
  catalog: Pick<Catalog, "cards" | "programs" | "rotating">,
  settings: Pick<Settings, "centsPerPoint">,
  activations: RotatingActivation[],
  today: string,
  points: PointsBalance[] = [],
  mutes: ReminderMute[] = [],
): RankedCard[] {
  const out: RankedCard[] = [];
  const quarter = quarterOf(today);
  for (const h of holdings) {
    if (h.status !== "open") continue;
    const card = cardFor(h, catalog);
    if (!card) continue;
    const cpp = centsPerPoint(card.rewards_program, catalog, settings, points);
    const base = baseRate(card, category, { portal: false });
    let best: RankedCard | null = base
      ? {
          holdingId: h.id,
          name: holdingName(h, card),
          brandColor: card.brand_color,
          rate: base.rate!,
          unit: base.unit,
          centsPerDollar: base.rate! * cpp,
          cpp,
          label: base.label,
          conditions: [base.conditions, base.cap].filter((x): x is string => !!x),
          verified: base.verified,
          source: "base",
          channel: "off",
        }
      : null;

    const program = card.rotating_program ? catalog.rotating.find((r) => r.id === card.rotating_program) : undefined;
    if (program) {
      const qv = quarterView(program, quarter);
      const match = qv.announced && qv.entry?.categories.find((c) => c.maps_to.includes(category));
      if (match) {
        const activated = isActivated(activations, h.id, quarter);
        if (activated) {
          const cents = program.rate.value * cpp;
          if (!best || cents > best.centsPerDollar) {
            best = {
              holdingId: h.id,
              name: holdingName(h, card),
              brandColor: card.brand_color,
              rate: program.rate.value,
              unit: program.rate.unit,
              centsPerDollar: cents,
              cpp,
              label: `${quarter} bonus: ${match.name}`,
              conditions: [program.rate.cap, "Quarter activated"].filter((x): x is string => !!x),
              verified: program.rate.verified && qv.entry!.verified,
              source: "rotating",
              channel: "off",
            };
          }
        } else if (best) {
          best.hint = `${match.name} earns ${program.rate.value}${program.rate.unit === "percent" ? "%" : "x"} this quarter — activate first.`;
        }
        if (best && isMuted(mutes, h.id, "rotating")) best.remindersOff = true;
      }
    }
    const portal = baseRate(card, category, { portal: true });
    if (portal && portal.rate! > (best?.rate ?? 0)) {
      out.push({
        holdingId: h.id,
        name: holdingName(h, card),
        brandColor: card.brand_color,
        rate: portal.rate!,
        unit: portal.unit,
        centsPerDollar: portal.rate! * cpp,
        cpp,
        label: portal.label,
        conditions: [portal.conditions, portal.cap].filter((x): x is string => !!x),
        verified: portal.verified,
        source: "base",
        channel: "portal",
        portalName: portal.portal_name,
      });
      if (best) best.bookedDirect = true;
    }
    if (best) out.push(best);
  }
  return out.sort(
    (a, b) => b.centsPerDollar - a.centsPerDollar || a.name.localeCompare(b.name) || (a.channel === "portal" ? -1 : 1),
  );
}
