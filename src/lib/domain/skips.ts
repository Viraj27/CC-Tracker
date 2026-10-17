/**
 * Skips and "Don't remind me" mutes on Up next items (docs/SPEC-v4.1-skip.md).
 * Pure: the Up next list is built as before, then split here into what shows
 * and what the owner closed off.
 */
import type { AttentionItem } from "./attention";
import type { Dismissal, MuteKind, ReminderMute, SkipKind } from "./types";

/** One occurrence of an Up next item. */
export interface Occurrence {
  kind: SkipKind;
  holdingId: string;
  benefitId: string | null;
  /** Quarter (`2026-Q4`), statement month (`2026-10`), benefit period key, fee date, or `<kind>@<period>` for unverified items. */
  period: string;
}

/**
 * Stable, deterministic key for an occurrence: `kind:holding[:benefit]:period`,
 * e.g. `rotating:h1:2026-Q4`, `credit:h1:lyft-credit:2026-10`, `af:h1:2026-11-16`.
 * It is also the Up next item's id.
 */
export function occurrenceKey(o: Occurrence): string {
  return [o.kind, o.holdingId, o.benefitId, o.period].filter((x) => x !== null).join(":");
}

/** Stable key for a mute: `rotating:holding` or `benefit:holding:benefit`. */
export function muteKey(m: { kind: MuteKind; holdingId: string; benefitId: string | null }): string {
  return [m.kind, m.holdingId, m.kind === "benefit" ? m.benefitId : null].filter((x) => x !== null).join(":");
}

export function isMuted(mutes: ReminderMute[], holdingId: string, kind: MuteKind, benefitId: string | null = null): boolean {
  const key = muteKey({ kind, holdingId, benefitId });
  return mutes.some((m) => muteKey(m) === key);
}

export type HiddenReason =
  | { type: "skip"; occurrence: Occurrence }
  | { type: "mute"; kind: MuteKind; holdingId: string; benefitId: string | null };

export interface HiddenItem {
  item: AttentionItem;
  reason: HiddenReason;
}

/**
 * Split the current Up next items into visible and hidden. An item is hidden
 * when its own occurrence was skipped, when its reminder is muted, or (for an
 * unverified item) when the item it annotates is hidden; it then carries that
 * item's reason, so restoring one restores both. Only current items can be
 * hidden, so `hidden.length` is the "N skipped" count.
 */
export function splitAttention(
  items: AttentionItem[],
  dismissals: Dismissal[],
  mutes: ReminderMute[],
): { visible: AttentionItem[]; hidden: HiddenItem[] } {
  const skipped = new Set(dismissals.map((d) => occurrenceKey(d)));
  const own = (a: AttentionItem): HiddenReason | null => {
    if (a.mute && isMuted(mutes, a.holdingId, a.mute.kind, a.mute.benefitId)) {
      return { type: "mute", kind: a.mute.kind, holdingId: a.holdingId, benefitId: a.mute.benefitId };
    }
    if (skipped.has(a.id)) return { type: "skip", occurrence: a.occurrence };
    return null;
  };
  const byId = new Map(items.map((a) => [a.id, a]));
  const reasons = new Map<string, HiddenReason | null>();
  for (const a of items) {
    const parent = a.parentId ? byId.get(a.parentId) : undefined;
    reasons.set(a.id, (parent && own(parent)) ?? own(a));
  }
  const visible: AttentionItem[] = [];
  const hidden: HiddenItem[] = [];
  for (const a of items) {
    const reason = reasons.get(a.id);
    if (reason) hidden.push({ item: a, reason });
    else visible.push(a);
  }
  return { visible, hidden };
}
