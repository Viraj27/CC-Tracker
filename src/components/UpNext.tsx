"use client";

import Link from "next/link";
import type { AttentionItem, AttentionKind } from "@/lib/domain/attention";
import { shortDate } from "@/lib/domain/dates";
import { useApp } from "./AppState";
import { useHoldingViews } from "./derived";
import { useSetActivated, useSetPaid } from "./mutations";
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

function useColors() {
  const views = useHoldingViews();
  return (holdingId: string) => views.find((v) => v.holding.id === holdingId)?.color ?? "var(--muted)";
}

/** The Wallet's slim, horizontally scrollable row of Needs-attention items. */
export function UpNextStrip({ items, onLog }: { items: AttentionItem[]; onLog?: (holdingId: string, benefitId: string) => void }) {
  const { today } = useApp();
  const color = useColors();
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
      {items.length === 0 ? (
        <Empty>Nothing needs attention right now.</Empty>
      ) : (
        <ul
          data-testid="up-next-strip"
          aria-label="Up next"
          className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-6 sm:scroll-px-6 sm:px-6"
        >
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
                <AttentionAction item={a} onLog={onLog} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The full Needs-attention list (Up next screen). */
export function UpNextList({ items }: { items: AttentionItem[] }) {
  const { today } = useApp();
  const color = useColors();
  if (items.length === 0) return <Empty>Nothing needs attention right now.</Empty>;
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
            <AttentionAction item={a} />
          </div>
        </li>
      ))}
    </ul>
  );
}
