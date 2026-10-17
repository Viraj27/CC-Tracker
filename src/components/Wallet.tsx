"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AttentionItem } from "@/lib/domain/attention";
import { cardChip, walletOrder } from "@/lib/domain/wallet";
import { useApp } from "./AppState";
import { CardDetail } from "./CardDetail";
import { useHoldingViews, useUpNext, type HoldingView } from "./derived";
import { UpNextStrip } from "./UpNext";
import { WalletCard } from "./WalletCard";
import { PageTitle, PillLink } from "./ui";

/** How the selection is written to the URL: `/?card=<id>` or `/cards/<id>`. */
export type WalletUrl = "query" | "path";

const hrefFor = (mode: WalletUrl, id: string) => (mode === "path" ? `/cards/${encodeURIComponent(id)}` : `/?card=${encodeURIComponent(id)}`);

function idFromLocation(): string | null {
  const m = /^\/cards\/([^/]+)$/.exec(window.location.pathname);
  if (m) return decodeURIComponent(m[1]);
  return new URLSearchParams(window.location.search).get("card");
}

/** Open the <details> holding the URL's #fragment (e.g. #downgrade, #edit) and scroll to it. */
function revealHash() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
  el.scrollIntoView({ block: "start" });
}

/**
 * Home: the Up next strip, the card stack and the selected card's details.
 * Selection lives in the URL (pushState, no server round trip) so deep links
 * and Back work.
 */
export function Wallet({ selectedId, logBenefitId = null, url }: { selectedId: string | null; logBenefitId?: string | null; url: WalletUrl }) {
  const { data } = useApp();
  const router = useRouter();
  const views = useHoldingViews();
  const { visible: attention, hidden } = useUpNext();
  const ordered = useMemo(() => walletOrder(views, attention), [views, attention]);

  const [selected, setSelected] = useState(selectedId);
  const [logTarget, setLogTarget] = useState<{ holdingId: string; benefitId: string } | null>(
    selectedId && logBenefitId ? { holdingId: selectedId, benefitId: logBenefitId } : null,
  );
  useEffect(() => setSelected(selectedId), [selectedId]);
  useEffect(() => {
    const onPop = () => setSelected(idFromLocation());
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", revealHash);
    revealHash();
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", revealHash);
    };
  }, []);

  const current = ordered.find((v) => v.holding.id === selected) ?? ordered[0] ?? null;

  const select = useCallback(
    (id: string) => {
      if (id === current?.holding.id) return;
      setSelected(id);
      setLogTarget(null);
      window.history.pushState(null, "", hrefFor(url, id));
    },
    [current, url],
  );

  const onLog = useCallback(
    (holdingId: string, benefitId: string) => {
      if (holdingId !== current?.holding.id) {
        setSelected(holdingId);
        window.history.pushState(null, "", hrefFor(url, holdingId));
      }
      // A fresh object re-triggers the row even when it is already the target.
      setLogTarget({ holdingId, benefitId });
    },
    [current, url],
  );

  if (data.holdings.length === 0) return <GetStarted />;
  if (url === "path" && selectedId && !views.some((v) => v.holding.id === selectedId)) {
    return (
      <div className="flex flex-col items-start gap-4 py-8">
        <PageTitle sub="It may have been deleted.">Card not found</PageTitle>
        <PillLink href="/">Back to the wallet</PillLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <UpNextStrip items={attention} hidden={hidden} onLog={onLog} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-12">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Stack ordered={ordered} selectedId={current!.holding.id} attention={attention} onSelect={select} />
        </div>
        <CardDetail
          key={current!.holding.id}
          view={current!}
          attention={attention}
          logBenefitId={logTarget?.holdingId === current!.holding.id ? logTarget.benefitId : null}
          onDeleted={() => router.push("/")}
        />
      </div>
    </div>
  );
}

const STRIP = 62; // visible height of a collapsed card
const OVERLAP = 16; // the next strip's rounded top sits over the previous one

/**
 * Apple Wallet-style stack: the selected card in full, the rest as overlapping
 * strips. Real buttons; arrow keys move the selection; aria-pressed marks it.
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
      <h2 className="sr-only">Cards</h2>
      <p className="sr-only" id="stack-help">
        Use the arrow keys to move between cards.
      </p>
      <ul aria-label="Card stack" aria-describedby="stack-help" data-testid="wallet-stack" onKeyDown={onKeyDown} className="relative pb-2">
        {display.map((v, i) => {
          const selected = i === 0;
          const last = i === display.length - 1;
          const chip = selected ? "SELECTED" : cardChip(v.holding, attention);
          return (
            <li
              key={v.holding.id}
              ref={(el) => {
                if (el) items.current.set(v.holding.id, el);
                else items.current.delete(v.holding.id);
              }}
              className="relative"
              style={{ marginTop: i === 0 ? 0 : i === 1 ? 14 : -OVERLAP, zIndex: i }}
            >
              <button
                type="button"
                ref={(el) => {
                  if (el) buttons.current.set(v.holding.id, el);
                  else buttons.current.delete(v.holding.id);
                }}
                aria-pressed={selected}
                aria-label={`${v.name}${chip && !selected ? `, ${chip.toLowerCase()}` : ""}`}
                data-testid={`wallet-card-${v.holding.id}`}
                onClick={() => onSelect(v.holding.id)}
                className={`block w-full overflow-hidden text-left transition-[filter] ${
                  selected ? "rounded-2xl" : `rounded-t-2xl hover:brightness-110 ${last ? "rounded-b-2xl" : ""}`
                }`}
                style={selected ? undefined : { height: STRIP + OVERLAP, boxShadow: "0 -1px 3px rgb(0 0 0 / 0.12)" }}
              >
                <WalletCard view={v} chip={chip} />
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
    <div className="flex max-w-xl flex-col gap-5 py-6">
      <PageTitle sub="Add your cards to see fees, credits, payments and 5/24 in one stack.">Your wallet is empty</PageTitle>
      <ol className="divide-y divide-hairline border-y border-hairline text-sm">
        <li className="flex flex-wrap items-center justify-between gap-3 py-4">
          <span>
            <span className="block font-semibold">Import your seed file</span>
            <span className="text-muted">
              e.g. <code className="font-mono">seed/my-cards.json</code> (gitignored), or the demo file.
            </span>
          </span>
          <PillLink href="/settings#import" variant="primary">
            Import
          </PillLink>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-3 py-4">
          <span>
            <span className="block font-semibold">Or add a card by hand</span>
            <span className="text-muted">From the catalog or a custom card.</span>
          </span>
          <PillLink href="/cards">Add card</PillLink>
        </li>
      </ol>
    </div>
  );
}
