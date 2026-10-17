"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AttentionItem } from "@/lib/domain/attention";

/** Drill-in lists on the Card page (docs/SPEC-v5-app-pass.md §3.2). */
export type ListKind = "perks" | "other" | "protections" | "earn" | "downgrade" | "fees" | "lifecycle";

/** What a sheet shows. Ids only (plus an item snapshot), so content stays live as data changes. */
export type SheetRoute =
  | { type: "item"; item: AttentionItem }
  | { type: "benefit"; holdingId: string; benefitId: string }
  | { type: "roi"; holdingId: string }
  | { type: "rotating"; holdingId: string }
  | { type: "list"; holdingId: string; list: ListKind }
  | { type: "edit"; holdingId: string };

interface SheetApi {
  stack: SheetRoute[];
  /** Open a sheet (replacing any open one). */
  open: (r: SheetRoute) => void;
  /** Drill in from the current sheet; it gets a "‹ Back". */
  push: (r: SheetRoute) => void;
  back: () => void;
  close: () => void;
}

const Ctx = createContext<SheetApi | null>(null);

/** One sheet at a time (with a drill-in stack), rendered by `SheetHost`. */
export function SheetProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<SheetRoute[]>([]);
  const close = useCallback(() => {
    setStack([]);
    // A deep link like /cards/x#downgrade opened this sheet; don't reopen it on reload.
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }, []);
  const api = useMemo<SheetApi>(
    () => ({
      stack,
      open: (r) => setStack([r]),
      push: (r) => setStack((s) => [...s, r]),
      back: () => setStack((s) => s.slice(0, -1)),
      close,
    }),
    [stack, close],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSheet(): SheetApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSheet outside SheetProvider");
  return v;
}

const TitleCtx = createContext<{ titleId: string; onClose: () => void; onBack: (() => void) | null; backLabel: string | null } | null>(null);

/**
 * Bottom sheet (phone) / right-side panel (desktop ≥ 1024px) as a native modal
 * <dialog>: the page behind is inert (focus stays inside), Esc closes. Also
 * closes on a backdrop tap or a drag down; focus returns to the opener.
 */
export function Sheet({
  onClose,
  onBack = null,
  backLabel = null,
  routeKey,
  children,
}: {
  onClose: () => void;
  onBack?: (() => void) | null;
  backLabel?: string | null;
  /** Changes when the content changes (drill in / back), to move focus to the new header. */
  routeKey: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ id: number; y: number; t: number } | null>(null);

  useLayoutEffect(() => {
    const d = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = overflow;
      // Close first: while the modal is open the page is inert and can't take focus.
      if (d.open) d.close();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // After a drill-in or Back, start from the new sheet's header.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.querySelector<HTMLElement>("[data-sheet-focus]")?.focus();
  }, [routeKey]);

  const end = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    drag.current = null;
    const dy = e.clientY - g.y;
    const fast = dy / Math.max(1, e.timeStamp - g.t) > 0.6;
    if (dy > 110 || (dy > 30 && fast)) onClose();
    else setDragY(0);
  };

  return createPortal(
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      data-testid="sheet"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the dialog box itself (not its content) is the backdrop.
        if (e.target === ref.current) onClose();
      }}
      style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : { transition: "transform 200ms ease-out" }}
    >
      <div className="flex max-h-[inherit] flex-col lg:h-full">
        <div
          className="shrink-0 cursor-grab touch-none pt-2 select-none lg:cursor-auto lg:pt-3"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button,a")) return;
            drag.current = { id: e.pointerId, y: e.clientY, t: e.timeStamp };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const g = drag.current;
            if (g && g.id === e.pointerId) setDragY(Math.max(0, e.clientY - g.y));
          }}
          onPointerUp={end}
          onPointerCancel={end}
          data-testid="sheet-grabber"
        >
          <span aria-hidden className="mx-auto block h-[5px] w-9 rounded-full bg-muted/50 lg:hidden" />
        </div>
        <TitleCtx.Provider value={{ titleId, onClose, onBack, backLabel }}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">{children}</div>
        </TitleCtx.Provider>
      </div>
    </dialog>,
    document.body,
  );
}

/** Sheet header: Back (in a drill-in), title (22px/700), the card name, an optional ⓘ, and Close. */
export function SheetHeader({ title, sub, info }: { title: React.ReactNode; sub?: React.ReactNode; info?: React.ReactNode }) {
  const ctx = useContext(TitleCtx)!;
  return (
    <header className="pt-1 pb-3">
      <div className="flex min-h-9 items-center justify-between gap-2">
        {ctx.onBack ? (
          <button type="button" data-sheet-focus onClick={ctx.onBack} className="-ml-1 min-h-9 px-1 text-[15px] font-medium text-text">
            ‹ {ctx.backLabel ?? "Back"}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          aria-label="Close"
          data-sheet-focus={ctx.onBack ? undefined : true}
          onClick={ctx.onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-text/[0.07] text-muted hover:text-text"
        >
          <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <h2 id={ctx.titleId} className="mt-1 text-[22px] leading-tight font-bold tracking-tight">
        {title}
      </h2>
      {(sub || info) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
          {sub && <span>{sub}</span>}
          {info}
        </div>
      )}
    </header>
  );
}

/** The two key figures under a sheet's header (mono 24px). */
export function KeyFigures({ items }: { items: { label: string; value: React.ReactNode; urgent?: boolean; testId?: string }[] }) {
  return (
    <dl className="mb-4 grid grid-cols-2 overflow-hidden rounded-[14px] bg-list">
      {items.map((f, i) => (
        <div key={f.label} className={`min-w-0 px-4 py-3 ${i > 0 ? "border-l border-hairline" : ""}`}>
          <dt className="font-mono text-[11px] tracking-wider text-muted uppercase">{f.label}</dt>
          <dd data-testid={f.testId} className={`truncate font-mono text-2xl leading-tight font-bold ${f.urgent ? "text-urgent" : ""}`}>
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Primary pill (50px) for a sheet's main action. */
export function SheetPrimary({ className = "", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={`flex min-h-[50px] w-full items-center justify-center rounded-full bg-btn px-5 text-[17px] font-semibold text-btn-text transition hover:opacity-90 disabled:opacity-40 ${className}`}
    />
  );
}

/** Secondary text button row under the primary action (Skip this month, Stop reminding me). */
export function SheetSecondary({ className = "", ...props }: React.ComponentProps<"button">) {
  return <button type="button" {...props} className={`min-h-11 px-2 text-[15px] font-medium text-muted hover:text-text ${className}`} />;
}
