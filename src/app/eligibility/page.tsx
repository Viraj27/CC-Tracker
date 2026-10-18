"use client";

import { useApp } from "@/components/AppState";
import { use524 } from "@/components/derived";
import { Badge, CELL, Empty, Group, GroupLabel, PageTitle, Provenance, Row } from "@/components/ui";
import { shortDate } from "@/lib/domain/dates";

export default function EligibilityPage() {
  const { today } = useApp();
  const { status, rule } = use524();
  const max = Math.max(5, ...status.timeline.map((t) => t.count));

  return (
    <div className="flex flex-col">
      <PageTitle help="Rules change. Always verify on the issuer's site before applying.">5/24</PageTitle>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-2 px-1 pt-1 pb-2">
        <p className="font-mono text-6xl leading-none font-bold" data-testid="five24-big">
          {status.count}
          <span className="text-2xl text-muted">/24</span>
        </p>
        <div className="pb-1">
          <Badge tone={status.underLimit ? "ok" : "danger"}>{status.underLimit ? "Under 5/24" : "At or over 5/24"}</Badge>
          <p className="mt-1 text-sm text-muted">
            {status.nextDropOff ? (
              <>
                Next off <span className="font-mono">{shortDate(status.nextDropOff.dropOffDate, today)}</span> · {status.nextDropOff.name}
              </>
            ) : (
              "No counted accounts"
            )}
          </p>
        </div>
      </div>

      <GroupLabel right={rule && <Provenance fact={rule} description={rule.description} className="justify-end" />}>
        Counted · {status.count}
      </GroupLabel>
      <Group>
        {status.accounts.length === 0 ? (
          <li className={CELL}>
            <Empty>No accounts opened in the last 24 months.</Empty>
          </li>
        ) : (
          status.accounts.map((a) => (
            <Row
              key={a.holdingId}
              href={`/cards/${a.holdingId}`}
              title={a.name}
              sub={<span className="font-mono text-[11px] tracking-wider uppercase">Opened {shortDate(a.approvalDate, today)}</span>}
              amount={shortDate(a.dropOffDate, today)}
              date="Drops off"
            />
          ))
        )}
      </Group>

      <GroupLabel>Going forward</GroupLabel>
      <Group aria-label="5/24 timeline">
        {status.timeline.map((t) => (
          <li key={t.date} className="grid min-h-11 grid-cols-[6.5rem_1fr_2rem] items-center gap-3 px-4 py-2 text-sm">
            <span className="font-mono text-xs tracking-wider text-muted uppercase">{t.date === today ? "Today" : shortDate(t.date, today)}</span>
            <span className="h-2 rounded-full bg-hairline">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(t.count / max) * 100}%`, background: t.count > status.max ? "var(--urgent)" : "var(--text)" }}
              />
            </span>
            <span className="text-right font-mono font-bold">{t.count}</span>
          </li>
        ))}
      </Group>

      {/* The per-card checker lives on its own page (docs/SPEC-v7-phone-feedback.md §4). */}
      <Group className="mt-5">
        <Row href="/apply" title="Should I apply?" sub="Pick a card: approval and welcome-bonus verdict" chevron testId="apply-link" />
      </Group>
    </div>
  );
}
