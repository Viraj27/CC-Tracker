"use client";

import { useState } from "react";
import { deleteUsage, logUsage } from "@/app/actions";
import type { Benefit } from "@/lib/catalog/schema";
import { formatDate } from "@/lib/domain/dates";
import { benefitAnchor, benefitStatus, computePeriod } from "@/lib/domain/periods";
import { perkUnitValue } from "@/lib/domain/roi";
import type { Holding } from "@/lib/domain/types";
import { tempId, useApp } from "./AppState";
import { Badge, Button, Field, Progress, Provenance, usd } from "./ui";

const CYCLE_LABEL: Record<Benefit["cycle"], string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Semiannual (Jan–Jun / Jul–Dec)",
  calendar_year: "Calendar year",
  cardmember_year: "Cardmember year",
  per_use: "Per use",
  one_time: "One time",
  none: "Ongoing",
};

export function BenefitRow({ benefit, holding, color }: { benefit: Benefit; holding: Holding; color: string }) {
  const { data, today, catalog, mutate } = useApp();
  const [open, setOpen] = useState(false);
  const s = benefitStatus(benefit, holding, data.usages, today);
  const loggable = benefit.kind === "credit" || benefit.kind === "perk";
  const isCredit = benefit.kind === "credit";
  const periodUses = data.usages.filter(
    (u) => u.holdingId === holding.id && u.benefitId === benefit.id && u.periodKey === s.period.key,
  );
  const unitValue = benefit.kind === "perk" ? perkUnitValue(benefit, catalog, data.settings) : null;

  return (
    <li id={`benefit-${benefit.id}`} className="scroll-mt-20 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {benefit.name}{" "}
            {benefit.enrollment_required && <Badge tone="accent">Enrollment required</Badge>}{" "}
            {!s.active && <Badge tone="info">{benefit.ends_on && today > benefit.ends_on ? "Ended" : "Not started"}</Badge>}
          </p>
          <p className="text-sm text-muted">{benefit.description}</p>
        </div>
        {loggable && s.active && (
          <Button variant="primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Cancel" : "Log use"}
          </Button>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-1 text-sm">
        <p className="text-xs text-muted">
          {CYCLE_LABEL[benefit.cycle]}
          {s.period.start && ` · current period ${formatDate(s.period.start)} – ${formatDate(s.period.end)}`}
          {s.period.expiry && ` · expires ${formatDate(s.period.expiry)}`}
          {benefit.ends_on && ` · benefit ends ${formatDate(benefit.ends_on)}`}
        </p>
        {isCredit && benefit.amount !== null && benefit.cycle !== "per_use" && benefit.cycle !== "none" && (
          <>
            <p data-testid={`remaining-${benefit.id}`}>
              <span className="font-semibold">{usd(s.remaining, 2)}</span> remaining of {usd(benefit.amount)}{" "}
              <span className="text-muted">(used {usd(s.used, 2)})</span>
            </p>
            <Progress value={benefit.amount ? s.used / benefit.amount : 0} color={color} />
          </>
        )}
        {isCredit && benefit.cycle === "per_use" && benefit.amount !== null && (
          <p>Up to {usd(benefit.amount)} per use · used {periodUses.length} time(s) logged</p>
        )}
        {benefit.kind === "perk" && (
          <p className="text-xs text-muted">
            {benefit.amount !== null && `${benefit.amount} per period · `}
            {s.used > 0 && `${s.used} used this period · `}
            Value per use: {unitValue === null ? "not set (set it in Settings)" : usd(unitValue, 2)}
          </p>
        )}
        {benefit.how_to_use && <p className="text-xs text-muted">How to use: {benefit.how_to_use}</p>}
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
        <ul className="mt-2 flex flex-col gap-1 text-xs text-muted" aria-label="Uses this period">
          {periodUses.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2">
              <span>
                {formatDate(u.date)} · {isCredit ? usd(u.amount, 2) : `×${u.amount}`}
                {u.valueOverride !== null && ` (valued ${usd(u.valueOverride, 2)})`}
                {u.note && ` — ${u.note}`}
              </span>
              <button
                type="button"
                className="underline hover:text-danger"
                aria-label={`Delete use on ${formatDate(u.date)}`}
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
    <dl className="mt-1 grid grid-cols-1 gap-x-3 gap-y-1 rounded-lg bg-surface-2 p-2 text-sm sm:grid-cols-[8rem_1fr]">
      <dt className="text-muted">Coverage</dt>
      <dd>{p.coverage ?? <span className="text-warn">Not confirmed — check the Guide to Benefits</span>}</dd>
      {p.conditions.length > 0 && (
        <>
          <dt className="text-muted">Conditions</dt>
          <dd>
            <ul className="list-disc pl-4">
              {p.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </dd>
        </>
      )}
      <dt className="text-muted">How to claim</dt>
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
      className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-4"
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
