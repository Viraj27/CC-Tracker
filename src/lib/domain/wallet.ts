/**
 * The Wallet view's derived state: stack order, the chip on each card face and
 * the one-sentence headline above a card's details. Pure; nothing is stored.
 */
import type { AttentionItem } from "./attention";
import type { Holding } from "./types";

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

const inDays = (n: number) => (n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/** Items that drive urgency (an "unverified" item only annotates another one). */
function actionable(items: AttentionItem[], holdingId: string): AttentionItem[] {
  return items.filter((a) => a.holdingId === holdingId && a.kind !== "unverified");
}

export interface WalletEntry {
  holding: Holding;
  name: string;
  /** Annual fee in USD (0 when none or unknown). */
  fee: number;
}

/**
 * Stack order (before the selected card is pulled to the front): open cards by
 * urgency (soonest fee / expiring credit / payment), then by fee size; closed
 * and product-changed cards last.
 */
export function walletOrder<T extends WalletEntry>(entries: T[], attention: AttentionItem[]): T[] {
  const urgency = (e: T) => Math.min(Infinity, ...actionable(attention, e.holding.id).map((a) => a.daysUntil));
  const open = (e: T) => (e.holding.status === "open" ? 0 : 1);
  return [...entries].sort(
    (a, b) => open(a) - open(b) || urgency(a) - urgency(b) || b.fee - a.fee || a.name.localeCompare(b.name),
  );
}

/** Short mono state on the card face, e.g. `PAST DUE`, `FEE IN 30D`; null when nothing is pending. */
export function cardChip(holding: Holding, attention: AttentionItem[]): string | null {
  if (holding.status === "closed") return "CLOSED";
  if (holding.status === "product_changed") return "CHANGED";
  const first = actionable(attention, holding.id)[0];
  if (!first) return null;
  const d = Math.max(0, first.daysUntil);
  switch (first.kind) {
    case "payment":
      return first.daysUntil < 0 ? "PAST DUE" : d === 0 ? "DUE TODAY" : `DUE IN ${d}D`;
    case "af":
      return d === 0 ? "FEE TODAY" : `FEE IN ${d}D`;
    case "credit":
      return d === 0 ? "CREDIT TODAY" : `CREDIT ${d}D`;
    case "rotating":
      return "ACTIVATE 5%";
    default:
      return null;
  }
}

/** One sentence from the card's state, e.g. "Fee posts in 30 days. Use the $250 of credits left first." */
export function cardHeadline(input: {
  holding: Holding;
  attention: AttentionItem[];
  /** Unused value of this period's dollar credits. */
  unusedCredits: number;
  fee: number;
  realized: number;
}): string {
  const { holding, unusedCredits, fee, realized } = input;
  if (holding.status === "closed") return "Closed. Its history and logs stay here.";
  if (holding.status === "product_changed") return "Product-changed to another card. Its history stays here.";
  const items = actionable(input.attention, holding.id);
  const pastDue = items.find((a) => a.kind === "payment" && a.daysUntil < 0);
  if (pastDue) return "Payment is past due. Mark it paid once it's settled.";
  const first = items[0];
  if (first?.kind === "af") {
    return `Fee posts ${inDays(first.daysUntil)}. ${
      unusedCredits > 0 ? `Use the ${usd(unusedCredits)} of credits left first.` : "Keep, downgrade or cancel?"
    }`;
  }
  if (first?.kind === "credit") {
    return `${usd(first.amount ?? 0)} of ${first.benefitName ?? "a credit"} expires ${inDays(first.daysUntil)}.`;
  }
  if (first?.kind === "payment") return `Payment due ${inDays(first.daysUntil)}.`;
  if (first?.kind === "rotating") return "Activate this quarter's 5% categories.";
  if (fee > 0) {
    return `${usd(realized)} realized against the ${usd(fee)} fee this year.${
      unusedCredits > 0 ? ` ${usd(unusedCredits)} of credits unused.` : ""
    }`;
  }
  return unusedCredits > 0 ? `${usd(unusedCredits)} of credits unused this period.` : "No annual fee. Nothing needs attention.";
}
