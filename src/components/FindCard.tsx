"use client";

/** Find a card (docs/SPEC-v8-find-a-card.md): the shared ranking hook and the sheet for one candidate. */
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { formatDate, monthDay } from "@/lib/domain/dates";
import { offerHistory } from "@/lib/domain/deals";
import { criteriaOf, findCards, offerLine, type Candidate, type FindResult } from "@/lib/domain/findCard";
import { SPEND_LABELS } from "@/lib/domain/spend";
import type { FindCardCriteria } from "@/lib/domain/types";
import { useApp } from "./AppState";
import { SheetHeader, SheetPrimary, SheetSecondary, useSheet } from "./Sheet";
import { Badge, CELL, FactBadges, Group, GroupLabel, Provenance, usd } from "./ui";

export const money = (n: number) => `${n < 0 ? "−" : ""}${usd(Math.abs(Math.round(n)))}`;
const cents = (n: number) => `${Math.round(n * 100) / 100}¢`;

/** The ranking for the saved criteria, or for `override` (the page's own state while its saves are in flight). */
export function useFindCards(override?: FindCardCriteria): { criteria: FindCardCriteria; result: FindResult } {
  const { catalog, data, today } = useApp();
  return useMemo(() => {
    const criteria = override ?? criteriaOf(data.settings.findCardCriteria);
    return { criteria, result: findCards(catalog, data, criteria, today, offerHistory(catalog.feed.changelog)) };
  }, [catalog, data, today, override]);
}

/** The badge on a ranked row: eligibility first, then reach, then an elevated offer. */
export function candidateBadge(c: Candidate, goal: FindCardCriteria["goal"]): { text: string; tone: "ok" | "warn" | "danger" | "info" | "accent" } | null {
  if (c.eligibility.state === "check") return { text: "Check", tone: "info" };
  if (goal === "bonus" && c.reach) {
    if (c.reach.state === "stretch") return { text: "Stretch", tone: "warn" };
    if (c.reach.state === "out") return { text: "Out of reach", tone: "danger" };
    return c.elevated ? { text: "Elevated", tone: "accent" } : { text: "Reachable", tone: "ok" };
  }
  return c.elevated ? { text: "Elevated", tone: "accent" } : null;
}

const Line = ({ label, value, sub, testId }: { label: string; value: React.ReactNode; sub?: React.ReactNode; testId?: string }) => (
  <li className="flex items-start justify-between gap-3 px-4 py-2.5" data-testid={testId}>
    <span className="min-w-0">
      <span className="block">{label}</span>
      {sub && <span className="block text-sm text-muted">{sub}</span>}
    </span>
    <span className="shrink-0 font-mono font-bold">{value}</span>
  </li>
);

/** The breakdown for one candidate: every figure next to the numbers it was made from. */
export function CandidateSheet({ cardId }: { cardId: string }) {
  const { catalog, today } = useApp();
  const { criteria, result } = useFindCards();
  const sheet = useSheet();
  const router = useRouter();
  const c = [...result.ranked, ...result.notNow].find((x) => x.card.id === cardId);
  const card = c?.card ?? catalog.cards.find((x) => x.id === cardId);
  if (!c || !card) {
    return <SheetHeader title={card?.name ?? "Card"} sub="Not in the current list. Change the criteria on Find a card to see it." />;
  }
  const offer = card.public_offer;
  const program = catalog.programs.find((p) => p.id === card.rewards_program);
  const go = (href: string) => {
    sheet.close();
    router.push(href);
  };
  return (
    <div data-testid="candidate-sheet">
      <SheetHeader title={card.name} sub={`${card.issuer.replaceAll("_", " ")} · ${card.account_type}`} info={<FactBadges fact={card.annual_fee} />} />

      {c.eligibility.state === "blocked" && (
        <p role="note" className="mb-3 rounded-[14px] border border-urgent/50 px-4 py-2 text-[15px]" data-testid="candidate-blocked">
          Not right now: {c.eligibility.reasons.join(", ")}
          {c.eligibility.eligibleFrom && ` · eligible from ${formatDate(c.eligibility.eligibleFrom)} if nothing else changes`}
        </p>
      )}
      {c.eligibility.state === "check" && (
        <p role="note" className="mb-3 rounded-[14px] border border-text/20 px-4 py-2 text-[15px]">
          Check manually: {c.eligibility.reasons.join(", ")}
        </p>
      )}

      <GroupLabel>Welcome bonus</GroupLabel>
      <Group data-testid="candidate-bonus">
        {offer ? (
          <>
            <Line
              label="Bonus value"
              value={money(c.bonusValue!)}
              sub={offer.unit === "usd" ? "Cash, at face value" : `${offer.bonus.toLocaleString("en-US")} ${offer.unit} × ${cents(c.bonusCpp)} (${program?.name ?? card.rewards_program})`}
              testId="candidate-bonus-value"
            />
            <Line label="First-year fee" value={money(-c.firstYearFee)} sub={card.annual_fee.first_year_waived ? `$${c.annualFee} from year two; waived the first year` : c.annualFee === 0 ? "No annual fee" : undefined} />
            <Line label="Net first-year value" value={`≈ ${money(c.netBonus!)}`} sub={`${money(c.bonusValue!)} − ${money(c.firstYearFee)}`} testId="candidate-net" />
            <li className={`${CELL} flex flex-wrap items-center gap-x-1.5 text-sm`} data-testid="candidate-offer-source">
              <span className="min-w-0 flex-1">
                {offerLine(card)} · public offer as of {monthDay(offer.as_of)}
              </span>
              <Provenance
                flow
                fact={{ source_url: offer.source_url, last_verified: offer.as_of, verified: true, source_type: offer.source_type ?? "official", note: offer.note }}
                description="Public offers change often and yours may differ. Check the issuer's page before applying."
              />
            </li>
          </>
        ) : (
          <li className={`${CELL} text-muted`}>No public offer on file. Check the issuer&apos;s page.</li>
        )}
      </Group>

      {offer && (
        <>
          <GroupLabel>Can you reach the spend?</GroupLabel>
          <Group data-testid="candidate-reach">
            {c.reach ? (
              <li className={`${CELL} flex flex-col gap-1`}>
                <span className="flex items-center gap-2 font-semibold">
                  <Badge tone={c.reach.state === "reachable" ? "ok" : c.reach.state === "stretch" ? "warn" : "danger"}>
                    {c.reach.state === "reachable" ? "Reachable" : c.reach.state === "stretch" ? "Stretch" : "Out of reach"}
                  </Badge>
                  {offer.min_spend === null ? "No minimum spend" : `Needs ${money(c.reach.neededPerMonth)}/mo · you spend about ${money(c.reach.monthlySpend)}`}
                </span>
                {offer.min_spend !== null && (
                  <span className="text-sm text-muted">
                    {money(offer.min_spend)} ÷ ({c.reach.days} days ÷ 30){c.reach.assumedDays ? "; the offer gives no window, so 90 days is assumed" : ""}
                  </span>
                )}
              </li>
            ) : (
              <li className={`${CELL} text-muted`}>Not judged: add your rough spending in Settings.</li>
            )}
          </Group>
        </>
      )}

      <GroupLabel>Everyday value</GroupLabel>
      <Group data-testid="candidate-everyday">
        {c.uplift ? (
          <>
            {c.uplift.rows.length === 0 && <li className={`${CELL} text-muted`}>Add your rough spending in Settings to see what this card would add.</li>}
            {c.uplift.rows.slice(0, 3).map((r) => (
              <Line
                key={r.category}
                label={SPEND_LABELS[r.category]}
                value={`+${money(r.value)}/yr`}
                sub={`${money(r.monthly)}/mo × 12 × (${cents(r.candidateCents)} − ${cents(r.bestCents)} per $${r.bestName ? ` on ${r.bestName}` : ""})`}
              />
            ))}
            {c.uplift.rows.length > 0 && (
              <Line
                label="Net everyday value"
                value={`≈ ${money(c.netEveryday!)}/yr`}
                sub={`${money(c.uplift.total)} across ${c.uplift.rows.length} categor${c.uplift.rows.length === 1 ? "y" : "ies"} − ${money(c.annualFee)} annual fee`}
                testId="candidate-net-everyday"
              />
            )}
            {c.credits !== null && <li className={`${CELL} text-sm text-muted`}>Credits listed: {money(c.credits)}/yr · not counted</li>}
          </>
        ) : (
          <li className={`${CELL} text-muted`}>Earn rates not researched yet.</li>
        )}
      </Group>

      <GroupLabel>Eligibility</GroupLabel>
      <Group>
        {c.eligibility.noRules ? (
          <li className={`${CELL} text-muted`}>No issuer rules in the catalog. That doesn&apos;t mean there are none.</li>
        ) : (
          <li className={CELL}>
            {c.eligibility.state === "ok" ? "Likely approved and eligible for the bonus" : c.eligibility.state === "check" ? "Check manually" : "Not right now"} ·{" "}
            {c.eligibility.check.evaluations.length} rule{c.eligibility.check.evaluations.length === 1 ? "" : "s"} checked
          </li>
        )}
        {c.fiveTwentyFour && (
          <li className={CELL} data-testid="candidate-524">
            Takes you to {c.fiveTwentyFour.after}/24 <span className="text-muted">(Chase denies at {c.fiveTwentyFour.limit})</span>
          </li>
        )}
      </Group>

      <div className="mt-4">
        <SheetPrimary onClick={() => go(`/apply?card=${card.id}`)}>Should I apply?</SheetPrimary>
        <div className="mt-2 flex flex-wrap justify-center gap-x-4">
          <SheetSecondary onClick={() => go(`/cards?card=${card.id}${offer ? "&offer=1" : ""}`)}>Add card</SheetSecondary>
          <a className="inline-flex min-h-11 items-center px-2 text-[15px] font-medium text-muted hover:text-text" href={card.product_page} target="_blank" rel="noreferrer">
            Issuer&apos;s page
          </a>
        </div>
      </div>
      <p className="mt-2 px-1 text-xs text-muted">
        Ranked for {criteria.goal === "bonus" ? "the welcome bonus" : "everyday value"} · figures as of {formatDate(today)}
      </p>
    </div>
  );
}
