"use client";

import { useEffect, useRef, useState } from "react";
import { deleteUsage, logUsage } from "@/app/actions";
import type { Benefit } from "@/lib/catalog/schema";
import { shortDate } from "@/lib/domain/dates";
import { benefitAnchor, benefitStatus, computePeriod } from "@/lib/domain/periods";
import { perkUnitValue } from "@/lib/domain/roi";
import type { Holding } from "@/lib/domain/types";
import { isTemp, tempId, useApp } from "./AppState";
import { Badge, Button, Field, Progress, Provenance, usd } from "./ui";

export const CYCLE_LABEL: Record<Benefit["cycle"], string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Semiannual",
  calendar_year: "Calendar year",
  cardmember_year: "Cardmember year",
  per_use: "Per use",
  one_time: "One time",
  none: "Ongoing",
};

export function BenefitRow({
  benefit,
  holding,
  color,
  autoOpen = false,
}: {
  benefit: Benefit;
  holding: Holding;
  color: string;
  /** Open the log-use form and scroll to it (e.g. from an Up next "Log" action). */
  autoOpen?: boolean;
}) {
  const { data, today, catalog, mutate } = useApp();
  const s = benefitStatus(benefit, holding, data.usages, today);
  const loggable = (benefit.kind === "credit" || benefit.kind === "perk") && s.active;
  const [open, setOpen] = useState(autoOpen && loggable);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (autoOpen && loggable) {
      setOpen(true);
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [autoOpen, loggable]);

  const isCredit = benefit.kind === "credit";
  const quantified = isCredit && benefit.amount !== null && benefit.cycle !== "per_use" && benefit.cycle !== "none";
  const periodUses = data.usages.filter(
    (u) => u.holdingId === holding.id && u.benefitId === benefit.id && u.periodKey === s.period.key,
  );
  const unitValue = benefit.kind === "perk" ? perkUnitValue(benefit, catalog, data.settings) : null;
  const expiringSoon = s.daysToExpiry !== null && s.daysToExpiry <= data.settings.creditLeadDays && (s.remaining ?? 1) > 0;

  return (
    <li id={`benefit-${benefit.id}`} ref={ref} className="scroll-mt-24 py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="leading-snug font-semibold">
            {benefit.name}{" "}
            {benefit.enrollment_required && <Badge tone="accent">Enroll</Badge>}{" "}
            {!s.active && <Badge tone="info">{benefit.ends_on && today > benefit.ends_on ? "Ended" : "Not started"}</Badge>}
          </p>
          <p className="mt-0.5 font-mono text-[11px] tracking-wider text-muted uppercase">
            {CYCLE_LABEL[benefit.cycle]}
            {s.period.start && ` · ${shortDate(s.period.start, today)} – ${shortDate(s.period.end, today)}`}
            {s.period.expiry && (
              <>
                {" · "}
                <span className={expiringSoon ? "font-bold text-urgent" : ""}>exp {shortDate(s.period.expiry, today)}</span>
              </>
            )}
            {benefit.ends_on && ` · ends ${shortDate(benefit.ends_on, today)}`}
          </p>
        </div>
        {quantified && (
          <p className="shrink-0 text-right font-mono leading-tight" data-testid={`remaining-${benefit.id}`}>
            <span className="block text-lg font-bold">{usd(s.remaining, 2)}</span>
            <span className="block text-[10px] tracking-wider text-muted uppercase">left of {usd(benefit.amount)}</span>
          </p>
        )}
        {loggable && (
          <Button
            size="sm"
            variant={open ? "secondary" : "primary"}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? `Cancel logging ${benefit.name}` : `Log ${benefit.name}`}
          >
            {open ? "Cancel" : "Log"}
          </Button>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-1.5 text-sm">
        {quantified && <Progress value={benefit.amount ? s.used / benefit.amount : 0} color={color} />}
        {quantified && s.used > 0 && <p className="font-mono text-[11px] tracking-wider text-muted uppercase">Used {usd(s.used, 2)} this period</p>}
        {isCredit && benefit.cycle === "per_use" && benefit.amount !== null && (
          <p className="font-mono text-xs">
            Up to {usd(benefit.amount)} per use · {periodUses.length} logged
          </p>
        )}
        {benefit.kind === "perk" && (
          <p className="font-mono text-xs">
            {benefit.amount !== null && `${benefit.amount} per period · `}
            {s.used > 0 && `${s.used} used · `}
            value/use {unitValue === null ? "not set (Settings)" : usd(unitValue, 2)}
          </p>
        )}
        <p className="text-muted">{benefit.description}</p>
        {benefit.how_to_use && <p className="text-muted">How to use: {benefit.how_to_use}</p>}
        {benefit.protection && <ProtectionTerms p={benefit.protection} />}
        <Provenance fact={benefit} />
      </div>

      {open && (
        <LogUseForm
          benefit={benefit}
          defaultAmount={isCredit ? (benefit.cycle === "per_use" ? benefit.amount ?? 0 : s.remaining ?? 0) : 1}
          onSubmit={async (v) => {
            const usage = {
              holdingId: holding.id,
              benefitId: benefit.id,
              // A back-dated use belongs to the period containing its date.
              periodKey: computePeriod(benefit.cycle, v.date, benefitAnchor(benefit, holding)).key,
              amount: v.amount,
              valueOverride: v.valueOverride,
              date: v.date,
              note: v.note || null,
            };
            setOpen(false);
            await mutate(
              (d) => ({ ...d, usages: [...d.usages, { id: tempId(), ...usage }] }),
              () => logUsage(usage),
            );
          }}
          today={today}
        />
      )}

      {periodUses.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-hairline border-t border-hairline text-sm" aria-label="Uses this period">
          {periodUses.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
              <span className="font-mono text-xs tracking-wider uppercase">{shortDate(u.date, today)}</span>
              <span className="font-mono font-bold">{isCredit ? usd(u.amount, 2) : `×${u.amount}`}</span>
              {u.valueOverride !== null && <span className="text-muted">valued {usd(u.valueOverride, 2)}</span>}
              {u.note && <span className="min-w-0 text-muted">{u.note}</span>}
              <button
                type="button"
                disabled={isTemp(u.id)}
                className="ml-auto min-h-8 text-xs text-muted underline hover:text-urgent"
                aria-label={`Delete use on ${shortDate(u.date)}`}
                onClick={() =>
                  mutate(
                    (d) => ({ ...d, usages: d.usages.filter((x) => x.id !== u.id) }),
                    () => deleteUsage(u.id),
                  )
                }
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ProtectionTerms({ p }: { p: NonNullable<Benefit["protection"]> }) {
  return (
    <dl className="my-1 grid grid-cols-1 gap-x-4 gap-y-1 border-l-2 border-hairline pl-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <dt className="font-mono text-[11px] tracking-wider text-muted uppercase sm:pt-0.5">Coverage</dt>
      <dd>{p.coverage ?? <span className="text-warn">Not confirmed — check the Guide to Benefits</span>}</dd>
      {p.conditions.length > 0 && (
        <>
          <dt className="font-mono text-[11px] tracking-wider text-muted uppercase sm:pt-0.5">Conditions</dt>
          <dd>
            <ul className="list-disc pl-4">
              {p.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </dd>
        </>
      )}
      <dt className="font-mono text-[11px] tracking-wider text-muted uppercase sm:pt-0.5">How to claim</dt>
      <dd>{p.how_to_claim ?? "—"}</dd>
    </dl>
  );
}

function LogUseForm({
  benefit,
  defaultAmount,
  today,
  onSubmit,
}: {
  benefit: Benefit;
  defaultAmount: number;
  today: string;
  onSubmit: (v: { amount: number; valueOverride: number | null; date: string; note: string }) => void;
}) {
  const isCredit = benefit.kind === "credit";
  const [amount, setAmount] = useState(String(defaultAmount));
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const amt = Number(amount);
  const valid = amount !== "" && Number.isFinite(amt) && amt >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <form
      aria-label={`Log ${benefit.name}`}
      className="mt-3 grid grid-cols-2 gap-3 border-t border-hairline pt-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ amount: amt, valueOverride: value === "" ? null : Number(value), date, note });
      }}
    >
      <Field label={isCredit ? "Amount (USD)" : "Count"}>
        <input type="number" inputMode="decimal" step="any" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>
      {!isCredit && (
        <Field label="Value override (USD)">
          <input type="number" inputMode="decimal" step="any" min={0} value={value} placeholder="default" onChange={(e) => setValue(e.target.value)} />
        </Field>
      )}
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note">
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
      </Field>
      <div className="col-span-2 flex items-end sm:col-span-4">
        <Button type="submit" variant="primary" disabled={!valid}>
          Save
        </Button>
      </div>
    </form>
  );
}
