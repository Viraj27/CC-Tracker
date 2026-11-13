/**
 * Deals and "What changed" (docs/SPEC-v9-daily-refresh.md §4, §5.4): the daily
 * refresh writes public feed files; which items are "for your cards" is worked
 * out here, at render time, from the owner's holdings. Pure.
 */
import type { Card, Catalog, ChangelogEntry, Deal, FeedMeta } from "../catalog/schema";
import { addDays, diffDays, monthDay, shortDate } from "./dates";
import { cardFor } from "./holdings";
import type { Holding } from "./types";

/** An item with no `expires` leaves the feed this many days after it was published. */
export const DEAL_RETENTION_DAYS = 30;
/** An unconfirmed reported change is retried, and shown, for this many days. */
export const REPORTED_RETRY_DAYS = 30;
/** The run date turns into a warning once it is older than this. */
export const STALE_AFTER_DAYS = 3;
export const WHAT_CHANGED_DAYS = 60;
export const CARD_CHIP_DAYS = 30;

/** The last day an item shows. */
export function dealEnds(d: Pick<Deal, "kind" | "published" | "added" | "expires">): string {
  if (d.expires) return d.expires;
  return d.kind === "reported_change" ? addDays(d.added, REPORTED_RETRY_DAYS) : addDays(d.published, DEAL_RETENTION_DAYS);
}

export const isDealLive = (d: Deal, today: string) => dealEnds(d) >= today;

/** Retention (§4.2): what the routine keeps in `deals.json`, newest first. */
export function pruneDeals(deals: Deal[], today: string): Deal[] {
  return deals.filter((d) => isDealLive(d, today)).sort((a, b) => b.published.localeCompare(a.published) || a.id.localeCompare(b.id));
}

export interface DealGroups {
  /** `card_id` matches an open holding, or a card-linked offer from an issuer the owner has a card with. */
  yours: Deal[];
  /** Other card offers. */
  cardOffers: Deal[];
  /** Shopping deals, and card-linked offers for issuers the owner has no card with. */
  shopping: Deal[];
  /** Changes a post reported that the issuer's page has not confirmed. */
  reported: Deal[];
  dismissed: Deal[];
}

/** Group the live feed for the owner (§4.4). Nothing about holdings is stored: this runs in the app. */
export function groupDeals(deals: Deal[], holdings: Holding[], catalog: Pick<Catalog, "cards">, dismissedIds: string[], today: string): DealGroups {
  const open = holdings.filter((h) => h.status === "open");
  const heldCards = new Set(open.map((h) => h.catalogCardId).filter((x): x is string => !!x));
  const heldIssuers = new Set(open.map((h) => cardFor(h, catalog)?.issuer ?? h.issuer).filter((x): x is string => !!x));
  const dismissed = new Set(dismissedIds);
  const g: DealGroups = { yours: [], cardOffers: [], shopping: [], reported: [], dismissed: [] };
  for (const d of pruneDeals(deals, today)) {
    if (dismissed.has(d.id)) g.dismissed.push(d);
    else if (d.kind === "reported_change") g.reported.push(d);
    else if ((d.card_id && heldCards.has(d.card_id)) || (d.kind === "card_linked" && d.issuer && heldIssuers.has(d.issuer))) g.yours.push(d);
    else if (d.kind === "card_offer") g.cardOffers.push(d);
    else g.shopping.push(d);
  }
  return g;
}

/** `Updated Nov 12`, or the warning once the run is more than 3 days old (§4.4, §7). */
export function feedStatus(meta: FeedMeta, today: string): { text: string; stale: boolean; failed: boolean } {
  if (!meta.ran_at) return { text: "Not updated yet", stale: true, failed: false };
  const ran = meta.ran_at.slice(0, 10);
  const stale = diffDays(ran, today) > STALE_AFTER_DAYS;
  return { text: stale ? `Not updated since ${monthDay(ran)}` : `Updated ${monthDay(ran)}`, stale, failed: meta.status === "failed" };
}

/** "For your cards" items added since the Deals page was last opened: the dot on More (§4.4). */
export function unseenDeals(yours: Deal[], seenAt: string | null): number {
  const seen = seenAt?.slice(0, 10) ?? "";
  return yours.filter((d) => d.added > seen).length;
}

/** Changelog entries from the last `days`, newest first; optionally one card's (§5.4). */
export function recentChanges(changelog: ChangelogEntry[], today: string, days = WHAT_CHANGED_DAYS, cardId?: string): ChangelogEntry[] {
  const from = addDays(today, -days);
  return changelog
    .filter((e) => e.date >= from && e.date <= today && (!cardId || e.card_id === cardId))
    .sort((a, b) => b.date.localeCompare(a.date) || a.card_id.localeCompare(b.card_id) || a.path.localeCompare(b.path));
}

/** `CHANGED NOV 12`: a card with a changelog entry in the last 30 days. */
export function cardChangedChip(changelog: ChangelogEntry[], cardId: string | null, today: string): string | null {
  if (!cardId) return null;
  const latest = recentChanges(changelog, today, CARD_CHIP_DAYS, cardId)[0];
  if (!latest) return null;
  return `CHANGED ${shortDate(latest.date, today).replace(/^(\d+) (\w+)/, "$2 $1")}`;
}

const show = (v: ChangelogEntry["from"]) => (v === null ? "none" : typeof v === "number" ? v.toLocaleString("en-US") : String(v));

/** `Sapphire Reserve · DoorDash credit · $5/mo → $10/mo · from Jan 1`. */
export function changeLine(e: ChangelogEntry, card: Pick<Card, "name"> | undefined, today: string): string {
  const when = e.effective && e.effective > today ? ` · from ${monthDay(e.effective)}` : "";
  return `${card?.name ?? e.card_id} · ${e.label} · ${show(e.from)} → ${show(e.to)}${when}`;
}

/** Earlier public bonuses per card, from the changelog: what makes an offer "Elevated" in Find a card. */
export function offerHistory(changelog: ChangelogEntry[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const e of changelog) {
    if (e.path !== "public_offer.bonus" || typeof e.from !== "number") continue;
    (out[e.card_id] ??= []).push(e.from);
  }
  return out;
}

export const REPO_URL = "https://github.com/Viraj27/CC-Tracker";

/** "Something looks wrong": a prefilled GitHub issue (label `refresh`), which also stops the next run re-applying it. */
export function reportUrl(e: ChangelogEntry, card: Pick<Card, "name"> | undefined): string {
  const title = `Refresh: ${card?.name ?? e.card_id} · ${e.label} looks wrong`;
  const body = [
    `Card: ${e.card_id}`,
    `Path: ${e.path}`,
    `From: ${show(e.from)}`,
    `To: ${show(e.to)}`,
    `Changed on: ${e.date}`,
    `Source: ${e.source_url}`,
    `Daily refresh PRs for that day: ${REPO_URL}/pulls?q=is%3Apr+%22Daily+refresh+${e.date}%22`,
    "",
    "What looks wrong:",
    "",
  ].join("\n");
  return `${REPO_URL}/issues/new?labels=refresh&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

// ------------------------------------------------------------ run guards --

/** The run needs the owner when it changed more facts than this in one go (§6). */
export const MAX_AUTO_CHANGES = 10;

export interface GuardResult {
  /** Files outside `catalog/`: a Daily refresh PR may not touch them. */
  outside: string[];
  /** Changelog entries this run added. */
  added: ChangelogEntry[];
  annualFeeChanges: ChangelogEntry[];
  /** `auto`: safe to merge on green CI. `needs-owner`: leave open with that label. `reject`: touched files outside catalog/. */
  decision: "auto" | "needs-owner" | "reject";
  reasons: string[];
}

const entryKey = (e: ChangelogEntry) => `${e.date}|${e.card_id}|${e.path}|${JSON.stringify(e.to)}`;

/**
 * The checks that stand in for a review (§6): only catalog files changed, and
 * the blast radius is small. `changedFiles` are repo-relative paths.
 */
export function guardRun(changedFiles: string[], baseChangelog: ChangelogEntry[], headChangelog: ChangelogEntry[]): GuardResult {
  const outside = changedFiles.filter((f) => !f.startsWith("catalog/"));
  const before = new Set(baseChangelog.map(entryKey));
  const added = headChangelog.filter((e) => !before.has(entryKey(e)));
  const removed = baseChangelog.length - (headChangelog.length - added.length);
  const facts = added.filter((e) => !e.path.startsWith("public_offer"));
  const annualFeeChanges = added.filter((e) => e.path.startsWith("annual_fee"));
  const reasons: string[] = [];
  if (outside.length) reasons.push(`touches files outside catalog/: ${outside.join(", ")}`);
  if (removed > 0) reasons.push(`${removed} earlier changelog entr${removed === 1 ? "y was" : "ies were"} removed or rewritten`);
  if (facts.length > MAX_AUTO_CHANGES) reasons.push(`${facts.length} catalog facts changed (more than ${MAX_AUTO_CHANGES})`);
  if (annualFeeChanges.length) reasons.push(`annual fee changed for ${[...new Set(annualFeeChanges.map((e) => e.card_id))].join(", ")}`);
  const decision = outside.length ? "reject" : reasons.length ? "needs-owner" : "auto";
  return { outside, added, annualFeeChanges, decision, reasons };
}

/** Benefit ids present on the base branch but missing now: logged usage points at them, so they may never go (§5.3). */
export function missingBenefitIds(base: { id: string; benefits: { id: string }[] }[], head: { id: string; benefits: { id: string }[] }[]): string[] {
  const now = new Map(head.map((c) => [c.id, new Set(c.benefits.map((b) => b.id))]));
  const missing: string[] = [];
  for (const c of base) {
    const ids = now.get(c.id);
    if (!ids) {
      missing.push(`${c.id} (the whole card)`);
      continue;
    }
    for (const b of c.benefits) if (!ids.has(b.id)) missing.push(`${c.id}: ${b.id}`);
  }
  return missing;
}
