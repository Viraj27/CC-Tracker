"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppState";
import { use524 } from "@/components/derived";
import { Badge, Empty, Field, PageTitle, Provenance, Section, TextLink } from "@/components/ui";
import { formatDate } from "@/lib/domain/dates";
import { evaluateRule } from "@/lib/domain/rules";

export default function EligibilityPage() {
  const { catalog, data, today } = useApp();
  const { status, rule } = use524();
  const [ruleId, setRuleId] = useState(catalog.rules[0]?.id ?? "");
  const selected = catalog.rules.find((r) => r.id === ruleId);
  const evaluation = useMemo(
    () => (selected ? evaluateRule(selected, data.holdings, catalog, today) : null),
    [selected, data.holdings, catalog, today],
  );
  const max = Math.max(5, ...status.timeline.map((t) => t.count));

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="Rules change — always verify on the issuer's site before applying.">5/24 & eligibility</PageTitle>

      <Section title={`Chase 5/24: ${status.count} counted account(s)`}>
        {rule && (
          <div className="mb-3 text-sm">
            <p className="text-muted">{rule.description}</p>
            <Provenance fact={rule} />
          </div>
        )}
        {status.accounts.length === 0 ? (
          <Empty>No accounts opened in the last 24 months.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-normal">Card</th>
                <th className="py-1 font-normal">Opened</th>
                <th className="py-1 font-normal">Drops off</th>
              </tr>
            </thead>
            <tbody>
              {status.accounts.map((a) => (
                <tr key={a.holdingId} className="border-t border-border">
                  <td className="py-1.5 pr-2">
                    <TextLink href={`/cards/${a.holdingId}`}>{a.name}</TextLink>
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(a.approvalDate)}</td>
                  <td className="py-1.5 whitespace-nowrap">{formatDate(a.dropOffDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="mt-4 mb-2 text-sm font-semibold">Count going forward (if no new accounts)</h3>
        <ol className="flex flex-col gap-1 text-sm" aria-label="5/24 timeline">
          {status.timeline.map((t) => (
            <li key={t.date} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2">
              <span className="text-xs text-muted">{t.date === today ? "Today" : formatDate(t.date)}</span>
              <span className="h-3 rounded-sm bg-surface-2">
                <span
                  className="block h-full rounded-sm"
                  style={{ width: `${(t.count / max) * 100}%`, background: t.count > status.max ? "var(--danger)" : "var(--ok)" }}
                />
              </span>
              <span className="text-right font-medium">{t.count}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Considering a card?">
        <Field label="Issuer rule">
          <select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            {catalog.rules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.issuer.replace("_", " ")} — {r.name}
              </option>
            ))}
          </select>
        </Field>
        {selected && evaluation && (
          <div className="mt-3 flex flex-col gap-2 text-sm" aria-live="polite">
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone={evaluation.outcome === "pass" ? "ok" : evaluation.outcome === "fail" ? "danger" : "info"}>
                {evaluation.outcome === "pass" ? "Pass" : evaluation.outcome === "fail" ? "Fail" : "Check manually"}
              </Badge>
              <span className="text-muted">Affects {selected.effect === "bonus" ? "the welcome bonus" : "approval"}</span>
            </p>
            <p>{selected.description}</p>
            <ul className="flex flex-col gap-0.5">
              {evaluation.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <Provenance fact={selected} />
            <p className="rounded-lg border border-warn/40 bg-warn/10 p-2 text-warn">
              Verify before applying: last checked {formatDate(selected.last_verified)}. Issuer rules and offer terms change often.
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}
