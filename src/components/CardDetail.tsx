"use client";

import { useState } from "react";
import { addAfEvent, addLifecycleEvent, deleteAfEvent, deleteLifecycleEvent } from "@/app/actions";
import type { Benefit } from "@/lib/catalog/schema";
import type { AttentionItem } from "@/lib/domain/attention";
import { shortDate } from "@/lib/domain/dates";
import { dropOffDate } from "@/lib/domain/fiveTwentyFour";
import { benefitStatus } from "@/lib/domain/periods";
import type { AfOutcome, LifecycleType } from "@/lib/domain/types";
import { cardHeadline } from "@/lib/domain/wallet";
import { tempId, useApp } from "./AppState";
import { BenefitRow } from "./BenefitRow";
import { HoldingForm } from "./HoldingForm";
import { use524, type HoldingView } from "./derived";
import { Badge, Button, Disclosure, Empty, Field, Label, Provenance, Section, usd } from "./ui";
import { issuerLabel } from "./WalletCard";

const LIFECYCLE_LABEL: Record<LifecycleType, string> = {
  retention_call: "Retention call",
  product_change: "Product change",
  closure: "Closure",
};
const AF_OUTCOME_LABEL: Record<AfOutcome, string> = {
  paid: "Paid",
  retention_offer: "Retention offer",
  downgraded: "Downgraded",
  closed: "Closed",
};

const signed = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n), Number.isInteger(n) ? 0 : 2)}`;

/** Everything about one card, as hairline-separated sections (Wallet right pane / below the stack on phones). */
export function CardDetail({
  view,
  attention,
  logBenefitId,
  onDeleted,
}: {
  view: HoldingView;
  attention: AttentionItem[];
  /** Benefit whose log-use form should open (from an Up next "Log"). */
  logBenefitId: string | null;
  onDeleted: () => void;
}) {
  const { data, mutate, today } = useApp();
  const { status: s524, rule: rule524 } = use524();
  const { holding: h, card, roi, util } = view;
  const [editKey, setEditKey] = useState(0);

  const counted = s524.accounts.find((a) => a.holdingId === h.id);
  const drop = rule524 && rule524.check.type === "x_in_y" ? dropOffDate(h.approvalDate, rule524.check) : null;
  const lifecycle = data.lifecycle.filter((e) => e.holdingId === h.id);
  const afEvents = data.afEvents.filter((e) => e.holdingId === h.id);
  const unused = Math.max(0, Math.round((util.available - util.used) * 100) / 100);
  const headline = cardHeadline({ holding: h, attention, unusedCredits: unused, fee: view.fee, realized: roi.realized });
  const benefits = card?.benefits ?? [];

  // Credits, soonest expiry first (inactive ones last).
  const credits = benefits
    .filter((b) => b.kind === "credit")
    .map((b) => ({ b, s: benefitStatus(b, h, data.usages, today) }))
    .sort(
      (x, y) =>
        Number(!x.s.active) - Number(!y.s.active) ||
        (x.s.period.expiry ?? "9999").localeCompare(y.s.period.expiry ?? "9999") ||
        x.b.name.localeCompare(y.b.name),
    )
    .map((x) => x.b);
  const perks = benefits.filter((b) => b.kind === "perk");
  const other = benefits.filter((b) => b.kind === "status" || b.kind === "other");
  const protections = benefits.filter((b) => b.kind === "protection");
  const rows = (items: Benefit[]) => (
    <ul className="divide-y divide-hairline">
      {items.map((b) => (
        <BenefitRow key={b.id} benefit={b} holding={h} color={view.color} autoOpen={logBenefitId === b.id} />
      ))}
    </ul>
  );

  return (
    <article aria-labelledby="card-heading" data-testid="card-detail" className="min-w-0">
      {/* 1. Meta line, name, headline */}
      <header className="pb-5">
        <p className="font-mono text-[11px] tracking-wider text-muted uppercase">
          {issuerLabel(view)}
          {card && ` · ${card.network} · ${card.account_type}`} · opened {shortDate(h.approvalDate, today)}
          {h.paymentDueDay ? ` · due day ${h.paymentDueDay}` : ""}
        </p>
        <h1 id="card-heading" className="mt-1 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          {view.name}
        </h1>
        {card && h.nickname && h.nickname !== card.name && <p className="text-sm text-muted">{card.name}</p>}
        {!card && <p className="text-sm text-muted">Custom card (not in the catalog)</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {h.status !== "open" && <Badge tone="warn">{h.status.replace("_", " ")}</Badge>}
          <p className="text-lg leading-snug" data-testid="card-headline">
            {headline}
          </p>
        </div>
        {h.notes && <p className="mt-2 text-sm text-muted">{h.notes}</p>}
        <a href="#edit" className="mt-3 inline-block font-mono text-xs tracking-wider text-muted uppercase underline-offset-4 hover:text-text hover:underline">
          Edit card →
        </a>
      </header>

      {/* 2. Key figures */}
      <dl className="grid grid-cols-2 border-y border-hairline sm:grid-cols-4">
        <Figure label="Annual fee">
          <dd className="font-mono text-xl font-bold whitespace-nowrap sm:text-2xl">{card ? (card.annual_fee.amount === null ? "?" : usd(card.annual_fee.amount)) : "—"}</dd>
          <dd className="font-mono text-[11px] tracking-wider text-muted uppercase">
            {view.fee > 0 || card?.annual_fee.amount === null
              ? `Posts ${shortDate(view.nextAf.date, today)}${view.nextAf.estimated ? " (est.)" : ""}`
              : "No annual fee"}
            {card?.annual_fee.first_year_waived && " · 1st yr waived"}
          </dd>
        </Figure>
        <Figure label="Unused credits">
          <dd className="font-mono text-xl font-bold whitespace-nowrap sm:text-2xl">{util.available > 0 ? usd(unused, Number.isInteger(unused) ? 0 : 2) : "—"}</dd>
          <dd className="font-mono text-[11px] tracking-wider text-muted uppercase">
            {util.available > 0 ? (
              <>
                of {usd(util.available)} · <span data-testid="utilization">{util.pct === null ? "—" : `${Math.round(util.pct * 100)}%`}</span> used
              </>
            ) : (
              "No period credits"
            )}
          </dd>
        </Figure>
        <Figure label="Leaves 5/24">
          <dd className="font-mono text-xl font-bold whitespace-nowrap">{counted ? shortDate(counted.dropOffDate, today) : drop && drop <= today ? "Out" : "—"}</dd>
          <dd className="font-mono text-[11px] tracking-wider text-muted uppercase">
            {counted ? "counted now" : drop && drop <= today ? `Counted out ${shortDate(drop, today)}` : "Not counted"}
          </dd>
        </Figure>
        <Figure label="ROI this AF year">
          <dd className="font-mono text-xl font-bold whitespace-nowrap sm:text-2xl" data-testid="roi-panel">
            {usd(roi.realized, Number.isInteger(roi.realized) ? 0 : 2)}
          </dd>
          <dd className="font-mono text-[11px] tracking-wider text-muted uppercase">
            {roi.annualFee > 0 ? (
              <>
                vs {usd(roi.annualFee)} fee ·{" "}
                <span className={roi.net >= 0 ? "text-ok" : "text-urgent"} data-testid="roi-net">
                  {signed(roi.net)}
                </span>
              </>
            ) : (
              "realized · no fee"
            )}
          </dd>
        </Figure>
      </dl>
      {card && (
        <div className="py-2">
          <Provenance fact={card.annual_fee} />
        </div>
      )}
      <Disclosure
        id="roi"
        title="ROI breakdown"
        meta={`${shortDate(roi.start, today)} – ${shortDate(roi.end, today)}${roi.ratio !== null ? ` · ${Math.round(roi.ratio * 100)}% of AF` : ""}`}
      >
        {roi.breakdown.length > 0 ? (
          <ul className="divide-y divide-hairline text-sm">
            {roi.breakdown.map((b) => (
              <li key={b.benefitId} className="flex justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  {b.name} <span className="font-mono text-muted">×{b.uses}</span>
                </span>
                <span className="font-mono">{usd(b.value, 2)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No benefit use logged in this AF year yet.</Empty>
        )}
      </Disclosure>

      {/* 3–6. Benefits */}
      {credits.length > 0 && (
        <Section id="credits" title={`Credits, soonest first · ${credits.length}`}>
          {rows(credits)}
        </Section>
      )}
      {perks.length > 0 && (
        <Section id="perks" title={`Perks · ${perks.length}`}>
          {rows(perks)}
        </Section>
      )}
      {other.length > 0 && (
        <Section id="other-benefits" title={`Other benefits · ${other.length}`}>
          {rows(other)}
        </Section>
      )}
      {protections.length > 0 && (
        <Disclosure id="protections" title="Protections & insurance" meta={protections.length}>
          {rows(protections)}
        </Disclosure>
      )}

      {/* 7. Earn rates */}
      {card && (
        <Section id="earn" title="Earn rates">
          <ul className="divide-y divide-hairline text-sm">
            {card.earn_rates.map((r) => (
              <li key={r.label} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 py-2.5">
                <span className="font-mono text-lg font-bold">
                  {r.rate === null ? "?" : r.rate}
                  {r.unit === "percent" ? "%" : "x"}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{r.label}</span>
                  {(r.conditions || r.cap) && <span className="block text-muted">{[r.conditions, r.cap].filter(Boolean).join(" · ")}</span>}
                  <Provenance fact={r} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 8. Downgrade options */}
      {card && (
        <Section title="Downgrade / product-change options" id="downgrade">
          {card.downgrade_options.length === 0 ? (
            <Empty>No annual fee or no known downgrade paths.</Empty>
          ) : (
            <ul className="divide-y divide-hairline text-sm">
              {card.downgrade_options.map((d) => (
                <li key={d.target_name} className="py-2.5">
                  <p className="font-semibold">→ {d.target_name}</p>
                  {d.keep.length > 0 && (
                    <p>
                      <Label>Keep</Label> {d.keep.join(", ")}
                    </p>
                  )}
                  {d.lose.length > 0 && (
                    <p>
                      <Label>Lose</Label> {d.lose.join(", ")}
                    </p>
                  )}
                  <Provenance fact={d} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* 9. AF history */}
      <Disclosure id="af-history" title="Annual fee history" meta={afEvents.length}>
        {afEvents.length === 0 ? (
          <Empty>No AF events logged.</Empty>
        ) : (
          <ul className="mb-4 divide-y divide-hairline text-sm">
            {afEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-mono text-xs tracking-wider uppercase">{shortDate(e.postedDate, today)}</span>
                <span className="font-mono font-bold">{usd(e.amount)}</span>
                <span>{AF_OUTCOME_LABEL[e.outcome]}</span>
                {e.note && <span className="text-muted">{e.note}</span>}
                <button
                  type="button"
                  className="ml-auto min-h-8 text-xs text-muted underline hover:text-urgent"
                  onClick={() => mutate((d) => ({ ...d, afEvents: d.afEvents.filter((x) => x.id !== e.id) }), () => deleteAfEvent(e.id))}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <AfForm key={h.id} holdingId={h.id} defaultAmount={card?.annual_fee.amount ?? 0} defaultDate={view.nextAf.date} />
      </Disclosure>

      {/* 10. Lifecycle */}
      <Disclosure id="lifecycle" title="Lifecycle log" meta={lifecycle.length}>
        {lifecycle.length === 0 ? (
          <Empty>No retention calls, product changes or closures logged.</Empty>
        ) : (
          <ul className="mb-4 divide-y divide-hairline text-sm">
            {lifecycle.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-mono text-xs tracking-wider uppercase">{shortDate(e.date, today)}</span>
                <span className="font-semibold">{LIFECYCLE_LABEL[e.type]}</span>
                <span className="min-w-0">
                  {e.offer && `offer: ${e.offer}`}
                  {e.accepted !== null && ` (${e.accepted ? "accepted" : "declined"})`}
                  {(e.fromCard || e.toCard) && ` · ${e.fromCard ?? "?"} → ${e.toCard ?? "?"}`}
                  {e.details && ` — ${e.details}`}
                </span>
                <button
                  type="button"
                  className="ml-auto min-h-8 text-xs text-muted underline hover:text-urgent"
                  onClick={() => mutate((d) => ({ ...d, lifecycle: d.lifecycle.filter((x) => x.id !== e.id) }), () => deleteLifecycleEvent(e.id))}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <LifecycleForm key={h.id} holdingId={h.id} cardName={view.name} />
      </Disclosure>

      {/* 11. Edit card */}
      <Disclosure id="edit" title="Edit card">
        <HoldingForm
          key={`${h.id}-${editKey}`}
          initial={h}
          onDone={() => {
            setEditKey((k) => k + 1);
            document.getElementById("edit")?.removeAttribute("open");
          }}
          onDeleted={onDeleted}
        />
      </Disclosure>
    </article>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 py-3 pr-3">
      <dt>
        <Label>{label}</Label>
      </dt>
      {children}
    </div>
  );
}

function AfForm({ holdingId, defaultAmount, defaultDate }: { holdingId: string; defaultAmount: number; defaultDate: string }) {
  const { mutate } = useApp();
  const [postedDate, setPostedDate] = useState(defaultDate);
  const [amount, setAmount] = useState(String(defaultAmount));
  const [outcome, setOutcome] = useState<AfOutcome>("paid");
  const [note, setNote] = useState("");
  return (
    <form
      aria-label="Add AF event"
      className="grid grid-cols-2 gap-3 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        const ev = { holdingId, postedDate, amount: Number(amount), outcome, note: note || null };
        mutate((d) => ({ ...d, afEvents: [...d.afEvents, { id: tempId(), ...ev }] }), () => addAfEvent(ev));
        setNote("");
      }}
    >
      <Field label="Posted">
        <input type="date" value={postedDate} onChange={(e) => setPostedDate(e.target.value)} required />
      </Field>
      <Field label="Amount">
        <input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </Field>
      <Field label="Outcome">
        <select value={outcome} onChange={(e) => setOutcome(e.target.value as AfOutcome)}>
          {Object.entries(AF_OUTCOME_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
      </Field>
      <div className="col-span-2 flex items-end sm:col-span-1">
        <Button type="submit" size="sm">
          Add AF event
        </Button>
      </div>
    </form>
  );
}

function LifecycleForm({ holdingId, cardName }: { holdingId: string; cardName: string }) {
  const { mutate, today } = useApp();
  const [type, setType] = useState<LifecycleType>("retention_call");
  const [date, setDate] = useState(today);
  const [offer, setOffer] = useState("");
  const [accepted, setAccepted] = useState<"" | "yes" | "no">("");
  const [toCard, setToCard] = useState("");
  const [details, setDetails] = useState("");
  return (
    <form
      aria-label="Add lifecycle event"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const ev = {
          holdingId,
          type,
          date,
          offer: offer || null,
          accepted: accepted === "" ? null : accepted === "yes",
          fromCard: type === "product_change" ? cardName : null,
          toCard: type === "product_change" ? toCard || null : null,
          details: details || null,
        };
        mutate((d) => ({ ...d, lifecycle: [...d.lifecycle, { id: tempId(), ...ev }] }), () => addLifecycleEvent(ev));
        setOffer("");
        setDetails("");
        setToCard("");
      }}
    >
      <Field label="Type">
        <select value={type} onChange={(e) => setType(e.target.value as LifecycleType)}>
          {Object.entries(LIFECYCLE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </Field>
      {type === "product_change" ? (
        <Field label="Changed to">
          <input value={toCard} onChange={(e) => setToCard(e.target.value)} placeholder="new product" />
        </Field>
      ) : (
        <Field label="Offer">
          <input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="e.g. statement credit" />
        </Field>
      )}
      <Field label="Accepted?">
        <select value={accepted} onChange={(e) => setAccepted(e.target.value as "" | "yes" | "no")}>
          <option value="">—</option>
          <option value="yes">Accepted</option>
          <option value="no">Declined</option>
        </select>
      </Field>
      <Field label="Details">
        <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="optional" />
      </Field>
      <div className="flex items-end">
        <Button type="submit" size="sm">
          Add event
        </Button>
      </div>
    </form>
  );
}
