"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AttentionItem } from "@/lib/domain/attention";
import { shortDate } from "@/lib/domain/dates";
import type { HiddenItem } from "@/lib/domain/skips";
import { skipThisLabel, targetOf } from "./CardSheets";
import { useApp } from "./AppState";
import { useHoldingViews } from "./derived";
import { useAddEnrollment, useSetActivated, useSetMutes, useSetPaid, useSetSkipped } from "./mutations";
import { useSheet } from "./Sheet";
import { Button, CardBar, CardSwatch, Empty, Group, GroupLabel, Row, usd } from "./ui";

export const daysLabel = (d: number) => (d < 0 ? `${-d}D LATE` : d === 0 ? "TODAY" : `IN ${d}D`);

const money = (n: number) => usd(n, Number.isInteger(n) ? 0 : 2);

/** Right-hand figures of an item row: amount over date (days late/left when there is no amount). */
function figures(a: AttentionItem, today: string) {
  return { amount: a.amount !== null ? money(a.amount) : daysLabel(a.daysUntil), date: shortDate(a.date, today), urgent: a.severity === "critical" };
}

/** The item's primary action: short visible label, the v4.1 accessible name, and what it does. */
function usePrimary(item: AttentionItem): { short: string; long: string; run: () => void } {
  const setPaid = useSetPaid();
  const setActivated = useSetActivated();
  const addEnrollment = useAddEnrollment();
  const sheet = useSheet();
  switch (item.kind) {
    case "payment":
      return { short: "Paid", long: "Mark paid", run: () => setPaid(item.holdingId, item.month!, item.date, true) };
    case "rotating":
      return { short: "Activate", long: "Activate", run: () => setActivated(item.holdingId, item.quarter!, true) };
    case "enroll":
      return { short: "Enrolled", long: "Mark enrolled", run: () => addEnrollment(item.holdingId, item.benefitId!) };
    case "credit":
      // Logging needs an amount: open the credit sheet (chips, remaining pre-selected).
      return { short: "Log", long: "Log", run: () => sheet.open({ type: "item", item }) };
    case "af":
      return { short: "Options", long: "Options", run: () => sheet.open({ type: "list", holdingId: item.holdingId, list: "downgrade" }) };
    default:
      return { short: "Review", long: "Review", run: () => sheet.open({ type: "item", item }) };
  }
}

/** The one action for an item, as a pill (the Wallet's desktop strip). */
export function AttentionAction({ item }: { item: AttentionItem }) {
  const p = usePrimary(item);
  return (
    <Button size="sm" variant={item.kind === "af" || item.kind === "unverified" ? "secondary" : "primary"} aria-label={`${p.long} — ${targetOf(item)}`} onClick={p.run}>
      {p.long}
    </Button>
  );
}

/** Skip's choice for recurring reminders (v4.1): skip this period, stop reminding me, or cancel. Focus starts on the first choice; Escape cancels. */
function SkipChoice({ item, onCancel, className = "" }: { item: AttentionItem; onCancel: () => void; className?: string }) {
  const setSkipped = useSetSkipped();
  const setMutes = useSetMutes();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const target = targetOf(item);
  const mute = item.mute!;
  return (
    <div
      role="group"
      aria-label={`Skip — ${target}`}
      className={`flex flex-wrap items-center justify-end gap-1 ${className}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <Button ref={first} size="sm" className="min-h-10" aria-label={`${skipThisLabel(item)} — ${target}`} onClick={() => setSkipped(item.occurrence, true)}>
        {skipThisLabel(item)}
      </Button>
      <Button size="sm" className="min-h-10" aria-label={`Stop reminding me — ${target}`} onClick={() => setMutes(item.holdingId, [{ kind: mute.kind, benefitId: mute.benefitId, muted: true }])}>
        Stop reminding me
      </Button>
      <Button size="sm" variant="ghost" className="min-h-10" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * The item's primary action plus a quiet "Skip". For recurring reminders that
 * can be muted (rotating activation, credits) Skip offers a choice in place:
 * skip this period, or stop reminding me. Payments and fees only skip.
 */
export function AttentionActions({ item }: { item: AttentionItem }) {
  const setSkipped = useSetSkipped();
  const [choosing, setChoosing] = useState(false);
  const skipBtn = useRef<HTMLButtonElement>(null);
  const reopen = useRef(false);
  useEffect(() => {
    if (!choosing && reopen.current) skipBtn.current?.focus();
    reopen.current = false;
  }, [choosing]);

  if (choosing && item.mute) {
    return (
      <SkipChoice
        item={item}
        onCancel={() => {
          reopen.current = true;
          setChoosing(false);
        }}
      />
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Button
        ref={skipBtn}
        size="sm"
        variant="ghost"
        className="min-h-10"
        aria-label={`Skip — ${targetOf(item)}`}
        onClick={() => (item.mute ? setChoosing(true) : setSkipped(item.occurrence, true))}
      >
        Skip
      </Button>
      <AttentionAction item={item} />
    </div>
  );
}

/** "Unskip" / "Turn reminders back on" for a hidden item. */
function RestoreAction({ h }: { h: HiddenItem }) {
  const setSkipped = useSetSkipped();
  const setMutes = useSetMutes();
  const target = targetOf(h.item);
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
export function ShowSkipped({ count, shown, onToggle, controls }: { count: number; shown: boolean; onToggle: () => void; controls: string }) {
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

/** Phone Wallet: the top 3 Up next items as one-line rows (tap → the item's sheet). */
export function UpNextTop({ items, count }: { items: AttentionItem[]; count: number }) {
  const { today } = useApp();
  const sheet = useSheet();
  return (
    <section aria-labelledby="up-next-top-heading" data-testid="up-next-top">
      <GroupLabel
        id="up-next-top-heading"
        right={
          <Link href="/up-next" className="font-mono text-[11px] font-bold tracking-wider text-muted uppercase hover:text-text">
            All {count} →
          </Link>
        }
      >
        Up next
      </GroupLabel>
      {items.length === 0 ? (
        <Group>
          <li className="px-4 py-3">
            <Empty>Nothing needs attention right now.</Empty>
          </li>
        </Group>
      ) : (
        <Group aria-label="Up next">
          {items.slice(0, 3).map((a) => (
            <Row
              key={a.id}
              testId="up-next-item"
              title={a.short}
              sub={a.cardName}
              {...figures(a, today)}
              ariaLabel={targetOf(a)}
              onClick={() => sheet.open({ type: "item", item: a })}
            />
          ))}
        </Group>
      )}
    </section>
  );
}

/** The Wallet's slim, horizontally scrollable row of Up next items (desktop), with short titles. */
export function UpNextStrip({ items, hidden = [] }: { items: AttentionItem[]; hidden?: HiddenItem[] }) {
  const { today } = useApp();
  const color = useColors();
  const sheet = useSheet();
  const [shown, setShown] = useState(false);
  return (
    <section aria-labelledby="up-next-heading" className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="up-next-heading" className="font-mono text-[11px] font-bold tracking-wider text-muted uppercase">
          Up next · {items.length}
        </h2>
        <Link href="/up-next" className="font-mono text-[11px] font-bold tracking-wider text-muted uppercase hover:text-text">
          All {items.length} →
        </Link>
      </div>
      {items.length === 0 && hidden.length === 0 ? (
        <Empty>Nothing needs attention right now.</Empty>
      ) : (
        <ul data-testid="up-next-strip" aria-label="Up next" className="-mx-6 flex snap-x scroll-px-6 gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:thin]">
          {items.length === 0 && (
            <li className="flex w-[240px] shrink-0 items-center">
              <Empty>Nothing needs attention right now.</Empty>
            </li>
          )}
          {items.map((a) => (
            <li key={a.id} data-testid="up-next-item" className="flex w-[240px] shrink-0 snap-start flex-col justify-between gap-2 rounded-[14px] bg-list p-3">
              <button type="button" className="min-w-0 text-left" aria-label={targetOf(a)} onClick={() => sheet.open({ type: "item", item: a })}>
                <span className="flex items-baseline justify-between gap-2 font-mono text-[11px] tracking-wider uppercase">
                  <span className={a.severity === "critical" ? "font-bold text-urgent" : "font-bold"}>{shortDate(a.date, today)}</span>
                  <span className={a.severity === "critical" ? "text-urgent" : "text-muted"}>{daysLabel(a.daysUntil)}</span>
                </span>
                <span className="mt-1 block truncate leading-snug font-semibold hover:underline">{a.short}</span>
                <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
                  <CardSwatch color={color(a.holdingId)} />
                  <span className="truncate">{a.cardName}</span>
                </span>
              </button>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-bold">{a.amount !== null ? money(a.amount) : ""}</span>
                <AttentionActions item={a} />
              </div>
            </li>
          ))}
          {hidden.length > 0 && (
            <li className="flex shrink-0 snap-start items-center px-1">
              <ShowSkipped count={hidden.length} shown={shown} onToggle={() => setShown((x) => !x)} controls="up-next-strip" />
            </li>
          )}
          {shown &&
            hidden.map((h) => (
              <li
                key={h.item.id}
                data-testid="skipped-item"
                className="flex w-[240px] shrink-0 snap-start flex-col justify-between gap-2 rounded-[14px] border border-dashed border-hairline p-3 text-muted"
              >
                <div className="min-w-0">
                  <p className="flex items-baseline justify-between gap-2 font-mono text-[11px] tracking-wider uppercase">
                    <span className="font-bold">{shortDate(h.item.date, today)}</span>
                    <span>{hiddenLabel(h)}</span>
                  </p>
                  <p className="mt-1 truncate leading-snug font-semibold">{h.item.short}</p>
                  <p className="flex min-w-0 items-center gap-2 text-sm">
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

/** Up next screen: NEXT 14 DAYS and LATER groups of swipeable rows, then the revealed skipped list. */
export function UpNextList({ items, hidden = [], shown }: { items: AttentionItem[]; hidden?: HiddenItem[]; shown: boolean }) {
  const color = useColors();
  const [openId, setOpenId] = useState<string | null>(null);
  // An open row that was skipped or acted on is gone: nothing is open (also if it comes back).
  const gone = openId !== null && !items.some((a) => a.id === openId);
  useEffect(() => {
    if (gone) setOpenId(null);
  }, [gone]);
  const soon = items.filter((a) => a.daysUntil <= 14);
  const later = items.filter((a) => a.daysUntil > 14);
  const group = (label: string, list: AttentionItem[]) =>
    list.length > 0 && (
      <section aria-label={label}>
        <GroupLabel>{label}</GroupLabel>
        <Group>
          {list.map((a) => (
            <SwipeRow key={a.id} item={a} color={color(a.holdingId)} open={openId === a.id} anyOpen={openId !== null} onOpenChange={setOpenId} />
          ))}
        </Group>
      </section>
    );
  return (
    <div className="flex flex-col">
      <div data-testid="attention-list">
        {items.length === 0 ? (
          <Group>
            <li className="px-4 py-3">
              <Empty>Nothing needs attention right now.</Empty>
            </li>
          </Group>
        ) : (
          <>
            {group("Next 14 days", soon)}
            {group("Later", later)}
          </>
        )}
      </div>
      {shown && hidden.length > 0 && (
        <section aria-label="Skipped">
          <GroupLabel>Skipped</GroupLabel>
          <ul id="skipped-list" aria-label="Skipped" className="divide-y divide-dashed divide-hairline rounded-[14px] border border-dashed border-hairline text-muted">
            {hidden.map((h) => (
              <li key={h.item.id} data-testid="skipped-item" className="flex min-h-14 items-center gap-3 px-4 py-2">
                <CardBar color={color(h.item.holdingId)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.item.short}</span>
                  <span className="block truncate text-sm">
                    {h.item.cardName} · <span className="font-mono text-[11px] tracking-wider uppercase">{hiddenLabel(h)}</span>
                  </span>
                </span>
                <RestoreAction h={h} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const ACTIONS_W = 152; // two 76px actions revealed by a swipe
const SLOP = 8; // px before a drag counts as a swipe (or a scroll)

/**
 * A one-line Up next row. Swipe left (touch or mouse drag) reveals Skip and the
 * primary action; it snaps open or closed and only one row is open at a time.
 * Tapping the row opens its sheet (same actions). Keyboard: focusing the row
 * reveals the actions, which follow it in the tab order. Desktop: hover reveals them.
 */
function SwipeRow({
  item,
  color,
  open,
  anyOpen,
  onOpenChange,
}: {
  item: AttentionItem;
  color: string;
  open: boolean;
  anyOpen: boolean;
  onOpenChange: (id: string | null) => void;
}) {
  const { today } = useApp();
  const sheet = useSheet();
  const setSkipped = useSetSkipped();
  const primary = usePrimary(item);
  const [dx, setDx] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  const gesture = useRef<{ id: number; x: number; y: number; base: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const skipBtn = useRef<HTMLButtonElement>(null);
  const offset = dx ?? (open ? -ACTIONS_W : 0);
  const target = targetOf(item);
  const f = figures(item, today);

  const end = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.active) return;
    onOpenChange(offset < -ACTIONS_W / 2 ? item.id : null);
    setDx(null);
    // A mouse drag ends with a click on the row; don't treat it as a tap.
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
  };

  return (
    <li
      data-testid="up-next-item"
      data-open={open || undefined}
      className="group relative overflow-hidden"
      onBlur={(e) => {
        if (open && !choosing && !e.currentTarget.contains(e.relatedTarget as Node | null)) onOpenChange(null);
      }}
    >
      <button
        type="button"
        aria-label={target}
        data-testid="up-next-row"
        className={`relative z-[1] flex min-h-14 w-full touch-pan-y items-center gap-3 bg-list px-4 py-2.5 text-left select-none ${
          offset === 0 ? "lg:group-hover:-translate-x-[152px] group-has-[:focus-visible]:-translate-x-[152px]" : ""
        }`}
        style={{
          transform: offset ? `translateX(${offset}px)` : undefined,
          transition: dx !== null ? "none" : "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), translate 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, base: open ? -ACTIONS_W : 0, active: false };
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId) return;
          const mx = e.clientX - g.x;
          const my = e.clientY - g.y;
          if (!g.active) {
            if (Math.abs(my) > SLOP && Math.abs(my) >= Math.abs(mx)) {
              gesture.current = null; // a vertical scroll
              return;
            }
            if (Math.abs(mx) <= SLOP) return;
            g.active = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            if (!open) onOpenChange(null); // close any other open row
          }
          setDx(Math.max(-ACTIONS_W - 24, Math.min(0, g.base + mx)));
        }}
        onPointerUp={end}
        onPointerCancel={(e) => {
          if (gesture.current?.id === e.pointerId) {
            gesture.current = null;
            setDx(null);
          }
        }}
        onClick={() => {
          if (suppressClick.current) return;
          if (anyOpen) return onOpenChange(null);
          sheet.open({ type: "item", item });
        }}
      >
        <CardBar color={color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate leading-snug font-semibold">{item.short}</span>
          <span className="block truncate text-sm text-muted">{item.cardName}</span>
        </span>
        <span className="shrink-0 text-right font-mono leading-tight">
          <span className="block text-[15px] font-bold">{f.amount}</span>
          <span className={`block text-[11px] tracking-wider uppercase ${f.urgent ? "font-bold text-urgent" : "text-muted"}`}>{f.date}</span>
        </span>
      </button>
      {/*
        After the row in the DOM so Tab goes row → Skip → action. Transparent (not
        visibility:hidden, which would drop it from the tab order mid-Tab) until the
        row is swiped, hovered (desktop) or has keyboard focus.
      */}
      <div
        className={`absolute inset-y-0 right-0 flex ${offset !== 0 ? "" : "opacity-0 group-has-[:focus-visible]:opacity-100 lg:group-hover:opacity-100"}`}
        style={{ width: ACTIONS_W }}
      >
        <button
          ref={skipBtn}
          type="button"
          aria-label={`Skip — ${target}`}
          onFocus={() => onOpenChange(item.id)}
          onClick={() => (item.mute ? setChoosing(true) : setSkipped(item.occurrence, true))}
          className="flex-1 bg-skip text-[15px] font-semibold text-skip-text"
        >
          Skip
        </button>
        <button
          type="button"
          aria-label={`${primary.long} — ${target}`}
          onFocus={() => onOpenChange(item.id)}
          onClick={() => {
            onOpenChange(null);
            primary.run();
          }}
          className="flex-1 bg-btn text-[15px] font-semibold text-btn-text"
        >
          {primary.short}
        </button>
      </div>
      {choosing && item.mute && (
        <SkipChoice
          item={item}
          className="absolute inset-0 z-10 bg-list px-2"
          onCancel={() => {
            setChoosing(false);
            skipBtn.current?.focus();
          }}
        />
      )}
    </li>
  );
}
