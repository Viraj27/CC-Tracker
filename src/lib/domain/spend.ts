/** The rough spend profile (docs/SPEC-v8-find-a-card.md §2.1): labels, grouping and the monthly total. */
import { SPEND_CATEGORIES, type SpendCategory } from "../catalog/schema";
import type { Settings } from "./types";

export const SPEND_LABELS: Record<SpendCategory, string> = {
  dining: "Dining",
  groceries: "Groceries",
  gas: "Gas / EV",
  travel: "Travel (general)",
  airfare: "Airfare",
  hotels: "Hotels",
  transit: "Transit / rideshare",
  drugstores: "Drugstores",
  streaming: "Streaming",
  phone: "Phone plan",
  online: "Online shopping",
  entertainment: "Entertainment",
  other: "Everything else",
};

/** Shown first in Settings; the rest sit behind "More categories". */
export const SPEND_COMMON: SpendCategory[] = ["dining", "groceries", "gas", "travel", "online", "other"];
export const SPEND_MORE: SpendCategory[] = SPEND_CATEGORIES.filter((c) => !SPEND_COMMON.includes(c));

/** Total monthly spend: the sum of the profile. 0 when nothing is typed. */
export function monthlySpend(profile: Settings["spendProfile"]): number {
  return SPEND_CATEGORIES.reduce((sum, c) => sum + (profile[c] ?? 0), 0);
}
