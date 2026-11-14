"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { markDealsSeen, setDealDismissed } from "@/app/actions";
import { useApp } from "@/components/AppState";
import { Badge, CELL, Empty, Group, GroupLabel, PageTitle, Provenance } from "@/components/ui";
import type { ChangelogEntry, Deal } from "@/lib/catalog/schema";
import { monthDay } from "@/lib/domain/dates";
import { changeLine, dealEnds, feedStatus, groupDeals, recentChanges, reportUrl } from "@/lib/domain/deals";

/**
 * Deals (docs/SPEC-v9-daily-refresh.md §4.4, §5.4): the daily refresh's feed,
 * grouped for the owner's cards in the app, and the catalog facts it changed.
 * Nothing is fetched when the page opens; it shows the last run's date.
 */
export default function DealsPage() {
  const { catalog, data, today, mutate } = useApp();
  const { feed } = catalog;
  const [showDismissed, setShowDismissed] = useState(false);
  const [cardFilter, setCardFilter] = useState<string | null>(null);
  useEffect(() => setCardFilter(new URLSearchParams(window.location.search).get("card")), []);

  const groups = useMemo(() => groupDeals(feed.deals, data.holdings, catalog, data.settings.dismissedDeals, today), [feed.deals, data.holdings, data.settings.dismissedDeals, catalog, today]);
  const changes = useMemo(() => recentChanges(feed.changelog, today, undefined, cardFilter ?? undefined), [feed.changelog, today, cardFilter]);
  const reported = useMemo(() => groups.reported.filter((d) => !cardFilter || d.card_id === cardFilter), [groups.reported, cardFilter]);
  const status = feedStatus(feed.meta, today);
  const cardName = (id: string | null) => catalog.cards.find((c) => c.id === id);
  const sourceName = (id: string) => feed.sources.find((s) => s.id === id)?.name ?? id;

  // Opening the page marks this run as seen (clears the dot on More).
  const ranAt = feed.meta.ran_at?.slice(0, 10) ?? null;
  const seenAt = data.settings.dealsSeenAt;
  useEffect(() => {
    if (ranAt && seenAt !== ranAt) mutate((d) => ({ ...d, settings: { ...d.settings, dealsSeenAt: ranAt } }), () => markDealsSeen(ranAt));
  }, [ranAt, seenAt, mutate]);

  const dismiss = (id: string, dismissed: boolean) =>
    mutate(
      (d) => ({ ...d, settings: { ...d.settings, dismissedDeals: dismissed ? [...d.settings.dismissedDeals.filter((x) => x !== id), id] : d.settings.dismissedDeals.filter((x) => x !== id) } }),
      () => setDealDismissed({ dealId: id, dismissed }),
    );

  const dealRow = (d: Deal, restored = false) => {
    const ends = d.expires ? ` · ends ${monthDay(d.expires)}` : "";
    const inCatalog = d.kind === "card_offer" && d.card_id && cardName(d.card_id);
    return (
      <li key={d.id} data-testid={`deal-${d.id}`} className="flex min-h-14 items-center gap-1 pr-2">
        <a href={d.url} target="_blank" rel="noreferrer" className="flex min-h-14 min-w-0 flex-1 flex-col justify-center px-4 py-2 hover:bg-text/[0.03]">
          <span className="truncate leading-snug font-semibold">{d.title}</span>
          <span className="block truncate text-sm text-muted">
            {sourceName(d.source)} · {monthDay(d.published)}
            {ends}
            {d.kind === "reported_change" && ` · retrying until ${monthDay(dealEnds(d))}`}
          </span>
        </a>
        {inCatalog && (
          <Link href={`/apply?card=${d.card_id}`} className="shrink-0 px-2 text-sm font-medium underline decoration-dotted underline-offset-2" aria-label={`Should I apply? — ${d.title}`}>
            Apply?
          </Link>
        )}
        <button
          type="button"
          className="min-h-11 shrink-0 px-2 text-sm text-muted hover:text-text"
          aria-label={`${restored ? "Restore" : "Dismiss"} — ${d.title}`}
          onClick={() => dismiss(d.id, !restored)}
        >
          {restored ? "Restore" : "Dismiss"}
        </button>
      </li>
    );
  };

  const group = (label: string, testId: string, deals: Deal[], empty: string) => (
    <>
      <GroupLabel>
        {label} · {deals.length}
      </GroupLabel>
      {deals.length === 0 ? <Empty>{empty}</Empty> : <Group data-testid={testId}>{deals.map((d) => dealRow(d))}</Group>}
    </>
  );

  const changeRow = (e: ChangelogEntry) => {
    const card = cardName(e.card_id);
    return (
      <li key={`${e.date}|${e.card_id}|${e.path}`} className={`${CELL} flex flex-wrap items-center gap-x-1.5 gap-y-0.5`} data-testid="change-row">
        <span className="min-w-0 flex-1">
          <span className="block leading-snug font-medium">{changeLine(e, card, today)}</span>
          <span className="block font-mono text-[11px] tracking-wider text-muted uppercase">Changed {monthDay(e.date)}</span>
        </span>
        <Provenance
          flow
          fact={{ source_url: e.source_url, last_verified: e.date, verified: true, source_type: e.confirmed_by === "official_page" ? "official" : "community" }}
          description={e.confirmed_by === "official_page" ? "Confirmed on the issuer's page before the catalog was changed." : "A public offer from a community post; it only ever prefills the welcome offer form."}
        />
        <a href={reportUrl(e, card)} target="_blank" rel="noreferrer" className="basis-full text-sm text-muted underline decoration-dotted underline-offset-2 hover:text-text">
          Something looks wrong? Report
        </a>
      </li>
    );
  };

  return (
    <div className="flex flex-col">
      <PageTitle help="A scheduled routine reads public feeds once a day and updates these files in the catalog. The app fetches nothing when opened. Everything here is community-sourced; which items are for your cards is worked out in the app, so the repository never learns what you hold.">
        Deals
      </PageTitle>
      <p role="status" data-testid="deals-status" data-stale={status.stale || undefined} className={`px-1 text-sm ${status.stale || status.failed ? "font-semibold text-warn" : "text-muted"}`}>
        {status.text}
        {status.failed && ` · the last run failed${feed.meta.reason ? `: ${feed.meta.reason}` : ""}`}
        {!status.stale && !status.failed && " · community-sourced"}
      </p>

      {group("For your cards", "deals-yours", groups.yours, "Nothing for the cards you hold right now.")}
      {group("New card offers", "deals-card-offers", groups.cardOffers, "No card offers in the feed.")}
      {group("Shopping", "deals-shopping", groups.shopping, "No shopping deals in the feed.")}

      <GroupLabel id="changed">
        What changed · {changes.length + reported.length}
        {cardFilter && cardName(cardFilter) ? ` · ${cardName(cardFilter)!.name}` : ""}
      </GroupLabel>
      {cardFilter && (
        <p className="mb-2 px-1 text-sm">
          <button type="button" className="underline decoration-dotted underline-offset-2" onClick={() => setCardFilter(null)}>
            Show every card
          </button>
        </p>
      )}
      {changes.length + reported.length === 0 ? (
        <Empty>No catalog facts changed in the last 60 days.</Empty>
      ) : (
        <Group data-testid="deals-changed">
          {reported.map((d) => (
              <li key={d.id} data-testid={`deal-${d.id}`} className={`${CELL} flex flex-wrap items-center gap-x-2`}>
                <Badge tone="warn">Reported</Badge>
                <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 font-medium underline decoration-dotted underline-offset-2">
                  {d.title}
                </a>
                <span className="basis-full text-sm text-muted">
                  {sourceName(d.source)} · {monthDay(d.published)} · not confirmed on the issuer&apos;s page, so the catalog is unchanged · retrying until {monthDay(dealEnds(d))}
                </span>
            </li>
          ))}
          {changes.map(changeRow)}
        </Group>
      )}

      {groups.dismissed.length > 0 && (
        <div className="mt-4">
          <button type="button" data-testid="deals-show-dismissed" className="min-h-11 px-1 font-mono text-[11px] tracking-wider text-muted uppercase hover:text-text" onClick={() => setShowDismissed((s) => !s)}>
            {groups.dismissed.length} dismissed · {showDismissed ? "hide" : "show"}
          </button>
          {showDismissed && <Group data-testid="deals-dismissed">{groups.dismissed.map((d) => dealRow(d, true))}</Group>}
        </div>
      )}
    </div>
  );
}
