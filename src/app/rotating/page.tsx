"use client";

import { setActivation } from "@/app/actions";
import { tempId, useApp } from "@/components/AppState";
import { Badge, Empty, PageTitle, Provenance, Section, TextLink } from "@/components/ui";
import { formatDate, quarterBounds } from "@/lib/domain/dates";
import { cardFor, holdingName } from "@/lib/domain/holdings";
import { currentAndNextQuarter, isActivated, type QuarterView } from "@/lib/domain/rotating";

export default function RotatingPage() {
  const { catalog, data, today, mutate } = useApp();

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="Quarterly 5% categories from the issuers' official calendars. Activate every quarter.">Rotating categories</PageTitle>
      {catalog.rotating.map((program) => {
        const holdings = data.holdings.filter((h) => h.status === "open" && program.card_ids.includes(h.catalogCardId ?? ""));
        const quarters = currentAndNextQuarter(program, today);
        return (
          <Section key={program.id} title={program.name}>
            <p className="mb-2 text-sm">
              {program.rate.value}% {program.rate.cap ? `· ${program.rate.cap}` : ""}
            </p>
            <Provenance fact={program.rate} />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {quarters.map((q, i) => (
                <QuarterCard key={q.quarter} q={q} label={i === 0 ? "Current quarter" : "Next quarter"} calendarUrl={program.calendar_url} />
              ))}
            </div>
            <h3 className="mt-4 mb-2 text-sm font-semibold">Activation</h3>
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
                          <label className="flex cursor-pointer items-center gap-3 text-sm">
                            <input
                              type="checkbox"
                              className="h-5 w-5"
                              checked={active}
                              onChange={(e) => {
                                const activated = e.target.checked;
                                mutate(
                                  (d) => ({
                                    ...d,
                                    activations: [
                                      ...d.activations.filter((a) => !(a.holdingId === h.id && a.quarter === q.quarter)),
                                      { id: tempId(), holdingId: h.id, quarter: q.quarter, activated, date: activated ? today : null },
                                    ],
                                  }),
                                  () => setActivation({ holdingId: h.id, quarter: q.quarter, activated }),
                                );
                              }}
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

function QuarterCard({ q, label, calendarUrl }: { q: QuarterView; label: string; calendarUrl: string }) {
  const { start, end } = quarterBounds(q.quarter);
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted">
        {label} · {q.quarter} ({formatDate(start)} – {formatDate(end)})
      </p>
      {q.announced && q.entry ? (
        <>
          <ul className="my-2 list-disc pl-5 text-sm">
            {q.entry.categories.map((c) => (
              <li key={c.name}>{c.name}</li>
            ))}
          </ul>
          {q.entry.activation_deadline && <p className="text-sm">Activate by {formatDate(q.entry.activation_deadline)}</p>}
          <Provenance fact={q.entry} />
        </>
      ) : (
        <>
          <p className="my-2 text-sm font-medium">Not announced</p>
          {q.entry ? (
            <Provenance fact={q.entry} />
          ) : (
            <a className="text-xs text-accent underline" href={calendarUrl} target="_blank" rel="noreferrer">
              Check the official calendar
            </a>
          )}
        </>
      )}
    </div>
  );
}
