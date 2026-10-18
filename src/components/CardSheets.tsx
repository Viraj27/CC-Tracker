"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addAfEvent, addLifecycleEvent, deleteAfEvent, deleteLifecycleEvent } from "@/app/actions";
import type { Benefit } from "@/lib/catalog/schema";
import type { AttentionItem } from "@/lib/domain/attention";
import { shortDate } from "@/lib/domain/dates";
import { benefitShortName } from "@/lib/domain/holdings";
import { enrollmentView } from "@/lib/domain/enrollment";
import { benefitStatus, creditView } from "@/lib/domain/periods";
import { perkUnitValue } from "@/lib/domain/roi";
import { currentAndNextQuarter, isActivated } from "@/lib/domain/rotating";
import type { AfOutcome, LifecycleType } from "@/lib/domain/types";
import { isTemp, tempId, useApp } from "./AppState";
import { benefitEndsText, EnrollmentBadge, PeriodLine } from "./BenefitBits";
import { useHoldingViews, useUpNext, type HoldingView } from "./derived";
import { HoldingForm } from "./HoldingForm";
import { LogUse } from "./LogUse";
import { useAddEnrollment, useDeleteEnrollment, useSetActivated, useSetMutes, useSetPaid, useSetSkipped } from "./mutations";
import { ReminderSwitch } from "./Reminders";
import { KeyFigures, Sheet, SheetHeader, SheetPrimary, SheetSecondary, useSheet, type ListKind, type SheetRoute } from "./Sheet";
import { Badge, Button, CELL, Empty, FactBadges, Field, Group, GroupBadges, GroupLabel, Label, Provenance, Row, usd } from "./ui";

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
export const LIFECYCLE_LABEL: Record<LifecycleType, string> = {
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
export const LIST_TITLE: Record<ListKind, string> = {
  perks: "Perks",
  other: "Other benefits",
  protections: "Protections & insurance",
  earn: "Earn rates",
  downgrade: "Downgrade options",
  fees: "Fee history",
  lifecycle: "Lifecycle log",
};

const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : usd(n, Number.isInteger(n) ? 0 : 2));
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;

/** "Skip this quarter" etc.; "Skip this one" when the occurrence is a single date. */
export const skipThisLabel = (a: AttentionItem) => (a.periodNoun ? `Skip this ${a.periodNoun}` : "Skip this one");
/** The accessible target used by every Up next action: "<card>: <item>". */
export const targetOf = (a: AttentionItem) => `${a.cardName}: ${a.label}`;

function routeTitle(r: SheetRoute, views: HoldingView[]): string {
  const v = "holdingId" in r ? views.find((x) => x.holding.id === r.holdingId) : undefined;
  switch (r.type) {
    case "item":
      return r.item.short;
    case "benefit": {
      const b = v?.card?.benefits.find((x) => x.id === r.benefitId);
      return b ? benefitShortName(b) : "Benefit";
    }
    case "list":
      return LIST_TITLE[r.list];
    case "roi":
      return "ROI";
    case "rotating":
      return "Rotating";
    case "edit":
      return "Edit";
  }
}

/** Renders the open sheet (if any). Mounted once in the layout. */
export function SheetHost() {
  const { stack, close, back } = useSheet();
  const views = useHoldingViews();
  const top = stack.at(-1);
  if (!top) return null;
  const prev = stack.at(-2);
  return (
    <Sheet onClose={close} onBack={prev ? back : null} backLabel={prev ? routeTitle(prev, views) : null} routeKey={`${stack.length}:${JSON.stringify(top).slice(0, 200)}`}>
      <SheetContent route={top} />
    </Sheet>
  );
}

function SheetContent({ route }: { route: SheetRoute }) {
  const views = useHoldingViews();
  if (route.type === "item") return <ItemSheet snapshot={route.item} />;
  const view = views.find((v) => v.holding.id === route.holdingId);
  if (!view) return <SheetHeader title="Card not found" />;
  switch (route.type) {
    case "benefit": {
      const b = view.card?.benefits.find((x) => x.id === route.benefitId);
      return b ? <BenefitSheet view={view} benefit={b} /> : <SheetHeader title="Benefit not found" />;
    }
    case "roi":
      return <RoiSheet view={view} />;
    case "rotating":
      return <RotatingSheet view={view} />;
    case "list":
      return <ListSheet view={view} list={route.list} />;
    case "edit":
      return <EditSheet view={view} />;
  }
}

/* ---------------------------------------------------------------- items -- */

/** The catalog fact behind an Up next item (for its ⓘ), if any. */
function useItemFact(item: AttentionItem, view: HoldingView | undefined) {
  const { catalog, today } = useApp();
  const card = view?.card;
  if (!card) return null;
  switch (item.kind) {
    case "credit":
    case "enroll": {
      const b = card.benefits.find((x) => x.id === item.benefitId);
      return b ? { fact: b, description: b.description } : null;
    }
    case "af":
      return { fact: card.annual_fee, description: `${card.name} annual fee${card.annual_fee.first_year_waived ? ", waived the first year" : ""}.` };
    case "rotating": {
      const program = catalog.rotating.find((r) => r.id === card.rotating_program);
      const entry = program && currentAndNextQuarter(program, today)[0].entry;
      return entry ? { fact: entry, description: `${program!.name} ${entry.quarter}.` } : null;
    }
    case "unverified": {
      // The fact behind the item it annotates.
      const b = item.benefitId ? card.benefits.find((x) => x.id === item.benefitId) : undefined;
      if (b) return { fact: b, description: item.detail };
      if (item.occurrence.period.startsWith("af@")) return { fact: card.annual_fee, description: item.detail };
      const program = catalog.rotating.find((r) => r.id === card.rotating_program);
      const entry = program && currentAndNextQuarter(program, today)[0].entry;
      return entry ? { fact: entry, description: item.detail } : null;
    }
    default:
      return null;
  }
}

/** The sheet for an Up next item: two key figures, the primary action, Skip / Stop reminding me. */
function ItemSheet({ snapshot }: { snapshot: AttentionItem }) {
  const { catalog, data, today } = useApp();
  const { visible, hidden } = useUpNext();
  const views = useHoldingViews();
  const sheet = useSheet();
  const setPaid = useSetPaid();
  const setActivated = useSetActivated();
  const addEnrollment = useAddEnrollment();
  const setSkipped = useSetSkipped();
  const setMutes = useSetMutes();
  const live = visible.find((a) => a.id === snapshot.id);
  const hiddenItem = hidden.find((h) => h.item.id === snapshot.id);
  const item = live ?? hiddenItem?.item ?? snapshot;
  const view = views.find((v) => v.holding.id === item.holdingId);
  const fact = useItemFact(item, view);
  const target = targetOf(item);
  const due = shortDate(item.date, today);
  const urgent = item.severity === "critical";
  const benefit = item.benefitId ? view?.card?.benefits.find((b) => b.id === item.benefitId) : undefined;

  let figures: { label: string; value: React.ReactNode; urgent?: boolean; testId?: string }[] = [];
  let body: React.ReactNode = null;
  switch (item.kind) {
    case "credit": {
      const s = benefit && view ? benefitStatus(benefit, view.holding, data.usages, today) : null;
      figures = [
        { label: "Left", value: money(s?.remaining ?? item.amount), testId: "sheet-left" },
        { label: "Expires", value: due, urgent },
      ];
      body = benefit && view ? <LogUse benefit={benefit} holding={view.holding} /> : null;
      break;
    }
    case "enroll":
      figures = [
        { label: "Card", value: item.cardName },
        { label: item.daysUntil <= 0 ? "Lapsed" : "Lapses", value: due, urgent },
      ];
      body = (
        <>
          {benefit?.how_to_use && <p className="mb-3 px-1 text-[15px]">{benefit.how_to_use}</p>}
          {live && (
            <SheetPrimary
              aria-label={`Mark enrolled — ${target}`}
              onClick={() => {
                addEnrollment(item.holdingId, item.benefitId!);
                sheet.close();
              }}
            >
              Mark enrolled
            </SheetPrimary>
          )}
        </>
      );
      break;
    case "payment":
      figures = [
        { label: "Card", value: item.cardName },
        { label: "Due", value: due, urgent },
      ];
      body = live && (
        <SheetPrimary
          aria-label={`Mark paid — ${target}`}
          onClick={() => {
            setPaid(item.holdingId, item.month!, item.date, true);
            sheet.close();
          }}
        >
          Mark paid
        </SheetPrimary>
      );
      break;
    case "af":
      figures = [
        { label: "Fee", value: money(item.amount) },
        { label: "Posts", value: due, urgent },
      ];
      body = (
        <SheetPrimary aria-label={`See options — ${target}`} onClick={() => sheet.push({ type: "list", holdingId: item.holdingId, list: "downgrade" })}>
          See options
        </SheetPrimary>
      );
      break;
    case "rotating": {
      const program = catalog.rotating.find((r) => r.id === view?.card?.rotating_program);
      const entry = program && currentAndNextQuarter(program, today)[0].entry;
      figures = [
        { label: "Card", value: item.cardName },
        { label: "Activate by", value: entry?.activation_deadline ? due : "—", urgent },
      ];
      body = (
        <>
          {entry && <p className="mb-3 px-1 text-[15px]">{entry.categories.map((c) => c.name).join(", ")}</p>}
          {live && (
            <SheetPrimary
              aria-label={`Mark activated — ${target}`}
              onClick={() => {
                setActivated(item.holdingId, item.quarter!, true);
                sheet.close();
              }}
            >
              Mark activated
            </SheetPrimary>
          )}
        </>
      );
      break;
    }
    default: {
      // Unverified: open what it annotates.
      const parent: SheetRoute | null = item.benefitId
        ? { type: "benefit", holdingId: item.holdingId, benefitId: item.benefitId }
        : item.occurrence.period.startsWith("af@")
          ? { type: "list", holdingId: item.holdingId, list: "fees" }
          : item.occurrence.period.startsWith("rotating@")
            ? { type: "rotating", holdingId: item.holdingId }
            : null;
      figures = [
        { label: "Card", value: item.cardName },
        { label: "Date", value: due },
      ];
      body = parent && (
        <SheetPrimary aria-label={`Review — ${target}`} onClick={() => sheet.push(parent)}>
          Review
        </SheetPrimary>
      );
    }
  }

  return (
    <div data-testid="item-sheet">
      <SheetHeader
        title={item.short}
        sub={item.cardName}
        info={fact && <Provenance flow fact={fact.fact} description={fact.description} />}
      />
      <KeyFigures items={figures} />
      {body}
      <div className="mt-2 flex flex-wrap justify-center gap-x-4">
        {hiddenItem ? (
          <RestoreButton h={hiddenItem} onDone={sheet.close} />
        ) : (
          <>
            <SheetSecondary
              aria-label={`${skipThisLabel(item)} — ${target}`}
              onClick={() => {
                setSkipped(item.occurrence, true);
                sheet.close();
              }}
            >
              {skipThisLabel(item)}
            </SheetSecondary>
            {item.mute && (
              <SheetSecondary
                aria-label={`Stop reminding me — ${target}`}
                onClick={() => {
                  setMutes(item.holdingId, [{ kind: item.mute!.kind, benefitId: item.mute!.benefitId, muted: true }]);
                  sheet.close();
                }}
              >
                Stop reminding me
              </SheetSecondary>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RestoreButton({ h, onDone }: { h: NonNullable<ReturnType<typeof useUpNext>["hidden"][number]>; onDone: () => void }) {
  const setSkipped = useSetSkipped();
  const setMutes = useSetMutes();
  const target = targetOf(h.item);
  const r = h.reason;
  return r.type === "skip" ? (
    <SheetSecondary
      aria-label={`Unskip — ${target}`}
      onClick={() => {
        setSkipped(r.occurrence, false);
        onDone();
      }}
    >
      Unskip
    </SheetSecondary>
  ) : (
    <SheetSecondary
      aria-label={`Turn reminders back on — ${target}`}
      onClick={() => {
        setMutes(r.holdingId, [{ kind: r.kind, benefitId: r.benefitId, muted: false }]);
        onDone();
      }}
    >
      Turn reminders back on
    </SheetSecondary>
  );
}

/* ------------------------------------------------------------- benefits -- */

/** A benefit's sheet: credits log with chips (§3.4); perks log a count; protections show key terms. */
function BenefitSheet({ view, benefit }: { view: HoldingView; benefit: Benefit }) {
  const { data, today, catalog } = useApp();
  const { visible } = useUpNext();
  const setSkipped = useSetSkipped();
  const sheet = useSheet();
  const addEnrollment = useAddEnrollment();
  const deleteEnrollment = useDeleteEnrollment();
  const h = view.holding;
  const cv = creditView(benefit, h, data.usages, today);
  const s = cv.status;
  const enrollment = enrollmentView(benefit, h, data.enrollments, today);
  const ends = benefitEndsText(benefit);
  const isCredit = benefit.kind === "credit";
  const quantified = isCredit && benefit.amount !== null && benefit.cycle !== "per_use" && benefit.cycle !== "none";
  const expiringSoon = s.daysToExpiry !== null && s.daysToExpiry <= data.settings.creditLeadDays && (s.remaining ?? 1) > 0;
  const item = visible.find((a) => a.kind === "credit" && a.holdingId === h.id && a.benefitId === benefit.id);
  const loggable = (isCredit || benefit.kind === "perk") && s.active && h.status === "open";
  const unitValue = benefit.kind === "perk" ? perkUnitValue(benefit, catalog, data.settings) : null;
  const short = isCredit ? benefitShortName(benefit) : benefit.name;
  const details = (
    <>
      {short !== benefit.name && <span className="block font-semibold">{benefit.name}</span>}
      {benefit.description}
      {benefit.how_to_use && <span className="mt-1 block text-muted">How to use: {benefit.how_to_use}</span>}
    </>
  );

  return (
    <div data-testid="benefit-sheet">
      <SheetHeader title={short} sub={view.name} info={<Provenance flow fact={benefit} description={isCredit ? details : undefined} />} />
      {(enrollment.state === "needed" || enrollment.state === "lapsed" || !s.active || ends) && (
        <p className="-mt-1 mb-3 flex flex-wrap gap-2" data-testid="benefit-badges">
          <EnrollmentBadge e={enrollment} />
          {!s.active && <Badge tone="info">{cv.state === "ended" ? "Ended" : "Not started"}</Badge>}
          {ends && cv.state !== "ended" && <Badge tone="info">{ends}</Badge>}
        </p>
      )}
      {quantified && (
        <>
          <KeyFigures
            items={
              cv.state === "used_upcoming" || cv.state === "not_started"
                ? [
                    { label: "Left", value: money(s.active ? s.remaining : 0), testId: "sheet-left" },
                    // No year: the period line below carries it, and "1 JAN 2027" doesn't fit half a 390px sheet.
                    { label: "Opens", value: shortDate(cv.opensOn, cv.opensOn ?? undefined) },
                  ]
                : [
                    { label: "Left", value: money(s.remaining), testId: "sheet-left" },
                    { label: "Expires", value: s.period.expiry ? shortDate(s.period.expiry, today) : "—", urgent: expiringSoon },
                  ]
            }
          />
          <p className="-mt-2 mb-4 px-1 font-mono text-[11px] tracking-wider text-muted uppercase" data-testid="sheet-period">
            {cv.state === "used_upcoming" ? "Next: " : ""}
            <PeriodLine benefit={benefit} cv={cv} cycleLabel={CYCLE_LABEL[benefit.cycle]} today={today} urgent={false} />
          </p>
        </>
      )}
      {isCredit && !quantified && (
        <KeyFigures
          items={[
            { label: benefit.cycle === "per_use" ? "Per use" : "Amount", value: money(benefit.amount) },
            { label: "Cycle", value: CYCLE_LABEL[benefit.cycle] },
          ]}
        />
      )}
      {benefit.kind === "perk" && (
        <KeyFigures
          items={[
            { label: "Per period", value: benefit.amount === null ? "—" : `${benefit.amount}${s.used ? ` · ${s.used} used` : ""}` },
            { label: "Value/use", value: unitValue === null ? "Not set" : money(unitValue) },
          ]}
        />
      )}
      {!isCredit && (
        <div className="mb-4 rounded-[14px] bg-list px-4 py-3 text-[15px] leading-snug">
          <p>{details}</p>
          {benefit.protection && <ProtectionTerms p={benefit.protection} />}
          {benefit.kind === "perk" && unitValue === null && <p className="mt-1 text-sm text-muted">Set a value per use in Settings.</p>}
        </div>
      )}
      {enrollment.state !== "none" && h.status === "open" && (
        <div className="mb-4 flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[14px] bg-list px-4 py-2 text-[15px]" data-testid="enrollment">
          {enrollment.latest && enrollment.state === "enrolled" ? (
            <>
              <span>
                Enrolled <span className="font-mono">{shortDate(enrollment.latest.enrolledOn, today)}</span>
                {enrollment.lapsesOn && (
                  <span className="text-muted">
                    {" "}
                    · lapses <span className="font-mono">{shortDate(enrollment.lapsesOn, today)}</span>
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled={isTemp(enrollment.latest.id)}
                className="min-h-9 text-sm text-muted underline hover:text-text"
                onClick={() => deleteEnrollment(enrollment.latest!.id)}
              >
                undo
              </button>
            </>
          ) : (
            <>
              <span className="text-muted">
                {enrollment.state === "lapsed" && enrollment.lapsesOn ? (
                  <>
                    Enrolled <span className="font-mono">{shortDate(enrollment.latest!.enrolledOn, today)}</span> · lapsed{" "}
                    <span className="font-mono">{shortDate(enrollment.lapsesOn, today)}</span>
                  </>
                ) : (
                  "Not enrolled yet"
                )}
              </span>
              <Button size="sm" onClick={() => addEnrollment(h.id, benefit.id)}>
                Mark enrolled
              </Button>
            </>
          )}
        </div>
      )}
      {loggable && <LogUse key={`${benefit.id}-${s.period.key}`} benefit={benefit} holding={h} />}
      {(isCredit || benefit.kind === "perk") && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4">
          {item && (
            <SheetSecondary
              aria-label={`${skipThisLabel(item)} — ${targetOf(item)}`}
              onClick={() => {
                setSkipped(item.occurrence, true);
                sheet.close();
              }}
            >
              {skipThisLabel(item)}
            </SheetSecondary>
          )}
          <ReminderSwitch holdingId={h.id} kind="benefit" benefitId={benefit.id} name={benefit.name} />
        </div>
      )}
    </div>
  );
}

function ProtectionTerms({ p }: { p: NonNullable<Benefit["protection"]> }) {
  return (
    <dl className="mt-3 flex flex-col gap-2 border-t border-hairline pt-3 text-[15px]">
      <div>
        <dt>
          <Label>Coverage</Label>
        </dt>
        <dd>{p.coverage ?? <span className="text-warn">Not confirmed — check the Guide to Benefits</span>}</dd>
      </div>
      {p.conditions.length > 0 && (
        <div>
          <dt>
            <Label>Conditions</Label>
          </dt>
          <dd>
            <ul className="list-disc pl-5">
              {p.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </dd>
        </div>
      )}
      <div>
        <dt>
          <Label>How to claim</Label>
        </dt>
        <dd>{p.how_to_claim ?? "—"}</dd>
      </div>
    </dl>
  );
}

/* ------------------------------------------------------- ROI / rotating -- */

function RoiSheet({ view }: { view: HoldingView }) {
  const { today } = useApp();
  const { roi, util } = view;
  return (
    <div data-testid="roi-sheet">
      <SheetHeader title="ROI this AF year" sub={`${view.name} · ${shortDate(roi.start, today)} – ${shortDate(roi.end, today)}`} />
      <KeyFigures
        items={[
          { label: "Realized", value: money(roi.realized) },
          {
            label: roi.annualFee > 0 ? `vs ${money(roi.annualFee)} fee` : "No fee",
            value: roi.annualFee > 0 ? <span className={roi.net >= 0 ? "text-ok" : "text-urgent"}>{signed(roi.net)}</span> : "—",
            testId: "roi-net",
          },
        ]}
      />
      <GroupLabel>Breakdown</GroupLabel>
      {roi.breakdown.length > 0 ? (
        <Group>
          {roi.breakdown.map((b) => (
            <Row key={b.benefitId} title={b.name} sub={`×${b.uses}`} amount={money(b.value)} />
          ))}
        </Group>
      ) : (
        <Group>
          <li className={CELL}>
            <Empty>No benefit use logged in this AF year yet.</Empty>
          </li>
        </Group>
      )}
      <GroupLabel>Credits this period</GroupLabel>
      <Group>
        <Row
          title="Used"
          sub={util.available > 0 ? `of ${money(util.available)}` : "No period credits"}
          amount={<span data-testid="utilization">{util.pct === null ? "—" : `${Math.round(util.pct * 100)}%`}</span>}
        />
      </Group>
    </div>
  );
}

function RotatingSheet({ view }: { view: HoldingView }) {
  const { catalog, data, today } = useApp();
  const setActivated = useSetActivated();
  const program = catalog.rotating.find((r) => r.id === view.card?.rotating_program);
  if (!program) return <SheetHeader title="No rotating categories" />;
  const quarters = currentAndNextQuarter(program, today);
  const rate = `${program.rate.value}${program.rate.unit === "percent" ? "%" : "x"}`;
  const h = view.holding;
  return (
    <div data-testid="rotating-sheet">
      <SheetHeader title={`Rotating ${rate}`} sub={view.name} info={<Provenance flow fact={program.rate} description={program.rate.cap ?? undefined} />} />
      {quarters.map((q, i) => {
        const active = isActivated(data.activations, h.id, q.quarter);
        return (
          <div key={q.quarter}>
            <GroupLabel>
              {i === 0 ? "This quarter" : "Next quarter"} · {q.quarter}
            </GroupLabel>
            <Group>
              <li className={CELL}>
                <p className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-[15px] font-medium">
                    {q.announced && q.entry ? q.entry.categories.map((c) => c.name).join(", ") : "Not announced"}
                  </span>
                  {q.entry && <Provenance fact={q.entry} className="shrink-0 justify-end" />}
                </p>
                {q.entry?.activation_deadline && (
                  <p className="font-mono text-[11px] tracking-wider text-muted uppercase">Activate by {shortDate(q.entry.activation_deadline, today)}</p>
                )}
              </li>
              {q.announced && (
                <li>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4">
                    <input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActivated(h.id, q.quarter, e.target.checked)} />
                    <span>{q.quarter} activated</span>
                  </label>
                </li>
              )}
            </Group>
          </div>
        );
      })}
      <div className="mt-3 flex justify-center">
        <ReminderSwitch holdingId={h.id} kind="rotating" name={`${program.name} activation`} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- drill-ins -- */

/** Benefits of a kind, as listed on the Card page's drill-in rows. */
export function benefitsOf(view: HoldingView, list: "perks" | "other" | "protections"): Benefit[] {
  const all = view.card?.benefits ?? [];
  if (list === "perks") return all.filter((b) => b.kind === "perk");
  if (list === "protections") return all.filter((b) => b.kind === "protection");
  return all.filter((b) => b.kind === "status" || b.kind === "other");
}

function ListSheet({ view, list }: { view: HoldingView; list: ListKind }) {
  const sheet = useSheet();
  const { data, mutate, today } = useApp();
  const card = view.card;
  const h = view.holding;
  let body: React.ReactNode;
  switch (list) {
    case "perks":
    case "other":
    case "protections": {
      const items = benefitsOf(view, list);
      body =
        items.length === 0 ? (
          <Empty>None for this card.</Empty>
        ) : (
          <Group>
            {items.map((b) => (
              <Row
                key={b.id}
                title={b.name}
                sub={b.kind === "protection" ? b.protection?.coverage ?? "Coverage not confirmed" : CYCLE_LABEL[b.cycle]}
                badges={
                  <>
                    <EnrollmentBadge e={enrollmentView(b, view.holding, data.enrollments, today)} />
                    <FactBadges fact={b} />
                  </>
                }
                chevron
                onClick={() => sheet.push({ type: "benefit", holdingId: h.id, benefitId: b.id })}
              />
            ))}
          </Group>
        );
      break;
    }
    case "earn":
      body = !card ? (
        <Empty>Custom card: no catalog earn rates.</Empty>
      ) : (
        <Group>
          {card.earn_rates.map((r) => (
            <li key={r.label} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-12 shrink-0 font-mono text-lg font-bold">
                {r.rate === null ? "?" : r.rate}
                {r.unit === "percent" ? "%" : "x"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block leading-snug font-medium">{r.label}</span>
                {(r.conditions || r.cap) && <span className="block text-sm text-muted">{[r.conditions, r.cap].filter(Boolean).join(" · ")}</span>}
              </span>
              <Provenance fact={r} className="shrink-0 justify-end" />
            </li>
          ))}
        </Group>
      );
      break;
    case "downgrade":
      body = (
        <>
          {!card || card.downgrade_options.length === 0 ? (
            <Empty>No annual fee or no known downgrade paths.</Empty>
          ) : (
            <Group>
              {card.downgrade_options.map((d) => (
                <li key={d.target_name} className={CELL}>
                  <p className="flex items-start justify-between gap-2">
                    <span className="font-semibold">→ {d.target_name}</span>
                    <Provenance fact={d} className="shrink-0 justify-end" />
                  </p>
                  {d.keep.length > 0 && (
                    <p className="text-sm">
                      <Label>Keep</Label> {d.keep.join(", ")}
                    </p>
                  )}
                  {d.lose.length > 0 && (
                    <p className="text-sm">
                      <Label>Lose</Label> {d.lose.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </Group>
          )}
          <GroupLabel>Retention</GroupLabel>
          <Group>
            <Row title="Fee history" chevron onClick={() => sheet.push({ type: "list", holdingId: h.id, list: "fees" })} />
            <Row title="Lifecycle log" sub="Retention calls, product changes" chevron onClick={() => sheet.push({ type: "list", holdingId: h.id, list: "lifecycle" })} />
          </Group>
        </>
      );
      break;
    case "fees": {
      const events = data.afEvents.filter((e) => e.holdingId === h.id);
      body = (
        <>
          <KeyFigures
            items={[
              { label: "Fee", value: card ? (card.annual_fee.amount === null ? "?" : money(card.annual_fee.amount)) : "—" },
              {
                label: view.fee > 0 || card?.annual_fee.amount === null ? `Posts${view.nextAf.estimated ? " (est.)" : ""}` : "No fee",
                value: view.fee > 0 || card?.annual_fee.amount === null ? shortDate(view.nextAf.date, today) : "—",
              },
            ]}
          />
          {card?.annual_fee.first_year_waived && <p className="-mt-2 mb-3 px-1 text-sm text-muted">First year waived</p>}
          <GroupLabel>Events</GroupLabel>
          <Group className="mb-4">
            {events.length === 0 ? (
              <li className={CELL}>
                <Empty>No AF events logged.</Empty>
              </li>
            ) : (
              events.map((e) => (
                <li key={e.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-sm">
                  <span className="font-mono text-xs tracking-wider uppercase">{shortDate(e.postedDate, today)}</span>
                  <span className="font-mono font-bold">{usd(e.amount)}</span>
                  <span>{AF_OUTCOME_LABEL[e.outcome]}</span>
                  {e.note && <span className="text-muted">{e.note}</span>}
                  <DeleteButton
                    disabled={isTemp(e.id)}
                    onClick={() => mutate((d) => ({ ...d, afEvents: d.afEvents.filter((x) => x.id !== e.id) }), () => deleteAfEvent(e.id))}
                  />
                </li>
              ))
            )}
          </Group>
          <AfForm holdingId={h.id} defaultAmount={card?.annual_fee.amount ?? 0} defaultDate={view.nextAf.date} />
        </>
      );
      break;
    }
    case "lifecycle": {
      const events = data.lifecycle.filter((e) => e.holdingId === h.id);
      body = (
        <>
          <Group className="mb-4">
            {events.length === 0 ? (
              <li className={CELL}>
                <Empty>No retention calls, product changes or closures logged.</Empty>
              </li>
            ) : (
              events.map((e) => (
                <li key={e.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-sm">
                  <span className="font-mono text-xs tracking-wider uppercase">{shortDate(e.date, today)}</span>
                  <span className="font-semibold">{LIFECYCLE_LABEL[e.type]}</span>
                  <span className="min-w-0">
                    {e.offer && `offer: ${e.offer}`}
                    {e.accepted !== null && ` (${e.accepted ? "accepted" : "declined"})`}
                    {(e.fromCard || e.toCard) && ` · ${e.fromCard ?? "?"} → ${e.toCard ?? "?"}`}
                    {e.details && ` — ${e.details}`}
                  </span>
                  <DeleteButton
                    disabled={isTemp(e.id)}
                    onClick={() => mutate((d) => ({ ...d, lifecycle: d.lifecycle.filter((x) => x.id !== e.id) }), () => deleteLifecycleEvent(e.id))}
                  />
                </li>
              ))
            )}
          </Group>
          <LifecycleForm holdingId={h.id} cardName={view.name} />
        </>
      );
      break;
    }
  }
  return (
    <div data-testid={`list-sheet-${list}`}>
      <SheetHeader
        title={LIST_TITLE[list]}
        sub={view.name}
        info={list === "fees" && card ? <Provenance flow fact={card.annual_fee} /> : list === "downgrade" && card ? <GroupBadges facts={card.downgrade_options} /> : undefined}
      />
      {body}
    </div>
  );
}

function DeleteButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" disabled={disabled} className="ml-auto min-h-9 text-xs text-muted underline hover:text-urgent" onClick={onClick}>
      delete
    </button>
  );
}

function EditSheet({ view }: { view: HoldingView }) {
  const sheet = useSheet();
  const router = useRouter();
  const { today } = useApp();
  const { card, holding: h } = view;
  return (
    <div data-testid="edit-sheet">
      <SheetHeader title="Edit card" sub={view.name} />
      <p className="-mt-1 mb-3 px-1 font-mono text-[11px] tracking-wider text-muted uppercase">
        {card ? `${card.network} · ${card.account_type}` : "Custom card · not in the catalog"} · opened {shortDate(h.approvalDate, today)}
      </p>
      <div className="rounded-[14px] bg-list p-4">
        <HoldingForm
          initial={view.holding}
          onDone={() => sheet.close()}
          onDeleted={() => {
            sheet.close();
            router.push("/");
          }}
        />
      </div>
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
      className="grid grid-cols-2 gap-3 rounded-[14px] bg-list p-4"
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
      <div className="col-span-2">
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
      className="grid grid-cols-2 gap-3 rounded-[14px] bg-list p-4"
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
      <div className="col-span-2">
        <Field label="Details">
          <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="optional" />
        </Field>
      </div>
      <div className="col-span-2">
        <Button type="submit" size="sm">
          Add event
        </Button>
      </div>
    </form>
  );
}
