"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { addAfEvent, addLifecycleEvent, deleteAfEvent, deleteLifecycleEvent } from "@/app/actions";
import { tempId, useApp } from "@/components/AppState";
import { BenefitRow } from "@/components/BenefitRow";
import { use524, useHoldingViews } from "@/components/derived";
import { Badge, Button, CardSwatch, Empty, Field, PageTitle, Provenance, Section, TextLink, usd } from "@/components/ui";
import type { Benefit, BenefitKind } from "@/lib/catalog/schema";
import { formatDate } from "@/lib/domain/dates";
import { dropOffDate } from "@/lib/domain/fiveTwentyFour";
import type { AfOutcome, LifecycleType } from "@/lib/domain/types";

const GROUPS: { kind: BenefitKind; title: string }[] = [
  { kind: "credit", title: "Credits" },
  { kind: "perk", title: "Perks" },
  { kind: "status", title: "Status" },
  { kind: "other", title: "Other benefits" },
  { kind: "protection", title: "Protections & insurance" },
];

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

export default function CardPage() {
  const { id } = useParams<{ id: string }>();
  const { data, mutate, today } = useApp();
  const views = useHoldingViews();
  const { status: s524, rule: rule524 } = use524();
  const v = views.find((x) => x.holding.id === id);

  if (!v) {
    return (
      <>
        <PageTitle>Card not found</PageTitle>
        <TextLink href="/cards">Back to cards</TextLink>
      </>
    );
  }
  const { holding: h, card, roi } = v;
  const counted = s524.accounts.find((a) => a.holdingId === h.id);
  const drop = rule524 && rule524.check.type === "x_in_y" ? dropOffDate(h.approvalDate, rule524.check) : null;
  const lifecycle = data.lifecycle.filter((e) => e.holdingId === h.id);
  const afEvents = data.afEvents.filter((e) => e.holdingId === h.id);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        sub={
          <span className="flex flex-wrap items-center gap-2">
            {card ? `${card.issuer.replace("_", " ")} · ${card.network} · ${card.account_type}` : "Not in catalog"}
            {h.status !== "open" && <Badge tone="warn">{h.status.replace("_", " ")}</Badge>}
            <TextLink href={`/cards?edit=${h.id}`}>Edit</TextLink>
          </span>
        }
      >
        <span className="flex items-center gap-2">
          <CardSwatch color={v.color} /> {v.name}
        </span>
      </PageTitle>

      <Section title="Overview">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Stat label="Annual fee">
            {card ? usd(card.annual_fee.amount) : "—"}
            {card?.annual_fee.first_year_waived && <span className="text-muted"> (1st year waived)</span>}
          </Stat>
          <Stat label="AF posting date">
            {formatDate(v.nextAf.date)}
            {v.nextAf.estimated && <span className="text-muted"> (est. from approval)</span>}
          </Stat>
          <Stat label="Approval date">{formatDate(h.approvalDate)}</Stat>
          <Stat label="Payment due day">{h.paymentDueDay ? `Day ${h.paymentDueDay} each month` : "—"}</Stat>
          <Stat label="5/24 drop-off">
            {counted ? formatDate(counted.dropOffDate) : drop && drop <= today ? `Dropped off ${formatDate(drop)}` : "Not counted"}
          </Stat>
          <Stat label="This cycle">
            {v.util.pct === null ? "—" : `${Math.round(v.util.pct * 100)}% used (${usd(v.util.used)} / ${usd(v.util.available)})`}
          </Stat>
        </dl>
        {card && (
          <div className="mt-2">
            <Provenance fact={card.annual_fee} />
          </div>
        )}
        {h.notes && <p className="mt-2 text-sm">{h.notes}</p>}
      </Section>

      <Section title="ROI this AF year" id="roi">
        <p className="text-sm text-muted">
          {formatDate(roi.start)} – {formatDate(roi.end)}
        </p>
        <p className="mt-1 text-lg" data-testid="roi-panel">
          <span className="font-semibold">{usd(roi.realized, 2)}</span> realized vs {usd(roi.annualFee)} AF ·{" "}
          <span className={roi.net >= 0 ? "text-ok" : "text-danger"}>
            net {roi.net >= 0 ? "+" : ""}
            {usd(roi.net, 2)}
          </span>
          {roi.ratio !== null && <span className="text-muted"> ({Math.round(roi.ratio * 100)}% of AF)</span>}
        </p>
        {roi.breakdown.length > 0 ? (
          <ul className="mt-2 text-sm">
            {roi.breakdown.map((b) => (
              <li key={b.benefitId} className="flex justify-between gap-2 border-b border-border py-1 last:border-0">
                <span className="min-w-0 truncate">
                  {b.name} <span className="text-muted">×{b.uses}</span>
                </span>
                <span>{usd(b.value, 2)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No benefit use logged in this AF year yet.</Empty>
        )}
      </Section>

      {card &&
        GROUPS.map((g) => {
          const items = card.benefits.filter((b: Benefit) => b.kind === g.kind);
          if (items.length === 0) return null;
          return (
            <Section key={g.kind} title={g.title}>
              <ul className="divide-y divide-border">
                {items.map((b) => (
                  <BenefitRow key={b.id} benefit={b} holding={h} color={v.color} />
                ))}
              </ul>
            </Section>
          );
        })}

      {card && (
        <Section title="Earn rates">
          <ul className="divide-y divide-border text-sm">
            {card.earn_rates.map((r) => (
              <li key={r.label} className="py-2">
                <p>
                  <span className="font-semibold">
                    {r.rate === null ? "?" : r.rate}
                    {r.unit === "percent" ? "%" : "x"}
                  </span>{" "}
                  {r.label}
                </p>
                {(r.conditions || r.cap) && <p className="text-xs text-muted">{[r.conditions, r.cap].filter(Boolean).join(" · ")}</p>}
                <Provenance fact={r} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {card && (
        <Section title="Downgrade / product-change options" id="downgrade">
          {card.downgrade_options.length === 0 ? (
            <Empty>No annual fee or no known downgrade paths.</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {card.downgrade_options.map((d) => (
                <li key={d.target_name} className="py-2">
                  <p className="font-medium">→ {d.target_name}</p>
                  {d.keep.length > 0 && <p className="text-xs">Keep: {d.keep.join(", ")}</p>}
                  {d.lose.length > 0 && <p className="text-xs">Lose: {d.lose.join(", ")}</p>}
                  <Provenance fact={d} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="Annual fee history">
        {afEvents.length === 0 ? (
          <Empty>No AF events logged.</Empty>
        ) : (
          <ul className="mb-3 text-sm">
            {afEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-1">
                <span>
                  {formatDate(e.postedDate)} · {usd(e.amount)} · {AF_OUTCOME_LABEL[e.outcome]}
                  {e.note && ` — ${e.note}`}
                </span>
                <button
                  type="button"
                  className="text-xs text-muted underline hover:text-danger"
                  onClick={() => mutate((d) => ({ ...d, afEvents: d.afEvents.filter((x) => x.id !== e.id) }), () => deleteAfEvent(e.id))}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <AfForm holdingId={h.id} defaultAmount={card?.annual_fee.amount ?? 0} defaultDate={v.nextAf.date} />
      </Section>

      <Section title="Lifecycle log">
        {lifecycle.length === 0 ? (
          <Empty>No retention calls, product changes or closures logged.</Empty>
        ) : (
          <ul className="mb-3 text-sm">
            {lifecycle.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-1">
                <span>
                  {formatDate(e.date)} · {LIFECYCLE_LABEL[e.type]}
                  {e.offer && ` · offer: ${e.offer}`}
                  {e.accepted !== null && ` (${e.accepted ? "accepted" : "declined"})`}
                  {(e.fromCard || e.toCard) && ` · ${e.fromCard ?? "?"} → ${e.toCard ?? "?"}`}
                  {e.details && ` — ${e.details}`}
                </span>
                <button
                  type="button"
                  className="text-xs text-muted underline hover:text-danger"
                  onClick={() =>
                    mutate((d) => ({ ...d, lifecycle: d.lifecycle.filter((x) => x.id !== e.id) }), () => deleteLifecycleEvent(e.id))
                  }
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <LifecycleForm holdingId={h.id} cardName={v.name} />
      </Section>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
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
      className="grid grid-cols-2 gap-2 sm:grid-cols-5"
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
      <div className="flex items-end">
        <Button type="submit">Add AF event</Button>
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
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
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
        <Button type="submit">Add event</Button>
      </div>
    </form>
  );
}
