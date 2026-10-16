"use client";

import { useApp } from "@/components/AppState";
import { useSetActivated } from "@/components/mutations";
import { Badge, Empty, PageTitle, Provenance, Section, TextLink } from "@/components/ui";
import { shortDate, quarterBounds } from "@/lib/domain/dates";
import { cardFor, holdingName } from "@/lib/domain/holdings";
import { currentAndNextQuarter, isActivated, type QuarterView } from "@/lib/domain/rotating";

export default function RotatingPage() {
  const { catalog, data, today } = useApp();
  const setActivated = useSetActivated();

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="Quarterly 5% categories from the issuers' official calendars. Activate every quarter.">Rotating categories</PageTitle>
      {catalog.rotating.map((program) => {
        const holdings = data.holdings.filter((h) => h.status === "open" && program.card_ids.includes(h.catalogCardId ?? ""));
        const quarters = currentAndNextQuarter(program, today);
        return (
          <Section key={program.id} title={program.name}>
            <p className="mb-2 text-sm">
              <span className="font-mono text-lg font-bold">{program.rate.value}%</span> {program.rate.cap ? `· ${program.rate.cap}` : ""}
            </p>
            <Provenance fact={program.rate} />
            <div className="mt-4 grid grid-cols-1 border-y border-hairline sm:grid-cols-2 sm:divide-x sm:divide-hairline">
              {quarters.map((q, i) => (
                <QuarterCard key={q.quarter} q={q} label={i === 0 ? "Current quarter" : "Next quarter"} calendarUrl={program.calendar_url} today={today} />
              ))}
            </div>
            <h3 className="mt-5 mb-2 font-mono text-[11px] tracking-wider text-muted uppercase">Activation</h3>
            {holdings.length === 0 ? (
              <Empty>You don&apos;t hold a card in this program.</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {holdings.flatMap((h) =>
                  quarters
                    .filter((q) => q.announced)
                    .map((q) => {
                      const active = isActivated(data.activations, h.id, q.quarter);
                      return (
                        <li key={`${h.id}-${q.quarter}`}>
                          <label className="flex min-h-10 cursor-pointer flex-wrap items-center gap-3 text-sm">
                            <input
                              type="checkbox"
                              className="h-5 w-5"
                              checked={active}
                              onChange={(e) => setActivated(h.id, q.quarter, e.target.checked)}
                            />
                            <span>
                              {holdingName(h, cardFor(h, catalog))} — {q.quarter} activated
                            </span>
                            {!active && q.quarter === quarters[0].quarter && <Badge tone="warn">Not activated</Badge>}
                          </label>
                        </li>
                      );
                    }),
                )}
              </ul>
            )}
          </Section>
        );
      })}
      <p className="text-xs text-muted">
        Bonus categories also feed the <TextLink href="/best-card">best-card helper</TextLink> once activated.
      </p>
    </div>
  );
}

function QuarterCard({ q, label, calendarUrl, today }: { q: QuarterView; label: string; calendarUrl: string; today: string }) {
  const { start, end } = quarterBounds(q.quarter);
  return (
    <div className="py-3 sm:px-4 sm:first:pl-0">
      <p className="font-mono text-[11px] tracking-wider text-muted uppercase">
        {label} · {q.quarter} · {shortDate(start, today)} – {shortDate(end, today)}
      </p>
      {q.announced && q.entry ? (
        <>
          <ul className="my-2 list-disc pl-5 text-sm">
            {q.entry.categories.map((c) => (
              <li key={c.name}>{c.name}</li>
            ))}
          </ul>
          {q.entry.activation_deadline && (
            <p className="text-sm">
              Activate by <span className="font-mono font-bold">{shortDate(q.entry.activation_deadline, today)}</span>
            </p>
          )}
          <Provenance fact={q.entry} />
        </>
      ) : (
        <>
          <p className="my-2 text-sm font-medium">Not announced</p>
          {q.entry ? (
            <Provenance fact={q.entry} />
          ) : (
            <a className="text-xs underline" href={calendarUrl} target="_blank" rel="noreferrer">
              Check the official calendar
            </a>
          )}
        </>
      )}
    </div>
  );
}
