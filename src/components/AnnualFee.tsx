"use client";

/** The annual fee cycle's actions (docs/SPEC-v6.1-annual-fee-decision.md): Fee posted, then Keep / Retention / Downgrade / Close. */
import { useCallback, useId, useState } from "react";
import { addAfEvent, setAfOutcome } from "@/app/actions";
import { afCycle, bestExit, hasRetentionCall, type AfCycle } from "@/lib/domain/annualFee";
import { diffDays, formatDate, monthDay, parseIso, shortDate } from "@/lib/domain/dates";
import type { AfOutcome } from "@/lib/domain/types";
import { closeGuard, offerFor } from "@/lib/domain/welcomeBonus";
import { isTemp, tempId, useApp } from "./AppState";
import type { HoldingView } from "./derived";
import { KeyFigures, SheetPrimary, SheetSecondary, useSheet } from "./Sheet";
import { Field, InfoToggle, Provenance, usd } from "./ui";
import { CloseGuardWarning } from "./WelcomeBonus";

const money = (n: number | null) => (n === null ? "?" : usd(n, Number.isInteger(n) ? 0 : 2));
/** `Jan 10`, with the year when it isn't this one. */
const niceDate = (iso: string, today: string) => (parseIso(iso).y === parseIso(today).y ? monthDay(iso) : formatDate(iso));

export function useAfCycle(view: HoldingView | undefined): AfCycle | null {
  const { catalog, data, today } = useApp();
  return view ? afCycle(view.holding, view.card, data, data.settings, catalog, today) : null;
}

/** Record the decision on a posted fee (optimistic). */
export function useSetAfOutcome() {
  const { mutate } = useApp();
  return useCallback(
    (id: string, outcome: AfOutcome) =>
      mutate((d) => ({ ...d, afEvents: d.afEvents.map((e) => (e.id === id ? { ...e, outcome } : e)) }), () => setAfOutcome(id, outcome)),
    [mutate],
  );
}

/**
 * The fee cycle on a card: figures and the phase's actions. Renders nothing
 * between cycles. Used by the Up next item sheet and Fee history.
 */
export function AfPanel({ view, onDone }: { view: HoldingView; onDone?: () => void }) {
  const { data, catalog, today, mutate } = useApp();
  const sheet = useSheet();
  const cycle = useAfCycle(view);
  const setOutcome = useSetAfOutcome();
  const aboutId = useId();
  const [aboutOpen, setAboutOpen] = useState(false);
  const h = view.holding;
  const card = view.card;
  const [postedDate, setPostedDate] = useState(today);
  const [amount, setAmount] = useState(String(card?.annual_fee.amount ?? ""));
  if (!cycle || !card) return null;
  const target = `${view.name}: annual fee`;
  const called = hasRetentionCall(cycle, h.id, data.lifecycle, data.settings);
  const logCall = !called && (
    <SheetSecondary aria-label={`Log retention call — ${target}`} onClick={() => sheet.push({ type: "list", holdingId: h.id, list: "lifecycle" })}>
      Log retention call
    </SheetSecondary>
  );

  if (cycle.phase === "upcoming") {
    return (
      <div data-testid="af-panel" data-phase="upcoming">
        <KeyFigures
          items={[
            { label: "Fee", value: money(card.annual_fee.amount) },
            { label: `Posts${cycle.estimated ? " (est.)" : ""}`, value: shortDate(cycle.date, today), urgent: diffDays(today, cycle.date) <= 7 },
          ]}
        />
        <SheetPrimary aria-label={`See options — ${target}`} onClick={() => sheet.push({ type: "list", holdingId: h.id, list: "downgrade" })}>
          See options
        </SheetPrimary>
        {logCall && <div className="mt-2 flex justify-center">{logCall}</div>}
      </div>
    );
  }

  if (cycle.phase === "watch") {
    return (
      <form
        data-testid="af-panel"
        data-phase="watch"
        onSubmit={(e) => {
          e.preventDefault();
          const ev = { holdingId: h.id, postedDate, amount: Number(amount), outcome: "pending" as const, note: null };
          mutate((d) => ({ ...d, afEvents: [...d.afEvents, { id: tempId(), ...ev }] }), () => addAfEvent(ev));
        }}
      >
        <KeyFigures
          items={[
            { label: "Fee", value: money(card.annual_fee.amount) },
            { label: "Expected by", value: shortDate(cycle.date, cycle.date) },
          ]}
        />
        <p className="mb-3 px-1 text-[15px]">The fee bills on the first statement after the anniversary. Mark it posted when you see it; the refund window counts from then.</p>
        <div className="mb-3 grid grid-cols-2 gap-3 rounded-[14px] bg-list p-4">
          <Field label="Posted on">
            <input type="date" value={postedDate} max={today} onChange={(e) => setPostedDate(e.target.value)} required />
          </Field>
          <Field label="Amount">
            <input type="number" min={0} step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
        </div>
        <SheetPrimary type="submit" aria-label={`Fee posted — ${target}`}>
          Fee posted
        </SheetPrimary>
      </form>
    );
  }

  // Refund window.
  const event = cycle.event!;
  const window = cycle.window!;
  const daysLeft = diffDays(today, cycle.date);
  const placeholder = window.source === "placeholder";
  const exit = bestExit(closeGuard(offerFor(data.welcomeOffers, h.id), h, catalog, today)?.until ?? null, cycle, today);
  const busy = isTemp(event.id);
  const decide = (outcome: AfOutcome) => {
    setOutcome(event.id, outcome);
    onDone?.();
  };
  const targets = card.downgrade_options.map((d) => d.target_name);
  return (
    <div data-testid="af-panel" data-phase="decide">
      <KeyFigures
        items={[
          { label: "Fee", value: money(event.amount) },
          { label: placeholder ? "Decide soon" : "Decide by", value: shortDate(cycle.date, today), urgent: daysLeft <= 5, testId: "af-decide-by" },
        ]}
      />
      <p className="mb-2 flex flex-wrap items-center gap-x-1.5 px-1 text-[15px]" data-testid="af-refund-window">
        <span className="min-w-0 flex-1">
          {placeholder
            ? "Refund window not in catalog"
            : `Refund window: ${window.days} days from ${window.source === "catalog" && window.policy?.basis === "statement" ? "the statement" : "posting"}`}
          {" · "}
          {daysLeft === 0 ? "last day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
        </span>
        {window.source === "catalog" && window.policy ? (
          <Provenance
            flow
            fact={window.policy}
            description={
              window.policy.basis === "statement"
                ? `Posted ${niceDate(event.postedDate, today)}. The issuer counts from the closing date of the statement the fee is on; this counts from the posting date, so you may have a few more days.`
                : `Posted ${niceDate(event.postedDate, today)}. Closing within ${window.days} days refunds the fee.`
            }
          />
        ) : (
          <>
            <InfoToggle open={aboutOpen} onToggle={() => setAboutOpen((o) => !o)} controls={aboutId} label="About the refund window" />
            <span id={aboutId} hidden={!aboutOpen} className="block basis-full pb-1 text-left text-xs text-muted">
              {placeholder
                ? "The catalog has no refund window for this issuer. The 30 days shown is a placeholder, not a fact: ask the issuer, then set it under Edit card."
                : `Your own setting for this card (${window.days} days), from Edit card.`}
            </span>
          </>
        )}
      </p>
      {targets.length > 0 && <p className="mb-2 px-1 text-sm text-muted">Downgrade to: {targets.join(", ")}</p>}
      {exit ? (
        <p className="mb-3 rounded-[14px] border border-text/20 px-4 py-2 text-[15px]" data-testid="af-best-exit">
          {exit.type === "window"
            ? `Best exit: ${niceDate(exit.from, today)} – ${formatDate(exit.to)} (keeps the bonus and refunds the fee).`
            : `Closing now risks the bonus; keeping costs ${money(exit.fee)}.`}
        </p>
      ) : (
        <CloseGuardWarning view={view} className="mb-3" />
      )}
      <SheetPrimary disabled={busy} aria-label={`Keep — ${target}`} onClick={() => decide("paid")}>
        Keep
      </SheetPrimary>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4">
        <SheetSecondary disabled={busy} aria-label={`Retention offer — ${target}`} onClick={() => sheet.push({ type: "list", holdingId: h.id, list: "lifecycle", resolveAf: event.id })}>
          Retention offer
        </SheetSecondary>
        <SheetSecondary disabled={busy} aria-label={`Downgrade — ${target}`} onClick={() => sheet.push({ type: "list", holdingId: h.id, list: "downgrade" })}>
          Downgrade
        </SheetSecondary>
        <SheetSecondary disabled={busy} aria-label={`Close — ${target}`} onClick={() => sheet.push({ type: "edit", holdingId: h.id })}>
          Close
        </SheetSecondary>
        {logCall}
      </div>
    </div>
  );
}
