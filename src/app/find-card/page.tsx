"use client";

import Link from "next/link";
import { useState } from "react";
import { saveFindCardCriteria } from "@/app/actions";
import { useApp } from "@/components/AppState";
import { candidateBadge, money, useFindCards } from "@/components/FindCard";
import { useSheet } from "@/components/Sheet";
import { Badge, Button, Empty, Field, Group, GroupLabel, PageTitle, Row } from "@/components/ui";
import { formatDate, monthDay } from "@/lib/domain/dates";
import { criteriaOf, FEE_LIMITS, offerLine, situationText, type Candidate } from "@/lib/domain/findCard";
import type { FindCardCriteria } from "@/lib/domain/types";

const ISSUER = (id: string) => id.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Find a card (docs/SPEC-v8-find-a-card.md): every catalog card you don't hold,
 * ranked by what it's worth to you, after the issuer rules. Deterministic and
 * in-app: nothing is sent anywhere.
 */
export default function FindCardPage() {
  const { catalog, data, today, mutate } = useApp();
  // The page owns the criteria while it is open: a save's reply can carry an older value when
  // several controls change quickly, so the stored copy is only where it starts from.
  const [local, setLocal] = useState<FindCardCriteria>(() => criteriaOf(data.settings.findCardCriteria));
  const { criteria, result } = useFindCards(local);
  const sheet = useSheet();
  const [copied, setCopied] = useState<"" | "ok" | "failed">("");
  const set = (patch: Partial<FindCardCriteria>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    mutate((d) => ({ ...d, settings: { ...d.settings, findCardCriteria: next } }), () => saveFindCardCriteria(next));
  };
  const issuers = [...new Set(catalog.cards.map((c) => c.issuer))].sort();
  const programs = [...catalog.programs].filter((p) => p.kind !== "cash" && catalog.cards.some((c) => c.rewards_program === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const bonus = criteria.goal === "bonus";

  const row = (c: Candidate, blocked = false) => {
    const value = bonus ? c.netBonus : c.netEveryday;
    const badge = blocked ? null : candidateBadge(c, criteria.goal);
    const sub = blocked
      ? `${c.eligibility.reasons.join(", ")}${c.eligibility.eligibleFrom ? ` · eligible from ${formatDate(c.eligibility.eligibleFrom)}` : ""}`
      : bonus
        ? offerLine(c.card)
        : c.uplift
          ? c.uplift.rows.length
            ? `${money(c.uplift.total)}/yr more than your cards · $${c.annualFee} fee`
            : `$${c.annualFee} annual fee`
          : "Earn rates not researched yet";
    return (
      <Row
        key={c.card.id}
        testId={`candidate-${c.card.id}`}
        bar={c.card.brand_color}
        title={c.card.name}
        sub={sub}
        amount={value === null ? "—" : `≈ ${money(value)}`}
        date={badge?.text}
        urgent={badge?.tone === "danger"}
        ariaLabel={`${c.card.name}: ${sub}`}
        onClick={() => sheet.open({ type: "candidate", cardId: c.card.id })}
      />
    );
  };

  return (
    <div className="flex flex-col">
      <PageTitle help="Ranks catalog cards you don't hold, using public offers, the issuer rules and your rough spending. Worked out in the app; nothing is sent anywhere. Credits are listed but never counted.">
        Find a card
      </PageTitle>

      <Group data-testid="find-criteria">
        <li className="grid grid-cols-2 gap-3 px-4 py-3">
          <Field label="Card type">
            <select value={criteria.accountType} onChange={(e) => set({ accountType: e.target.value as FindCardCriteria["accountType"] })} data-testid="find-type">
              <option value="personal">Personal</option>
              <option value="business">Business</option>
              <option value="both">Both</option>
            </select>
          </Field>
          <Field label="Goal">
            <select value={criteria.goal} onChange={(e) => set({ goal: e.target.value as FindCardCriteria["goal"] })} data-testid="find-goal">
              <option value="bonus">Welcome bonus</option>
              <option value="everyday">Everyday value</option>
            </select>
          </Field>
          <Field label="Points in">
            <select value={criteria.program} onChange={(e) => set({ program: e.target.value })} data-testid="find-program">
              <option value="any">Any</option>
              <option value="cash">Cash back</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Annual fee up to">
            <select value={criteria.maxFee === null ? "" : String(criteria.maxFee)} onChange={(e) => set({ maxFee: e.target.value === "" ? null : Number(e.target.value) })} data-testid="find-fee">
              <option value="">No limit</option>
              {FEE_LIMITS.map((f) => (
                <option key={f} value={f}>
                  ${f}
                </option>
              ))}
            </select>
          </Field>
        </li>
        <li>
          <details data-testid="find-issuers">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-[15px] font-medium">
              Issuers · {criteria.excludedIssuers.length === 0 ? "all" : `${issuers.length - criteria.excludedIssuers.filter((i) => issuers.includes(i)).length} of ${issuers.length}`}
            </summary>
            <div className="grid grid-cols-2 gap-x-3 px-4 pb-3">
              {issuers.map((i) => (
                <label key={i} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={!criteria.excludedIssuers.includes(i)}
                    onChange={(e) => set({ excludedIssuers: e.target.checked ? criteria.excludedIssuers.filter((x) => x !== i) : [...criteria.excludedIssuers, i] })}
                  />
                  <span>{ISSUER(i)}</span>
                </label>
              ))}
            </div>
          </details>
        </li>
      </Group>

      {result.monthlySpend === 0 && (
        <p className="mt-3 px-1 text-sm" data-testid="find-no-profile">
          <Link href="/settings#spending" className="underline decoration-dotted underline-offset-2">
            Add your rough spending to see fit · Settings ›
          </Link>
        </p>
      )}
      {result.defaultValued.length > 0 && (
        <p className="mt-2 px-1 text-sm text-muted" data-testid="find-valuation">
          Using the catalog&apos;s default value per point for {result.defaultValued.slice(0, 4).join(", ")}
          {result.defaultValued.length > 4 ? ` and ${result.defaultValued.length - 4} more` : ""} ·{" "}
          <Link href="/points" className="underline decoration-dotted underline-offset-2">
            set your values in Points ›
          </Link>
        </p>
      )}

      <GroupLabel>
        {bonus ? "By welcome bonus" : "By everyday value"} · {result.ranked.length}
      </GroupLabel>
      {result.ranked.length === 0 ? (
        <Empty>No cards match. Loosen the criteria above.</Empty>
      ) : (
        <Group data-testid="find-ranked" aria-label="Ranked cards">
          {result.ranked.map((c) => row(c))}
        </Group>
      )}

      {result.notNow.length > 0 && (
        <details className="mt-4" data-testid="find-not-now">
          <summary className="flex min-h-11 cursor-pointer items-center px-1 font-mono text-[11px] tracking-wider text-muted uppercase">Not right now · {result.notNow.length}</summary>
          <Group aria-label="Not right now">{result.notNow.map((c) => row(c, true))}</Group>
        </details>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          data-testid="copy-situation"
          onClick={async () => {
            const text = situationText(catalog, data, criteria, result, today);
            try {
              await navigator.clipboard.writeText(text);
              setCopied("ok");
            } catch {
              setCopied("failed");
            }
          }}
        >
          Copy my situation
        </Button>
        <span role="status" className="text-sm text-muted">
          {copied === "ok" ? "Copied. Paste it into a chat; nothing was sent anywhere." : copied === "failed" ? "Couldn't reach the clipboard in this browser." : "Plain text for pasting into a chat. Clipboard only."}
        </span>
      </div>
      <p className="mt-3 px-1 text-sm text-muted" data-testid="find-footer">
        {result.newestAsOf ? `Offers as of ${monthDay(result.newestAsOf)} · ` : ""}ranking uses public offers; yours may differ
        {" · "}
        <Badge tone="warn">{"⚠︎ Unverified"}</Badge> imported facts are not yet checked
      </p>
    </div>
  );
}
