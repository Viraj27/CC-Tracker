"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AttentionItem, AttentionKind } from "@/lib/domain/attention";
import { shortDate } from "@/lib/domain/dates";
import type { HiddenItem } from "@/lib/domain/skips";
import { useApp } from "./AppState";
import { useHoldingViews } from "./derived";
import { useSetActivated, useSetMutes, useSetPaid, useSetSkipped } from "./mutations";
import { Button, CardSwatch, Empty, Label, PillLink, usd } from "./ui";

export const KIND_LABEL: Record<AttentionKind, string> = {
  af: "Annual fee",
  credit: "Credit",
  payment: "Payment",
  rotating: "Activate",
  unverified: "Verify",
};

export const daysLabel = (d: number) => (d < 0 ? `${-d}D LATE` : d === 0 ? "TODAY" : `IN ${d}D`);

/**
 * The one action for an item: mark paid / activate in place, log a credit
 * (in the Wallet via `onLog`, else by linking there), or open the card.
 */
export function AttentionAction({ item, onLog }: { item: AttentionItem; onLog?: (holdingId: string, benefitId: string) => void }) {
  const setPaid = useSetPaid();
  const setActivated = useSetActivated();
  const target = `${item.cardName}: ${item.label}`;
  switch (item.kind) {
    case "payment":
      return (
        <Button size="sm" variant="primary" aria-label={`Mark paid — ${target}`} onClick={() => setPaid(item.holdingId, item.month!, item.date, true)}>
          Mark paid
        </Button>
      );
    case "rotating":
      return (
        <Button size="sm" variant="primary" aria-label={`Activate — ${target}`} onClick={() => setActivated(item.holdingId, item.quarter!, true)}>
          Activate
        </Button>
      );
    case "credit":
      return onLog ? (
        <Button size="sm" variant="primary" aria-label={`Log — ${target}`} onClick={() => onLog(item.holdingId, item.benefitId!)}>
          Log
        </Button>
      ) : (
        <PillLink
          size="sm"
          variant="primary"
          aria-label={`Log — ${target}`}
          href={`/?card=${encodeURIComponent(item.holdingId)}&log=${encodeURIComponent(item.benefitId!)}#benefit-${item.benefitId}`}
        >
          Log
        </PillLink>
      );
    case "af":
      return (
        <PillLink size="sm" href={item.href} aria-label={`Options — ${target}`}>
          Options
        </PillLink>
      );
    default:
      return (
        <PillLink size="sm" href={item.href} aria-label={`Review — ${target}`}>
          Review
        </PillLink>
      );
  }
}

/** "Skip this quarter" etc.; "Skip this one" when the occurrence is a single date. */
const skipThisLabel = (a: AttentionItem) => (a.periodNoun ? `Skip this ${a.periodNoun}` : "Skip this one");

/**
 * The item's primary action plus a quiet "Skip". For recurring reminders that
 * can be muted (rotating activation, credits) Skip offers a choice in place:
 * skip this period, or stop reminding me. Payments and fees only skip.
 */
export function AttentionActions({ item, onLog }: { item: AttentionItem; onLog?: (holdingId: string, benefitId: string) => void }) {
  const setSkipped = useSetSkipped();
  const setMutes = useSetMutes();
  const [choosing, setChoosing] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  const skipBtn = useRef<HTMLButtonElement>(null);
  const reopen = useRef(false);
  useEffect(() => {
    if (choosing) first.current?.focus();
    else if (reopen.current) skipBtn.current?.focus();
    reopen.current = false;
  }, [choosing]);
  const target = `${item.cardName}: ${item.label}`;
  const skip = () => setSkipped(item.occurrence, true);

  if (choosing && item.mute) {
    const mute = item.mute;
    return (
      <div
        role="group"
        aria-label={`Skip — ${target}`}
        className="flex flex-wrap items-center justify-end gap-1"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            reopen.current = true;
            setChoosing(false);
          }
        }}
      >
        <Button ref={first} size="sm" className="min-h-10" aria-label={`${skipThisLabel(item)} — ${target}`} onClick={skip}>
          {skipThisLabel(item)}
        </Button>
        <Button
          size="sm"
          className="min-h-10"
          aria-label={`Stop reminding me — ${target}`}
          onClick={() => setMutes(item.holdingId, [{ kind: mute.kind, benefitId: mute.benefitId, muted: true }])}
        >
          Stop reminding me
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-10"
          onClick={() => {
            reopen.current = true;
            setChoosing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Button
        ref={skipBtn}
        size="sm"
        variant="ghost"
        className="min-h-10"
        aria-label={`Skip — ${target}`}
        onClick={() => (item.mute ? setChoosing(true) : skip())}
      >
        Skip
      </Button>
      <AttentionAction item={item} onLog={onLog} />
    </div>
  );
}

/** "Unskip" / "Turn reminders back on" for a hidden item. */
function RestoreAction({ h }: { h: HiddenItem }) {
  const setSkipped = useSetSkipped();
  const setMutes = useSetMutes();
  const target = `${h.item.cardName}: ${h.item.label}`;
  const r = h.reason;
  return r.type === "skip" ? (
    <Button size="sm" className="min-h-10" aria-label={`Unskip — ${target}`} onClick={() => setSkipped(r.occurrence, false)}>
      Unskip
    </Button>
  ) : (
    <Button
      size="sm"
      className="min-h-10"
      aria-label={`Turn reminders back on — ${target}`}
      onClick={() => setMutes(r.holdingId, [{ kind: r.kind, benefitId: r.benefitId, muted: false }])}
    >
      Turn reminders back on
    </Button>
  );
}

const hiddenLabel = (h: HiddenItem) => (h.reason.type === "skip" ? "Skipped" : "Reminders off");

/** The small mono "N SKIPPED · SHOW" toggle. */
function ShowSkipped({ count, shown, onToggle, controls }: { count: number; shown: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      data-testid="show-skipped"
      aria-expanded={shown}
      aria-controls={controls}
      onClick={onToggle}
      className="min-h-10 font-mono text-xs tracking-wider whitespace-nowrap text-muted uppercase underline-offset-4 hover:text-text hover:underline"
    >
      {count} skipped · {shown ? "hide" : "show"}
    </button>
  );
}

function useColors() {
  const views = useHoldingViews();
  return (holdingId: string) => views.find((v) => v.holding.id === holdingId)?.color ?? "var(--muted)";
}

/** The Wallet's slim, horizontally scrollable row of Needs-attention items. */
export function UpNextStrip({
  items,
  hidden = [],
  onLog,
}: {
  items: AttentionItem[];
  /** Skipped / muted items, revealed (greyed) by "N skipped · show" at the end of the strip. */
  hidden?: HiddenItem[];
  onLog?: (holdingId: string, benefitId: string) => void;
}) {
  const { today } = useApp();
  const color = useColors();
  const [shown, setShown] = useState(false);
  return (
    <section aria-labelledby="up-next-heading" className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="up-next-heading" className="font-mono text-xs font-bold tracking-wider text-muted uppercase">
          Up next · {items.length}
        </h2>
        <Link href="/up-next" className="font-mono text-xs tracking-wider text-muted uppercase hover:text-text">
          See all →
        </Link>
      </div>
      {items.length === 0 && hidden.length === 0 ? (
        <Empty>Nothing needs attention right now.</Empty>
      ) : (
        <ul
          data-testid="up-next-strip"
          aria-label="Up next"
          className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:scroll-px-6 sm:px-6"
        >
          {items.length === 0 && (
            <li className="flex w-[264px] shrink-0 items-center">
              <Empty>Nothing needs attention right now.</Empty>
            </li>
          )}
          {items.map((a) => (
            <li
              key={a.id}
              data-testid="up-next-item"
              className="flex w-[264px] shrink-0 snap-start flex-col justify-between gap-3 border-l border-hairline py-1 pr-1 pl-3 first:border-l-0 first:pl-0"
            >
              <div className="min-w-0">
                <p className="flex items-baseline justify-between gap-2 font-mono text-[11px] tracking-wider uppercase">
                  <span className={a.severity === "critical" ? "font-bold text-urgent" : "font-bold"}>{shortDate(a.date, today)}</span>
                  <span className={a.severity === "critical" ? "text-urgent" : "text-muted"}>{daysLabel(a.daysUntil)}</span>
                </p>
                <Link href={a.href} className="mt-1 line-clamp-2 leading-snug font-semibold hover:underline">
                  {a.label}
                </Link>
                <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted">
                  <CardSwatch color={color(a.holdingId)} />
                  <span className="truncate">{a.cardName}</span>
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-bold">{a.amount !== null ? usd(a.amount, Number.isInteger(a.amount) ? 0 : 2) : ""}</span>
                <AttentionActions item={a} onLog={onLog} />
              </div>
            </li>
          ))}
          {hidden.length > 0 && (
            <li className="flex shrink-0 snap-start items-center border-l border-hairline pl-3">
              <ShowSkipped count={hidden.length} shown={shown} onToggle={() => setShown((x) => !x)} controls="up-next-strip" />
            </li>
          )}
          {shown &&
            hidden.map((h) => (
              <li
                key={h.item.id}
                data-testid="skipped-item"
                className="flex w-[264px] shrink-0 snap-start flex-col justify-between gap-3 border-l border-dashed border-hairline py-1 pr-1 pl-3 text-muted"
              >
                <div className="min-w-0">
                  <p className="flex items-baseline justify-between gap-2 font-mono text-[11px] tracking-wider uppercase">
                    <span className="font-bold">{shortDate(h.item.date, today)}</span>
                    <span>{hiddenLabel(h)}</span>
                  </p>
                  <p className="mt-1 line-clamp-2 leading-snug font-semibold">{h.item.label}</p>
                  <p className="mt-1 flex min-w-0 items-center gap-2 text-sm">
                    <CardSwatch color={color(h.item.holdingId)} />
                    <span className="truncate">{h.item.cardName}</span>
                  </p>
                </div>
                <div className="flex justify-end">
                  <RestoreAction h={h} />
                </div>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

/** The full Needs-attention list (Up next screen). */
export function UpNextList({ items, hidden = [] }: { items: AttentionItem[]; hidden?: HiddenItem[] }) {
  const { today } = useApp();
  const color = useColors();
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? <Empty>Nothing needs attention right now.</Empty> : <ItemList items={items} today={today} color={color} />}
      {hidden.length > 0 && (
        <div>
          <ShowSkipped count={hidden.length} shown={shown} onToggle={() => setShown((x) => !x)} controls="skipped-list" />
          {shown && (
            <ul id="skipped-list" aria-label="Skipped" className="mt-2 divide-y divide-hairline border-y border-dashed border-hairline text-muted">
              {hidden.map((h) => (
                <li
                  key={h.item.id}
                  data-testid="skipped-item"
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 py-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center"
                >
                  <p className="font-mono text-xs leading-5 font-bold tracking-wider uppercase">{shortDate(h.item.date, today)}</p>
                  <div className="min-w-0">
                    <Label>
                      {KIND_LABEL[h.item.kind]} · {hiddenLabel(h)}
                    </Label>
                    <p className="font-semibold">{h.item.title}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm">
                      <CardSwatch color={color(h.item.holdingId)} />
                      <span className="truncate">{h.item.cardName}</span>
                    </p>
                  </div>
                  <div className="col-start-2 sm:col-start-3">
                    <RestoreAction h={h} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ItemList({ items, today, color }: { items: AttentionItem[]; today: string; color: (holdingId: string) => string }) {
  return (
    <ul className="divide-y divide-hairline border-y border-hairline" data-testid="attention-list">
      {items.map((a) => (
        <li key={a.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 py-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center">
          <div className="font-mono text-xs leading-5 tracking-wider uppercase">
            <p className={`font-bold ${a.severity === "critical" ? "text-urgent" : ""}`}>{shortDate(a.date, today)}</p>
            <p className={a.severity === "critical" ? "text-urgent" : "text-muted"}>{daysLabel(a.daysUntil)}</p>
          </div>
          <div className="min-w-0">
            <Label>{KIND_LABEL[a.kind]}</Label>
            <Link href={a.href} className={`block font-semibold hover:underline ${a.severity === "critical" ? "text-urgent" : ""}`}>
              {a.title}
            </Link>
            <p className="text-sm text-muted">{a.detail}</p>
            <p className="mt-1 flex items-center gap-2 text-sm">
              <CardSwatch color={color(a.holdingId)} />
              <span className="truncate">{a.cardName}</span>
              {a.amount !== null && <span className="font-mono font-bold">{usd(a.amount, Number.isInteger(a.amount) ? 0 : 2)}</span>}
            </p>
          </div>
          <div className="col-start-2 sm:col-start-3">
            <AttentionActions item={a} />
          </div>
        </li>
      ))}
    </ul>
  );
}
