"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppState";
import { use524 } from "@/components/derived";
import { Badge, Empty, Field, PageTitle, Provenance, Section, TextLink } from "@/components/ui";
import { shortDate } from "@/lib/domain/dates";
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

      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 pb-2">
        <p className="font-mono text-6xl leading-none font-bold" data-testid="five24-big">
          {status.count}
          <span className="text-2xl text-muted">/24</span>
        </p>
        <div className="pb-1">
          <Badge tone={status.underLimit ? "ok" : "danger"}>{status.underLimit ? "Under 5/24" : "At or over 5/24"}</Badge>
          <p className="mt-1 text-sm text-muted">
            {status.nextDropOff ? (
              <>
                Next drop-off: {status.nextDropOff.name} on <span className="font-mono">{shortDate(status.nextDropOff.dropOffDate, today)}</span>
              </>
            ) : (
              "No counted accounts."
            )}
          </p>
        </div>
      </div>

      <Section title={`Chase 5/24 · ${status.count} counted account(s)`}>
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
              <tr className="text-left font-mono text-[11px] tracking-wider text-muted uppercase">
                <th className="py-1 font-normal">Card</th>
                <th className="py-1 font-normal">Opened</th>
                <th className="py-1 font-normal">Drops off</th>
              </tr>
            </thead>
            <tbody>
              {status.accounts.map((a) => (
                <tr key={a.holdingId} className="border-t border-hairline">
                  <td className="py-2 pr-2">
                    <TextLink href={`/cards/${a.holdingId}`}>{a.name}</TextLink>
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs whitespace-nowrap">{shortDate(a.approvalDate, today)}</td>
                  <td className="py-2 font-mono text-xs font-bold whitespace-nowrap">{shortDate(a.dropOffDate, today)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="mt-6 mb-2 font-mono text-[11px] tracking-wider text-muted uppercase">Count going forward (if no new accounts)</h3>
        <ol className="flex flex-col gap-1 text-sm" aria-label="5/24 timeline">
          {status.timeline.map((t) => (
            <li key={t.date} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3">
              <span className="font-mono text-xs tracking-wider text-muted uppercase">{t.date === today ? "Today" : shortDate(t.date, today)}</span>
              <span className="h-2 rounded-full bg-hairline">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(t.count / max) * 100}%`, background: t.count > status.max ? "var(--urgent)" : "var(--text)" }}
                />
              </span>
              <span className="text-right font-mono font-bold">{t.count}</span>
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
            <p className="border-l-2 border-warn pl-3 text-warn">
              Verify before applying: last checked <span className="font-mono">{shortDate(selected.last_verified)}</span>. Issuer rules and offer terms
              change often.
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}
