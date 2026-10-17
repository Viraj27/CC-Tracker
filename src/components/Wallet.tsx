"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AttentionItem } from "@/lib/domain/attention";
import { cardChip, walletOrder } from "@/lib/domain/wallet";
import { useApp } from "./AppState";
import { CardPage } from "./CardPage";
import { useHoldingViews, useUpNext, type HoldingView } from "./derived";
import { UpNextStrip, UpNextTop } from "./UpNext";
import { WalletCard } from "./WalletCard";
import { Group, GroupLabel, PageTitle, PillLink, Row } from "./ui";

/** How the selection is written to the URL: `/?card=<id>` or `/cards/<id>`. */
export type WalletUrl = "query" | "path";

const hrefFor = (mode: WalletUrl, id: string) => (mode === "path" ? `/cards/${encodeURIComponent(id)}` : `/?card=${encodeURIComponent(id)}`);

function idFromLocation(): string | null {
  const m = /^\/cards\/([^/]+)$/.exec(window.location.pathname);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(window.location.search).get("card");
}

/**
 * Home. Phone (< 1024px): large title, the top 3 Up next
 * rows and the card stack; tapping a card pushes its Card page (`/cards/<id>`).
 * Desktop: the Up next strip, the stack on the left and the selected card's
 * page on the right; selection lives in the URL (pushState, no server round
 * trip) so deep links and Back work. `/cards/<id>` renders this same component
 * as the Card page on phones.
 */
export function Wallet({ selectedId, logBenefitId = null, url }: { selectedId: string | null; logBenefitId?: string | null; url: WalletUrl }) {
  const { data } = useApp();
  const router = useRouter();
  const views = useHoldingViews();
  const { visible: attention, hidden } = useUpNext();
  const ordered = useMemo(() => walletOrder(views, attention), [views, attention]);
  const cardScreen = url === "path";

  const [selected, setSelected] = useState(selectedId);
  useEffect(() => setSelected(selectedId), [selectedId]);
  useEffect(() => {
    const onPop = () => setSelected(idFromLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const current = ordered.find((v) => v.holding.id === selected) ?? ordered[0] ?? null;

  const select = useCallback(
    (id: string) => {
      // Phones push the Card page; desktop selects in place.
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        router.push(`/cards/${encodeURIComponent(id)}`);
        return;
      }
      if (id === current?.holding.id) return;
      setSelected(id);
      window.history.pushState(null, "", hrefFor(url, id));
    },
    [current, url, router],
  );

  if (data.holdings.length === 0) return <GetStarted />;
  if (cardScreen && selectedId && !views.some((v) => v.holding.id === selectedId)) {
    return (
      <div className="flex flex-col items-start gap-4 py-8">
        <PageTitle>Card not found</PageTitle>
        <PillLink href="/">Back to the wallet</PillLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 lg:gap-6">
      {!cardScreen && (
        <div className="lg:hidden">
          {/* No 5/24 count here: it means nothing at a glance (docs/SPEC-v7-phone-feedback.md §3). */}
          <PageTitle>Wallet</PageTitle>
          <UpNextTop items={attention} count={attention.length} />
        </div>
      )}
      <div className="hidden lg:block">
        <UpNextStrip items={attention} hidden={hidden} />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-12">
        <div className={`lg:sticky lg:top-24 lg:self-start ${cardScreen ? "hidden lg:block" : ""}`}>
          <Stack ordered={ordered} selectedId={current!.holding.id} attention={attention} onSelect={select} />
        </div>
        <div className={cardScreen ? "" : "hidden lg:block"}>
          <CardPage key={current!.holding.id} view={current!} attention={attention} logBenefitId={current!.holding.id === selectedId ? logBenefitId : null} />
        </div>
      </div>
    </div>
  );
}


/**
 * Apple Wallet-style stack. Phone: ~58px strips (name + state chip) with the
 * last card in full. Desktop: the selected card in full first, the rest as
 * strips. Real buttons; arrow keys move the selection (desktop) or focus
 * (phone); aria-pressed marks the selected card.
 */
function Stack({
  ordered,
  selectedId,
  attention,
  onSelect,
}: {
  ordered: HoldingView[];
  selectedId: string;
  attention: AttentionItem[];
  onSelect: (id: string) => void;
}) {
  const display = useMemo(() => {
    const sel = ordered.find((v) => v.holding.id === selectedId);
    return sel ? [sel, ...ordered.filter((v) => v !== sel)] : ordered;
  }, [ordered, selectedId]);

  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const items = useRef(new Map<string, HTMLLIElement>());
  const lastTops = useRef(new Map<string, number>());
  const focusSelected = useRef(false);

  // FLIP: slide each card from where it was to its new place in the stack.
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tops = new Map<string, number>();
    for (const [id, el] of items.current) {
      const top = el.getBoundingClientRect().top;
      tops.set(id, top);
      const before = lastTops.current.get(id);
      if (reduce || before === undefined || before === top) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${before - top}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        el.style.transform = "";
      });
    }
    lastTops.current = tops;
    if (focusSelected.current) {
      focusSelected.current = false;
      buttons.current.get(selectedId)?.focus({ preventScroll: true });
    }
  }, [display, selectedId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    const focused = display.findIndex((v) => buttons.current.get(v.holding.id) === document.activeElement);
    if (!desktop) {
      // Phones: arrows move focus; Enter opens the card.
      const n =
        e.key === "ArrowDown" || e.key === "ArrowRight" ? focused + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? focused - 1 : null;
      if (n === null || n < 0 || n >= display.length) return;
      e.preventDefault();
      buttons.current.get(display[n].holding.id)?.focus();
      return;
    }
    const i = ordered.findIndex((v) => v.holding.id === selectedId);
    const next =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? Math.min(ordered.length - 1, i + 1)
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? Math.max(0, i - 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? ordered.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    focusSelected.current = true;
    onSelect(ordered[next].holding.id);
  };

  return (
    <div>
      <div className="lg:sr-only">
        <GroupLabel>Cards · {display.length}</GroupLabel>
      </div>
      <p className="sr-only" id="stack-help">
        Use the arrow keys to move between cards.
      </p>
      <ul aria-label="Card stack" aria-describedby="stack-help" data-testid="wallet-stack" onKeyDown={onKeyDown} className="relative pb-2">
        {display.map((v, i) => {
          const selected = i === 0;
          const last = i === display.length - 1;
          const chip = cardChip(v.holding, attention);
          // Phone: every card but the last is a strip. Desktop: every card but the selected one.
          const height = `${last ? "" : "h-[74px]"} ${selected ? "lg:h-auto" : "lg:h-[78px]"}`;
          const round = `${last ? "rounded-2xl" : "rounded-t-2xl"} ${selected || last ? "lg:rounded-2xl" : "lg:rounded-t-2xl lg:rounded-b-none"}`;
          return (
            <li
              key={v.holding.id}
              ref={(el) => {
                if (el) items.current.set(v.holding.id, el);
                else items.current.delete(v.holding.id);
              }}
              className={`relative ${i === 0 ? "" : i === 1 ? "-mt-4 lg:mt-3.5" : "-mt-4"}`}
              style={{ zIndex: i }}
            >
              <button
                type="button"
                ref={(el) => {
                  if (el) buttons.current.set(v.holding.id, el);
                  else buttons.current.delete(v.holding.id);
                }}
                aria-pressed={selected}
                aria-label={`${v.name}${chip ? `, ${chip.toLowerCase()}` : ""}`}
                data-testid={`wallet-card-${v.holding.id}`}
                onClick={() => onSelect(v.holding.id)}
                className={`block w-full overflow-hidden text-left transition-[filter] hover:brightness-110 ${height} ${round}`}
                style={{ boxShadow: i > 0 ? "0 -1px 3px rgb(0 0 0 / 0.12)" : undefined }}
              >
                <WalletCard view={v} chip={chip} selected={selected} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GetStarted() {
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <PageTitle>Your wallet is empty</PageTitle>
      <Group>
        <Row title="Import your seed file" sub="seed/my-cards.json, or the demo file" chevron href="/settings#import" ariaLabel="Import" />
        <Row title="Add a card by hand" sub="From the catalog or a custom card" chevron href="/cards" ariaLabel="Add card" />
      </Group>
    </div>
  );
}
