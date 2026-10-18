"use client";

import { useId, useMemo, useState } from "react";
import { useApp } from "@/components/AppState";
import { Badge, CELL, Empty, Field, Group, GroupLabel, InfoToggle, PageTitle, Provenance } from "@/components/ui";
import { shortDate } from "@/lib/domain/dates";
import { checkApplication, type ApplyEvaluation, type Verdict } from "@/lib/domain/rules";

const ISSUER = (id: string) => id.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Should I apply? (docs/SPEC-v7-phone-feedback.md §4). Pick a catalog card;
 * get a plain approval and welcome-bonus verdict from the issuer rules that
 * apply to it, each rule with its reasons and source.
 */
export default function ApplyPage() {
  const { catalog, data, today } = useApp();
  const [cardId, setCardId] = useState("");
  const [nll, setNll] = useState(false);
  const [nllInfo, setNllInfo] = useState(false);
  const nllId = useId();
  const card = catalog.cards.find((c) => c.id === cardId);
  const check = useMemo(
    () => (card ? checkApplication(card, data.holdings, catalog, today, { nll }) : null),
    [card, data.holdings, catalog, today, nll],
  );
  const byIssuer = useMemo(() => {
    const m = new Map<string, typeof catalog.cards>();
    for (const c of [...catalog.cards].sort((a, b) => a.name.localeCompare(b.name))) m.set(c.issuer, [...(m.get(c.issuer) ?? []), c]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);
  const held = (id: string) => data.holdings.some((h) => h.catalogCardId === id && h.status === "open");
  const checked = check?.evaluations.map((e) => e.rule.last_verified).sort().at(-1);
  const nllNote = check?.evaluations.find((e) => e.rule.nll_waiver)?.rule.nll_waiver?.note;

  return (
    <div className="flex flex-col">
      <PageTitle help="Uses the issuer rules in the catalog and your card history. Rules change; always verify on the issuer's site.">Should I apply?</PageTitle>

      <Group>
        <li className={CELL}>
          <Field label="Card you're considering">
            <select value={cardId} onChange={(e) => setCardId(e.target.value)} data-testid="apply-card">
              <option value="">Pick a card…</option>
              {byIssuer.map(([issuer, cards]) => (
                <optgroup key={issuer} label={ISSUER(issuer)}>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {held(c.id) ? " (you have one)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        </li>
        {check?.nllApplies && (
          <li className={`${CELL} flex flex-wrap items-center gap-x-1`}>
            <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={nll} onChange={(e) => setNll(e.target.checked)} data-testid="apply-nll" />
              <span>Offer has no lifetime language</span>
            </label>
            <InfoToggle open={nllInfo} onToggle={() => setNllInfo((o) => !o)} controls={nllId} label="About no-lifetime-language offers" />
            <span id={nllId} hidden={!nllInfo} className="block basis-full pb-1 text-sm text-muted">
              <Badge tone="info">Community curated</Badge> Community data points, not an Amex policy. {nllNote}
            </span>
          </li>
        )}
      </Group>

      {!card ? (
        <Empty>Pick a card to see whether you&apos;d likely be approved and get the welcome bonus.</Empty>
      ) : check && check.evaluations.length === 0 ? (
        <Empty>No issuer rules in the catalog for {card.name}. That doesn&apos;t mean there are none.</Empty>
      ) : (
        check && (
          <>
            <GroupLabel>Verdict</GroupLabel>
            <Group data-testid="apply-verdict" aria-live="polite">
              <VerdictRow label="Approval" v={check.approval} today={today} />
              <VerdictRow label="Welcome bonus" v={check.bonus} today={today} />
            </Group>

            <GroupLabel>Rules · {check.evaluations.length}</GroupLabel>
            <Group>
              {check.evaluations.map((e) => (
                <RuleRow key={e.rule.id} e={e} />
              ))}
            </Group>
            <p className="mt-2 px-1 text-sm text-warn">
              Verify before applying · rules checked <span className="font-mono">{shortDate(checked)}</span>
            </p>
          </>
        )
      )}
    </div>
  );
}

const PASS_TEXT = { Approval: "Likely approved", "Welcome bonus": "Eligible" } as const;
const FAIL_TEXT = { Approval: "Likely denied", "Welcome bonus": "Not eligible" } as const;

function VerdictRow({ label, v, today }: { label: "Approval" | "Welcome bonus"; v: Verdict; today: string }) {
  const tone = v.outcome === "pass" ? "ok" : v.outcome === "fail" ? "danger" : "info";
  const text =
    v.outcome === "pass" ? PASS_TEXT[label] : v.outcome === "fail" ? FAIL_TEXT[label] : v.outcome === "manual" ? "Check manually" : "No rules in the catalog";
  const why = v.rules.map((r) => r.name).join(", ");
  return (
    <li className={`${CELL} flex flex-col gap-0.5`} data-testid={`verdict-${label === "Approval" ? "approval" : "bonus"}`} data-outcome={v.outcome}>
      <span className="font-mono text-[11px] tracking-wider text-muted uppercase">{label}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px] font-semibold">
        <Badge tone={tone}>{v.outcome === "pass" ? "Pass" : v.outcome === "fail" ? "Fail" : v.outcome === "manual" ? "Check" : "—"}</Badge>
        {text}
      </span>
      {why && <span className="text-sm text-muted">{why}</span>}
      {v.eligibleFrom && (
        <span className="text-sm">
          Eligible from <span className="font-mono">{shortDate(v.eligibleFrom, today)}</span> if nothing else changes
        </span>
      )}
    </li>
  );
}

function RuleRow({ e }: { e: ApplyEvaluation }) {
  const badge = e.waived ? (
    <Badge tone="info">Waived by NLL offer</Badge>
  ) : (
    <Badge tone={e.outcome === "pass" ? "ok" : e.outcome === "fail" ? "danger" : "info"}>
      {e.outcome === "pass" ? "Pass" : e.outcome === "fail" ? "Fail" : "Check manually"}
    </Badge>
  );
  return (
    <li className={`${CELL} flex flex-col gap-1.5 text-sm`} data-testid={`rule-${e.rule.id}`}>
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold">{e.rule.name}</span>
        {badge}
        <span className="text-muted">Affects {e.rule.effect === "bonus" ? "the welcome bonus" : "approval"}</span>
        <Provenance fact={e.rule} description={e.rule.description} />
      </p>
      <ul className={`flex flex-col gap-0.5 ${e.waived ? "text-muted" : ""}`}>
        {e.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </li>
  );
}
