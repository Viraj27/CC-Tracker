"use client";

import { useApp } from "@/components/AppState";
import { useSetActivated } from "@/components/mutations";
import { Badge, Empty, Group, GroupLabel, PageTitle, Provenance } from "@/components/ui";
import { shortDate, quarterBounds } from "@/lib/domain/dates";
import { cardFor, holdingName } from "@/lib/domain/holdings";
import { currentAndNextQuarter, isActivated, type QuarterView } from "@/lib/domain/rotating";
import { isMuted } from "@/lib/domain/skips";

export default function RotatingPage() {
  const { catalog, data, today } = useApp();
  const setActivated = useSetActivated();

  return (
    <div className="flex flex-col">
      <PageTitle help="Quarterly categories from the issuers' official calendars. Activate every quarter. Activated categories also feed Best card.">
        Rotating
      </PageTitle>
      {catalog.rotating.map((program) => {
        const holdings = data.holdings.filter((h) => h.status === "open" && program.card_ids.includes(h.catalogCardId ?? ""));
        const quarters = currentAndNextQuarter(program, today);
        return (
          <section key={program.id} aria-label={program.name}>
            <GroupLabel right={<Provenance fact={program.rate} description={program.rate.cap ?? undefined} className="justify-end" />}>
              {program.name} · {program.rate.value}
              {program.rate.unit === "percent" ? "%" : "x"}
            </GroupLabel>
            <Group>
              {quarters.map((q, i) => (
                <QuarterRow key={q.quarter} q={q} label={i === 0 ? "This quarter" : "Next quarter"} calendarUrl={program.calendar_url} today={today} />
              ))}
              {holdings.length === 0 ? (
                <li className="px-4 py-3">
                  <Empty>You don&apos;t hold a card in this program.</Empty>
                </li>
              ) : (
                holdings.flatMap((h) =>
                  quarters
                    .filter((q) => q.announced)
                    .map((q) => {
                      const active = isActivated(data.activations, h.id, q.quarter);
                      const muted = isMuted(data.mutes, h.id, "rotating");
                      return (
                        <li key={`${h.id}-${q.quarter}`}>
                          <label className="flex min-h-12 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm">
                            <input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActivated(h.id, q.quarter, e.target.checked)} />
                            <span className="min-w-0 flex-1">
                              {holdingName(h, cardFor(h, catalog))} — {q.quarter} activated
                            </span>
                            {!active && q.quarter === quarters[0].quarter && !muted && <Badge tone="warn">Not activated</Badge>}
                            {muted && (
                              <Badge tone="info" title="Up next won't remind you to activate this card. Turn reminders back on from the card's Rotating sheet.">
                                Reminders off
                              </Badge>
                            )}
                          </label>
                        </li>
                      );
                    }),
                )
              )}
            </Group>
          </section>
        );
      })}
    </div>
  );
}

function QuarterRow({ q, label, calendarUrl, today }: { q: QuarterView; label: string; calendarUrl: string; today: string }) {
  const { start, end } = quarterBounds(q.quarter);
  return (
    <li className="px-4 py-2.5">
      <p className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-mono text-[11px] tracking-wider text-muted uppercase">
            {label} · {q.quarter} · {shortDate(start, today)} – {shortDate(end, today)}
          </span>
          <span className="block leading-snug font-semibold">
            {q.announced && q.entry ? q.entry.categories.map((c) => c.name).join(", ") : "Not announced"}
          </span>
          {q.announced && q.entry?.activation_deadline && (
            <span className="block font-mono text-[11px] tracking-wider text-muted uppercase">Activate by {shortDate(q.entry.activation_deadline, today)}</span>
          )}
        </span>
        {q.entry ? (
          <Provenance fact={q.entry} className="shrink-0 justify-end" />
        ) : (
          <a className="min-h-8 shrink-0 text-xs text-muted underline" href={calendarUrl} target="_blank" rel="noreferrer">
            Calendar
          </a>
        )}
      </p>
    </li>
  );
}
