"use client";

import { useState } from "react";
import { deleteUsage, logUsage } from "@/app/actions";
import type { Benefit } from "@/lib/catalog/schema";
import { shortDate } from "@/lib/domain/dates";
import { benefitAnchor, canLogOn, computePeriod, creditView } from "@/lib/domain/periods";
import type { Holding } from "@/lib/domain/types";
import { isTemp, tempId, useApp } from "./AppState";
import { SheetPrimary } from "./Sheet";
import { Field, GroupLabel, usd } from "./ui";

const money = (n: number) => usd(n, Number.isInteger(n) ? 0 : 2);

/**
 * Log a use in a sheet (docs/SPEC-v5-app-pass.md §3.4). Credits: quick-amount
 * chips ($5, $10, remaining, Other) with the remaining amount pre-selected and
 * a "Log $X" pill; perks: a count (default 1) with a value override. Amount,
 * date and note live under "More options". Then this period's uses, deletable.
 *
 * A credit whose period is used up (or not open yet) can't be logged for today:
 * the pill is disabled and reads "Opens 1 JAN" (docs/SPEC-v7-phone-feedback.md §2).
 * A past date under More options can still be logged if that period has value left.
 */
export function LogUse({ benefit, holding }: { benefit: Benefit; holding: Holding }) {
  const { data, today, mutate } = useApp();
  const cv = creditView(benefit, holding, data.usages, today);
  const s = cv.status;
  const isCredit = benefit.kind === "credit";
  const perUse = benefit.cycle === "per_use";
  const closed = isCredit && cv.state !== "open";
  const remaining = isCredit ? (perUse ? benefit.amount ?? 0 : s.remaining ?? benefit.amount ?? 0) : 1;
  const chips = isCredit && !closed ? [...[5, 10].filter((v) => v < remaining), ...(remaining > 0 ? [remaining] : [])] : [];

  // Used up: pre-fill the full amount, ready for a back-dated use in an earlier period.
  const [amount, setAmount] = useState(String(closed ? benefit.amount ?? 0 : remaining));
  const [more, setMore] = useState(false);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const amt = Number(amount);
  const wellFormed = amount !== "" && Number.isFinite(amt) && amt > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const loggableOn = !isCredit || (/^\d{4}-\d{2}-\d{2}$/.test(date) && canLogOn(benefit, holding, data.usages, date, today));
  const valid = wellFormed && loggableOn;
  const custom = !chips.includes(amt);
  // Why the pill is disabled, when it is for a reason other than a missing amount.
  const blocked = !isCredit || loggableOn
    ? null
    : date > today
      ? "Date is in the future"
      : date !== today
        ? "Nothing left that period"
        : cv.state === "used_final"
          ? "Used"
          : `Opens ${shortDate(cv.opensOn, today)}`;

  const periodUses = data.usages.filter((u) => u.holdingId === holding.id && u.benefitId === benefit.id && u.periodKey === s.period.key);

  const submit = async () => {
    if (!valid) return;
    const usage = {
      holdingId: holding.id,
      benefitId: benefit.id,
      // A back-dated use belongs to the period containing its date.
      periodKey: computePeriod(benefit.cycle, date, benefitAnchor(benefit, holding)).key,
      amount: amt,
      valueOverride: !isCredit && value !== "" ? Number(value) : null,
      date,
      note: note || null,
    };
    setNote("");
    setValue("");
    const ok = await mutate((d) => ({ ...d, usages: [...d.usages, { id: tempId(), ...usage }] }), () => logUsage(usage));
    if (ok && isCredit) {
      const left = Math.max(0, Math.round((remaining - (usage.periodKey === s.period.key ? amt : 0)) * 100) / 100);
      setAmount(String(perUse ? remaining : left));
    }
  };

  if (cv.state === "ended") return null;
  if (!s.active && cv.state !== "not_started") return null;
  return (
    <div className="flex flex-col gap-3" data-testid="log-use">
      {isCredit && !closed && (
        <div role="radiogroup" aria-label="Amount" className="flex flex-wrap gap-2">
          {chips.map((v) => (
            <Chip key={v} checked={!more && amt === v} onClick={() => setAmount(String(v))}>
              {money(v)}
            </Chip>
          ))}
          <Chip
            checked={more || custom}
            onClick={() => {
              setMore(true);
              requestAnimationFrame(() => document.getElementById(`log-amount-${benefit.id}`)?.focus());
            }}
          >
            Other
          </Chip>
        </div>
      )}
      <details open={more} onToggle={(e) => setMore(e.currentTarget.open)} className="group">
        <summary className="inline-flex min-h-10 items-center gap-1 text-[15px] font-medium text-muted hover:text-text">
          More options <span aria-hidden className="disclosure-mark inline-block transition-transform">+</span>
        </summary>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Field label={isCredit ? "Amount (USD)" : "Count"}>
            <input
              id={`log-amount-${benefit.id}`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          {!isCredit && (
            <Field label="Value override (USD)">
              <input type="number" inputMode="decimal" step="any" min={0} value={value} placeholder="default" onChange={(e) => setValue(e.target.value)} />
            </Field>
          )}
          <Field label="Date">
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note">
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
          </Field>
        </div>
      </details>
      <SheetPrimary disabled={!valid} onClick={submit} data-testid="log-primary">
        {blocked ?? (isCredit ? `Log ${valid ? money(amt) : ""}`.trim() : `Log ${valid ? `×${amt}` : "use"}`)}
      </SheetPrimary>

      {periodUses.length > 0 && (
        <div>
          <GroupLabel>This period</GroupLabel>
          <ul aria-label="Uses this period" className="divide-y divide-hairline overflow-hidden rounded-[14px] bg-list text-sm">
            {periodUses.map((u) => (
              <li key={u.id} className="flex min-h-11 items-center gap-3 px-4 py-1.5">
                <span className="font-mono text-xs tracking-wider uppercase">{shortDate(u.date, today)}</span>
                <span className="font-mono font-bold">{isCredit ? usd(u.amount, 2) : `×${u.amount}`}</span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {u.valueOverride !== null && `valued ${usd(u.valueOverride, 2)} `}
                  {u.note}
                </span>
                <button
                  type="button"
                  disabled={isTemp(u.id)}
                  className="min-h-9 text-xs text-muted underline hover:text-urgent"
                  aria-label={`Delete use on ${shortDate(u.date)}`}
                  onClick={() => mutate((d) => ({ ...d, usages: d.usages.filter((x) => x.id !== u.id) }), () => deleteUsage(u.id))}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Chip({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={`min-h-10 rounded-full border px-4 font-mono text-[15px] font-bold ${
        checked ? "border-transparent bg-btn text-btn-text" : "border-hairline bg-list text-text hover:border-text"
      }`}
    >
      {children}
    </button>
  );
}
