"use client";

import { useId, useMemo, useState } from "react";
import type { PublicOffer } from "@/lib/catalog/schema";
import { formatDate, monthDay, parseIso, shortDate } from "@/lib/domain/dates";
import type { BonusUnit, WelcomeOffer } from "@/lib/domain/types";
import {
  bonusLabel,
  closeGuard,
  daysToDeadline,
  expectedPostBy,
  leftToSpend,
  offerDeadline,
  offerFor,
  offerStatus,
  offerValue,
  type OfferStatus,
} from "@/lib/domain/welcomeBonus";
import { useApp } from "./AppState";
import type { HoldingView } from "./derived";
import { type OfferFields, useSaveOffer } from "./mutations";
import { KeyFigures, SheetPrimary, SheetSecondary, useSheet } from "./Sheet";
import { Field, Group, GroupLabel, InfoToggle, Provenance, Row, usd } from "./ui";

const money = (n: number) => usd(n, Number.isInteger(n) ? 0 : 2);
/** `Mar 3`, with the year when it isn't this one (`Jan 10, 2027`). */
const niceDate = (iso: string, today: string) => (parseIso(iso).y === parseIso(today).y ? formatDate(iso).replace(/, \d{4}$/, "") : formatDate(iso));
const fieldsOf = ({ id: _id, holdingId: _h, ...rest }: WelcomeOffer): OfferFields => rest;

/** Met / Posted / Missed (and their undos) for a card's offer, dated today. */
export function useOfferActions() {
  const { data, today } = useApp();
  const save = useSaveOffer();
  return useMemo(() => {
    const change = (holdingId: string, patch: (o: WelcomeOffer) => Partial<OfferFields>) => {
      const o = offerFor(data.welcomeOffers, holdingId);
      return o ? save(holdingId, { ...fieldsOf(o), ...patch(o) }) : Promise.resolve(false);
    };
    return {
      met: (holdingId: string) => change(holdingId, () => ({ metDate: today, outcome: null })),
      posted: (holdingId: string) =>
        change(holdingId, (o) => ({ postedDate: today, metDate: o.metDate ?? (o.minSpend === null ? null : today), outcome: null })),
      missed: (holdingId: string) => change(holdingId, () => ({ outcome: "missed", metDate: null, postedDate: null, postedAmount: null })),
      /** Back to the state before the last of Met / Posted / Missed. */
      undo: (holdingId: string) =>
        change(holdingId, (o) =>
          o.postedDate ? { postedDate: null, postedAmount: null } : o.outcome === "missed" ? { outcome: null } : { metDate: null },
        ),
      change,
    };
  }, [data.welcomeOffers, save, today]);
}

const STATUS_LINE: Record<OfferStatus, string> = {
  earning: "Earning",
  overdue: "Deadline passed",
  met: "Met · waiting to post",
  posted: "Posted",
  missed: "Missed",
};

/**
 * The welcome bonus sheet body (docs/SPEC-v6-welcome-bonus.md §3): bonus and
 * deadline, the optional "Spent so far", then Met / Posted / Missed / Edit offer.
 * `onDone` closes the sheet after an action taken from Up next.
 */
export function OfferPanel({ view, onDone }: { view: HoldingView; onDone?: () => void }) {
  const { catalog, data, today } = useApp();
  const sheet = useSheet();
  const actions = useOfferActions();
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutId = useId();
  const h = view.holding;
  const offer = offerFor(data.welcomeOffers, h.id);
  if (!offer) return <p className="px-1 text-[15px] text-muted">No welcome offer on this card.</p>;

  const status = offerStatus(offer, h, today);
  const deadline = offerDeadline(offer, h);
  const days = daysToDeadline(offer, h, today);
  const by = expectedPostBy(offer, h, data.settings);
  const left = leftToSpend(offer);
  const value = offerValue(offer, view.card, catalog, data.settings, data.points);
  const target = `${view.name}: welcome bonus`;
  const run = (fn: (id: string) => unknown) => () => {
    fn(h.id);
    onDone?.();
  };

  const second =
    status === "posted"
      ? { label: "Posted", value: shortDate(offer.postedDate, today) }
      : status === "missed"
        ? { label: "Status", value: "Missed" }
        : status === "met"
          ? { label: "Expected by", value: by ? shortDate(by, today) : "—", urgent: !!by && today >= by }
          : { label: deadline?.estimated ? "Deadline (est.)" : "Deadline", value: deadline ? shortDate(deadline.date, today) : "—", urgent: days !== null && days <= 7 };

  return (
    <div data-testid="offer-panel" data-status={status}>
      <KeyFigures items={[{ label: "Bonus", value: bonusLabel(offer, status === "posted"), testId: "offer-bonus" }, { ...second, testId: "offer-date" }]} />
      <p className="-mt-2 mb-4 flex flex-wrap items-center gap-x-1 px-1 font-mono text-[11px] tracking-wider text-muted uppercase" data-testid="offer-line">
        <span>
          {STATUS_LINE[status]}
          {offer.minSpend !== null && ` · Min spend ${money(offer.minSpend)}`}
          {(status === "earning" || status === "overdue") && left !== null && offer.spentSoFar !== null && ` · ${money(left)} left`}
          {value !== null && offer.bonusUnit !== "usd" && ` · ≈ ${money(value)}`}
        </span>
        {deadline?.estimated && (status === "earning" || status === "overdue") && (
          <>
            <InfoToggle open={aboutOpen} onToggle={() => setAboutOpen((o) => !o)} controls={aboutId} label="About the estimate" />
            <span id={aboutId} hidden={!aboutOpen} className="block basis-full pb-1 text-left text-xs tracking-normal normal-case">
              Estimated as your approval date plus {offer.windowMonths} months. Issuers count the window differently, so check the issuer&apos;s own tracker and set
              the exact date in Edit offer.
            </span>
          </>
        )}
      </p>
      {offer.note && <p className="mb-3 px-1 text-[15px]">{offer.note}</p>}

      {(status === "earning" || status === "overdue") && offer.minSpend !== null && (
        <SpentSoFar key={`${offer.spentSoFar}`} offer={offer} onSave={(n) => actions.change(h.id, () => ({ spentSoFar: n, spentAsOf: n === null ? null : today }))} />
      )}
      {status === "posted" && (
        <PostedAmount key={`${offer.postedAmount}`} offer={offer} onSave={(n) => actions.change(h.id, () => ({ postedAmount: n }))} />
      )}

      {(status === "earning" || status === "overdue") && (
        <SheetPrimary aria-label={`Mark met — ${target}`} onClick={run(actions.met)}>
          {offer.minSpend === null ? "Mark met" : "Minimum met"}
        </SheetPrimary>
      )}
      {status === "met" && (
        <SheetPrimary aria-label={`Mark posted — ${target}`} onClick={run(actions.posted)}>
          Bonus posted
        </SheetPrimary>
      )}
      <div className="mt-2 flex flex-wrap justify-center gap-x-4">
        {(status === "earning" || status === "overdue") && (
          <SheetSecondary aria-label={`Mark posted — ${target}`} onClick={run(actions.posted)}>
            Bonus posted
          </SheetSecondary>
        )}
        {status !== "posted" && status !== "missed" && (
          <SheetSecondary aria-label={`Mark missed — ${target}`} onClick={run(actions.missed)}>
            Missed
          </SheetSecondary>
        )}
        {(status === "posted" || status === "missed" || (status === "met" && offer.metDate)) && (
          <SheetSecondary aria-label={`Undo ${status} — ${target}`} onClick={() => actions.undo(h.id)}>
            Undo {status}
          </SheetSecondary>
        )}
        <SheetSecondary onClick={() => sheet.push({ type: "edit", holdingId: h.id, offer: true })}>Edit offer</SheetSecondary>
      </div>
    </div>
  );
}

/** One optional field: what the issuer's tracker says you've spent. Enter (or leaving the field) saves. */
function SpentSoFar({ offer, onSave }: { offer: WelcomeOffer; onSave: (n: number | null) => void }) {
  const { today } = useApp();
  const [v, setV] = useState(offer.spentSoFar === null ? "" : String(offer.spentSoFar));
  const commit = () => {
    const n = v.trim() === "" ? null : Number(v);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return;
    if (n !== offer.spentSoFar) onSave(n);
  };
  return (
    <form
      className="mb-4 rounded-[14px] bg-list px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <Field label="Spent so far (optional)" hint={offer.spentAsOf ? `As of ${shortDate(offer.spentAsOf, today)}. From the issuer's tracker.` : "From the issuer's tracker. Enter saves."}>
        <input type="number" inputMode="decimal" min={0} step="any" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} placeholder="not tracked" />
      </Field>
    </form>
  );
}

/** What actually posted, when it differs from the offer (bonuses sometimes post short or split). */
function PostedAmount({ offer, onSave }: { offer: WelcomeOffer; onSave: (n: number | null) => void }) {
  const [v, setV] = useState(String(offer.postedAmount ?? offer.bonusAmount));
  const commit = () => {
    const n = Number(v);
    if (v.trim() === "" || !Number.isFinite(n) || n < 0) return;
    const next = n === offer.bonusAmount ? null : n;
    if (next !== offer.postedAmount) onSave(next);
  };
  return (
    <form
      className="mb-4 rounded-[14px] bg-list px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <Field label={`Amount posted (${offer.bonusUnit === "usd" ? "USD" : offer.bonusUnit})`} hint="Change it if the bonus posted short. Enter saves.">
        <input type="number" inputMode="decimal" min={0} step="any" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} />
      </Field>
    </form>
  );
}

/** Card page: the WELCOME BONUS row under the stat strip while the bonus is being earned or awaited (§4). */
export function OfferRow({ view }: { view: HoldingView }) {
  const { data, today } = useApp();
  const sheet = useSheet();
  const h = view.holding;
  const offer = offerFor(data.welcomeOffers, h.id);
  if (!offer || h.status !== "open") return null;
  const status = offerStatus(offer, h, today);
  if (status === "posted" || status === "missed") return null;
  const deadline = offerDeadline(offer, h);
  const days = daysToDeadline(offer, h, today);
  const left = leftToSpend(offer);
  const title =
    status === "met" || left === null
      ? bonusLabel(offer)
      : `${bonusLabel(offer)} · ${money(offer.spentSoFar !== null ? left : offer.minSpend!)}${offer.spentSoFar !== null ? " more" : ""}${
          deadline ? ` by ${niceDate(deadline.date, today)}${deadline.estimated ? " (est.)" : ""}` : ""
        }`;
  const sub =
    status === "met"
      ? "Met · waiting to post"
      : status === "overdue"
        ? "Deadline passed"
        : days === null
          ? "No deadline set"
          : days === 0
            ? "Due today"
            : `${days} day${days === 1 ? "" : "s"} left`;
  return (
    <section aria-labelledby="bonus-heading" id="bonus" className="scroll-mt-24">
      <GroupLabel id="bonus-heading">Welcome bonus</GroupLabel>
      <Group>
        <Row
          testId="bonus-row"
          ariaLabel={`Welcome bonus: ${title}, ${sub}`}
          title={title}
          sub={<span className={`font-mono text-[11px] tracking-wider uppercase ${status === "overdue" || (days !== null && days <= 7 && status === "earning") ? "font-bold text-urgent" : ""}`}>{sub}</span>}
          chevron
          onClick={() => sheet.open({ type: "offer", holdingId: h.id })}
        />
      </Group>
    </section>
  );
}

/**
 * Close guard (§4): a warning line, never a block, before closing or
 * downgrading a card whose bonus is recent.
 */
export function CloseGuardWarning({ view, className = "" }: { view: HoldingView; className?: string }) {
  const { catalog, data, today } = useApp();
  const h = view.holding;
  const guard = closeGuard(offerFor(data.welcomeOffers, h.id), h, catalog, today);
  if (!guard) return null;
  return (
    <p role="note" data-testid="close-guard" className={`flex flex-wrap items-center gap-x-1.5 rounded-[14px] border border-warn/50 px-4 py-2 text-[15px] ${className}`}>
      <span className="min-w-0 flex-1">
        {guard.postedDate ? `Bonus ${niceDate(guard.postedDate, today)}` : "Bonus pending"} — closing before {niceDate(guard.until, today)} risks{" "}
        {guard.postedDate ? "clawback" : "losing it"}
      </span>
      <Provenance flow fact={guard.rule} description={guard.rule.description} />
    </p>
  );
}

/* ------------------------------------------------------- add / edit form -- */

export interface OfferForm {
  bonusAmount: string;
  bonusUnit: BonusUnit;
  minSpend: string;
  windowMonths: string;
  deadline: string;
  note: string;
}

export const offerFormOf = (o: WelcomeOffer | null, unit: BonusUnit = "points"): OfferForm => ({
  bonusAmount: o ? String(o.bonusAmount) : "",
  bonusUnit: o?.bonusUnit ?? unit,
  minSpend: o?.minSpend != null ? String(o.minSpend) : "",
  windowMonths: o?.windowMonths != null ? String(o.windowMonths) : "",
  deadline: o?.deadline ?? "",
  note: o?.note ?? "",
});

/** The offer as typed, keeping the existing offer's progress (met, posted, spent so far). Null when the fieldset is unused. */
export function offerFromForm(f: OfferForm, existing: WelcomeOffer | null): OfferFields | null {
  const amount = Number(f.bonusAmount);
  if (f.bonusAmount.trim() === "" || !Number.isFinite(amount) || amount <= 0) return null;
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  return {
    program: existing?.program ?? null,
    spentSoFar: existing?.spentSoFar ?? null,
    spentAsOf: existing?.spentAsOf ?? null,
    metDate: existing?.metDate ?? null,
    postedDate: existing?.postedDate ?? null,
    postedAmount: existing?.postedAmount ?? null,
    outcome: existing?.outcome ?? null,
    bonusAmount: amount,
    bonusUnit: f.bonusUnit,
    minSpend: num(f.minSpend),
    windowMonths: num(f.windowMonths),
    deadline: f.deadline || null,
    note: f.note.trim() || null,
  };
}

/** A public offer as form values: days become whole months (90 → 3). */
export const publicOfferForm = (o: PublicOffer): Pick<OfferForm, "bonusAmount" | "bonusUnit" | "minSpend" | "windowMonths"> => ({
  bonusAmount: String(o.bonus),
  bonusUnit: o.unit,
  minSpend: o.min_spend === null ? "" : String(o.min_spend),
  windowMonths: o.days === null ? "" : String(Math.max(1, Math.round(o.days / 30))),
});

/** `Public offer as of Jun 8 · ⓘ` with a button that fills the fields. Never applied on its own. */
function PublicOfferHint({ offer, onUse }: { offer: PublicOffer; onUse: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const what = bonusLabel({ bonusAmount: offer.bonus, bonusUnit: offer.unit, postedAmount: null });
  return (
    <p className="mb-2 flex flex-wrap items-center gap-x-1.5 rounded-[14px] border border-text/20 px-3 py-1.5 text-sm" data-testid="public-offer">
      <span className="min-w-0 flex-1">
        Public offer as of {monthDay(offer.as_of)}: {what}
        {offer.min_spend !== null && ` for ${money(offer.min_spend)}`}
        {offer.days !== null && ` in ${offer.days} days`}
      </span>
      <InfoToggle open={open} onToggle={() => setOpen((o) => !o)} controls={id} label="About the public offer" />
      <button type="button" className="min-h-9 font-semibold underline" onClick={onUse}>
        Use it
      </button>
      <span id={id} hidden={!open} className="block basis-full pb-1 text-left text-xs text-muted">
        From a community-maintained list (
        <a className="underline decoration-dotted underline-offset-2" href={offer.source_url} target="_blank" rel="noreferrer">
          source
        </a>
        ), last updated {formatDate(offer.as_of)}
        {offer.expires ? `; listed as ending ${formatDate(offer.expires)}` : ""}. Offers change often: check the issuer&apos;s page, and enter your own if it differs.
      </span>
    </p>
  );
}

/** Add card / Edit card: the optional Welcome offer fieldset, collapsed by default (§5). */
export function OfferFieldset({
  value,
  onChange,
  open = false,
  onRemove,
  publicOffer,
}: {
  /** The catalog's public offer for the picked card: a suggestion that fills the fields on request (v6.2 §3.1). */
  publicOffer?: PublicOffer;
  value: OfferForm;
  onChange: (f: OfferForm) => void;
  open?: boolean;
  /** Set when the card already has an offer: removes it (after a confirm). */
  onRemove?: () => void;
}) {
  const set = (k: keyof OfferForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <details className="sm:col-span-2" open={open || undefined} data-testid="offer-fieldset">
      <summary className="min-h-10 cursor-pointer py-2 font-mono text-[11px] tracking-wider text-muted uppercase">
        Welcome offer{value.bonusAmount ? "" : " (optional)"}
      </summary>
      {publicOffer && <PublicOfferHint offer={publicOffer} onUse={() => onChange({ ...value, ...publicOfferForm(publicOffer) })} />}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Field label="Bonus">
          <input type="number" inputMode="decimal" min={0} step="any" value={value.bonusAmount} onChange={set("bonusAmount")} placeholder="e.g. 60000" />
        </Field>
        <Field label="Bonus unit">
          <select value={value.bonusUnit} onChange={set("bonusUnit")}>
            <option value="points">Points</option>
            <option value="miles">Miles</option>
            <option value="usd">Cash (USD)</option>
          </select>
        </Field>
        <Field label="Minimum spend" hint="USD. Leave empty if there is none.">
          <input type="number" inputMode="decimal" min={0} step="any" value={value.minSpend} onChange={set("minSpend")} placeholder="e.g. 4000" />
        </Field>
        <Field label="Months to spend">
          <input type="number" inputMode="numeric" min={1} max={36} value={value.windowMonths} onChange={set("windowMonths")} placeholder="e.g. 3" />
        </Field>
        <Field label="Exact deadline" hint="Optional. Without it, the app estimates one.">
          <input type="date" value={value.deadline} onChange={set("deadline")} />
        </Field>
        <Field label="Offer note">
          <input value={value.note} onChange={set("note")} placeholder="e.g. targeted offer" />
        </Field>
        {onRemove && (
          <div className="col-span-2">
            <button type="button" className="min-h-9 text-sm text-muted underline hover:text-urgent" onClick={onRemove}>
              Remove welcome offer
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
