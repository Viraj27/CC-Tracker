"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Benefit } from "@/lib/catalog/schema";
import type { AttentionItem } from "@/lib/domain/attention";
import { shortDate } from "@/lib/domain/dates";
import { dropOffDate } from "@/lib/domain/fiveTwentyFour";
import { benefitShortName } from "@/lib/domain/holdings";
import { benefitStatus } from "@/lib/domain/periods";
import { currentAndNextQuarter, isActivated } from "@/lib/domain/rotating";
import { isMuted } from "@/lib/domain/skips";
import { cardHeadline } from "@/lib/domain/wallet";
import { useApp } from "./AppState";
import { benefitsOf, CYCLE_LABEL, LIST_TITLE } from "./CardSheets";
import { use524, type HoldingView } from "./derived";
import { canGoBack } from "./Nav";
import { useSheet, type ListKind, type SheetRoute } from "./Sheet";
import { FactBadges, Group, GroupBadges, GroupLabel, Row, usd } from "./ui";
import { issuerLabel } from "./WalletCard";

const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : usd(n, Number.isInteger(n) ? 0 : 2));
/** `15 JAN 27`: fits a stat cell at 390px. */
const statDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][Number(m) - 1]} ${y.slice(2)}`;
};
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** URL fragments (deep links, v4 anchors) → the sheet they open. */
const HASH_LISTS: Record<string, ListKind> = {
  perks: "perks",
  "other-benefits": "other",
  protections: "protections",
  earn: "earn",
  downgrade: "downgrade",
  "af-history": "fees",
  lifecycle: "lifecycle",
};
function routeForHash(hash: string, holdingId: string): SheetRoute | null {
  if (hash.startsWith("benefit-")) return { type: "benefit", holdingId, benefitId: hash.slice("benefit-".length) };
  if (hash === "roi") return { type: "roi", holdingId };
  if (hash === "rotating") return { type: "rotating", holdingId };
  if (hash === "edit") return { type: "edit", holdingId };
  const list = HASH_LISTS[hash];
  return list ? { type: "list", holdingId, list } : null;
}

/**
 * The Card page (docs/SPEC-v5-app-pass.md §3.2): nav bar, short banner, one-line
 * headline, stat strip, credits, rotating 5%, and drill-in rows that open sheets.
 * Also the Wallet's right pane on desktop.
 */
export function CardPage({ view, attention, logBenefitId }: { view: HoldingView; attention: AttentionItem[]; logBenefitId: string | null }) {
  const { catalog, data, today } = useApp();
  const { status: s524, rule: rule524 } = use524();
  const sheet = useSheet();
  const router = useRouter();
  const { holding: h, card, roi, util } = view;

  // Deep links: #downgrade, #edit, #benefit-<id>… open their sheet; ?log=<benefit> opens that credit.
  useEffect(() => {
    const fromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const r = routeForHash(hash, h.id);
      if (r) sheet.open(r);
      else if (hash) document.getElementById(hash)?.scrollIntoView({ block: "start" });
    };
    if (logBenefitId) sheet.open({ type: "benefit", holdingId: h.id, benefitId: logBenefitId });
    else fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per card
  }, [h.id]);

  const counted = s524.accounts.find((a) => a.holdingId === h.id);
  const drop = rule524 && rule524.check.type === "x_in_y" ? dropOffDate(h.approvalDate, rule524.check) : null;
  const unused = Math.max(0, Math.round((util.available - util.used) * 100) / 100);
  const headline = cardHeadline({ holding: h, attention, unusedCredits: unused, fee: view.fee, realized: roi.realized });
  const product = card && h.nickname && h.nickname !== card.name ? card.name : null;
  const chip = h.status === "closed" ? "CLOSED" : h.status === "product_changed" ? "CHANGED" : !card ? "CUSTOM" : null;

  // Credits, soonest expiry first (inactive ones last).
  const credits = (card?.benefits ?? [])
    .filter((b) => b.kind === "credit")
    .map((b) => ({ b, s: benefitStatus(b, h, data.usages, today) }))
    .sort(
      (x, y) =>
        Number(!x.s.active) - Number(!y.s.active) ||
        (x.s.period.expiry ?? "9999").localeCompare(y.s.period.expiry ?? "9999") ||
        x.b.name.localeCompare(y.b.name),
    );

  const program = card?.rotating_program ? catalog.rotating.find((r) => r.id === card.rotating_program) : undefined;
  const lists: { list: ListKind; count: number | null; badges?: React.ReactNode; hidden?: boolean }[] = [
    ...(["perks", "other", "protections"] as const).map((list) => {
      const items = benefitsOf(view, list);
      return { list, count: items.length, badges: <GroupBadges facts={items} />, hidden: items.length === 0 };
    }),
    { list: "earn", count: card?.earn_rates.length ?? 0, badges: card && <GroupBadges facts={card.earn_rates} />, hidden: !card },
    { list: "downgrade", count: card?.downgrade_options.length ?? 0, badges: card && <GroupBadges facts={card.downgrade_options} />, hidden: !card },
    { list: "fees", count: data.afEvents.filter((e) => e.holdingId === h.id).length },
    { list: "lifecycle", count: data.lifecycle.filter((e) => e.holdingId === h.id).length },
  ];

  return (
    <article aria-labelledby="card-heading" data-testid="card-detail" className="min-w-0">
      {/* Nav bar: back to the Wallet (phone), Edit. */}
      <nav aria-label="Card" className="-mt-1 mb-2 flex min-h-11 items-center justify-between">
        <Link
          href="/"
          className="-ml-1 inline-flex min-h-11 items-center px-1 text-[17px] text-text lg:invisible"
          onClick={(e) => {
            if (canGoBack()) {
              e.preventDefault();
              router.back();
            }
          }}
        >
          ‹ Wallet
        </Link>
        <button type="button" className="min-h-11 px-1 text-[17px] font-semibold" onClick={() => sheet.open({ type: "edit", holdingId: h.id })}>
          Edit
        </button>
      </nav>

      {/* Short banner in the card's colour (phone); a plain header beside the stack (desktop). */}
      <header
        className="flex h-[150px] flex-col justify-between rounded-2xl bg-[var(--card-fill)] p-4 text-[var(--card-ink)] shadow-[var(--card-shadow)] lg:h-auto lg:gap-1 lg:bg-transparent lg:p-0 lg:text-text lg:shadow-none"
        style={{ "--card-fill": view.color, "--card-ink": view.ink } as React.CSSProperties}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 id="card-heading" className="truncate text-[22px] leading-tight font-bold tracking-tight lg:text-[34px]">
              {view.name}
            </h1>
            {product && <p className="truncate font-mono text-[11px] tracking-wider uppercase">{product}</p>}
          </div>
          {chip && <span className="mt-1 shrink-0 rounded-full border border-current px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider">{chip}</span>}
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="truncate font-mono text-[11px] tracking-wider uppercase">
            {issuerLabel(view)}
            {h.paymentDueDay ? ` · pay by the ${ordinal(h.paymentDueDay)}` : ""}
          </p>
          <p className="shrink-0 text-right font-mono leading-none lg:hidden">
            <span className="block text-[9px] tracking-wider">AF</span>
            <span className="text-2xl font-bold">{card ? (card.annual_fee.amount === null ? "?" : money(card.annual_fee.amount)) : "—"}</span>
          </p>
        </div>
      </header>

      <p className="mt-3 text-[17px] leading-snug" data-testid="card-headline">
        {headline}
      </p>

      {/* Stat strip: Left · ROI · 5/24 */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-hairline overflow-hidden rounded-[14px] bg-list" data-testid="stat-strip">
        <Stat label="Left" value={util.available > 0 ? money(unused) : "—"} />
        <button
          type="button"
          aria-label={`ROI this AF year: ${money(roi.realized)}. Show breakdown`}
          className="text-left hover:bg-text/[0.03]"
          onClick={() => sheet.open({ type: "roi", holdingId: h.id })}
        >
          <Stat label="ROI ›" value={money(roi.realized)} testId="roi-panel" />
        </button>
        <Stat label={counted ? "5/24 off" : "5/24"} value={counted ? statDate(counted.dropOffDate) : drop && drop <= today ? "Out" : "—"} />
      </div>

      {credits.length > 0 && (
        <section aria-labelledby="credits-heading" id="credits" className="scroll-mt-24">
          <GroupLabel id="credits-heading">Credits · {credits.length}</GroupLabel>
          <Group>
            {credits.map(({ b, s }) => (
              <CreditRow key={b.id} benefit={b} s={s} onOpen={() => sheet.open({ type: "benefit", holdingId: h.id, benefitId: b.id })} />
            ))}
          </Group>
        </section>
      )}

      {program && h.status === "open" && (() => {
        const q = currentAndNextQuarter(program, today)[0];
        const active = isActivated(data.activations, h.id, q.quarter);
        const muted = isMuted(data.mutes, h.id, "rotating");
        return (
          <section aria-labelledby="rotating-heading" id="rotating" className="scroll-mt-24">
            <GroupLabel id="rotating-heading">
              Rotating {program.rate.value}
              {program.rate.unit === "percent" ? "%" : "x"}
            </GroupLabel>
            <Group>
              <Row
                testId="rotating-row"
                title={q.announced && q.entry ? q.entry.categories.map((c) => c.name).join(", ") : "Not announced"}
                sub={
                  <span className="font-mono text-[11px] tracking-wider uppercase">
                    {q.quarter.slice(5)} · {active ? "Activated" : "Not activated"}
                    {muted ? " · Reminders off" : ""}
                  </span>
                }
                badges={q.entry && <FactBadges fact={q.entry} />}
                chevron
                onClick={() => sheet.open({ type: "rotating", holdingId: h.id })}
              />
            </Group>
          </section>
        );
      })()}

      <GroupLabel>More</GroupLabel>
      <Group data-testid="drill-ins">
        {lists
          .filter((l) => !l.hidden)
          .map((l) => (
            <Row
              key={l.list}
              testId={`drill-${l.list}`}
              title={LIST_TITLE[l.list]}
              badges={l.badges}
              amount={l.count === null ? undefined : <span className="font-normal text-muted">{l.count}</span>}
              chevron
              onClick={() => sheet.open({ type: "list", holdingId: h.id, list: l.list })}
            />
          ))}
      </Group>
    </article>
  );
}

function Stat({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <span className="block min-w-0 px-3 py-2.5">
      <span className="block font-mono text-[11px] tracking-wider text-muted uppercase">{label}</span>
      <span data-testid={testId} className="block truncate font-mono text-[17px] leading-tight font-bold">
        {value}
      </span>
    </span>
  );
}

/** Credit row: name / mono `CYCLE · EXPIRY` (urgent within lead time) / remaining / ›. */
function CreditRow({ benefit: b, s, onOpen }: { benefit: Benefit; s: ReturnType<typeof benefitStatus>; onOpen: () => void }) {
  const { data, today } = useApp();
  const quantified = b.amount !== null && b.cycle !== "per_use" && b.cycle !== "none";
  const expiringSoon = s.daysToExpiry !== null && s.daysToExpiry <= data.settings.creditLeadDays && (s.remaining ?? 1) > 0;
  const state = !s.active ? (b.ends_on && today > b.ends_on ? "Ended" : "Not started") : null;
  return (
    <Row
      id={`benefit-${b.id}`}
      ariaLabel={b.name}
      title={benefitShortName(b)}
      badges={<FactBadges fact={b} />}
      sub={
        <span className="font-mono text-[11px] tracking-wider uppercase">
          {CYCLE_LABEL[b.cycle]}
          {state ? ` · ${state}` : s.period.expiry && (
            <>
              {" · "}
              <span className={expiringSoon ? "font-bold text-urgent" : ""}>{shortDate(s.period.expiry, today)}</span>
            </>
          )}
        </span>
      }
      amount={<span data-testid={`remaining-${b.id}`}>{quantified ? money(s.remaining) : money(b.amount)}</span>}
      chevron
      onClick={onOpen}
    />
  );
}
