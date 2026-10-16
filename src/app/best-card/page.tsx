"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppState";
import { Badge, CardSwatch, Empty, PageTitle, Section } from "@/components/ui";
import { SPEND_CATEGORIES, type SpendCategory } from "@/lib/catalog/schema";
import { rankCards } from "@/lib/domain/bestCard";

const LABELS: Record<SpendCategory, string> = {
  dining: "Dining",
  groceries: "Groceries",
  gas: "Gas / EV",
  travel: "Travel (general)",
  airfare: "Airfare",
  hotels: "Hotels",
  transit: "Transit / rideshare",
  drugstores: "Drugstores",
  streaming: "Streaming",
  phone: "Phone plan",
  online: "Online shopping",
  entertainment: "Entertainment",
  other: "Everything else",
};

export default function BestCardPage() {
  const { catalog, data, today } = useApp();
  const [category, setCategory] = useState<SpendCategory>("dining");
  const ranked = useMemo(
    () => rankCards(category, data.holdings, catalog, data.settings, data.activations, today, data.points),
    [category, data, catalog, today],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="Ranked by estimated value per dollar (rate × your cents-per-point, set in Settings or Points).">
        Which card should I use?
      </PageTitle>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Spend category">
        {SPEND_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={category === c}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1 text-sm ${category === c ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border text-muted hover:text-text"}`}
          >
            {LABELS[c]}
          </button>
        ))}
      </div>
      <Section title={LABELS[category]}>
        {ranked.length === 0 ? (
          <Empty>No open cards.</Empty>
        ) : (
          <ol className="divide-y divide-border" data-testid="best-card-list">
            {ranked.map((r, i) => (
              <li key={r.holdingId} className="flex items-start gap-3 py-2">
                <span className="w-5 shrink-0 pt-0.5 text-right text-sm text-muted">{i + 1}</span>
                <CardSwatch color={r.brandColor} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {r.name}{" "}
                    <span className="font-bold">
                      {r.rate}
                      {r.unit === "percent" ? "%" : "x"}
                    </span>{" "}
                    <span className="text-xs text-muted">≈ {r.centsPerDollar.toFixed(1)}¢/$ at {r.cpp}¢/pt</span>
                  </p>
                  <p className="text-sm text-muted">
                    {r.label}
                    {r.source === "rotating" && (
                      <>
                        {" "}
                        <Badge tone="accent">Rotating 5%</Badge>
                      </>
                    )}
                    {!r.verified && (
                      <>
                        {" "}
                        <Badge tone="warn">⚠ Unverified</Badge>
                      </>
                    )}
                  </p>
                  {r.conditions.length > 0 && <p className="text-xs text-muted">{r.conditions.join(" · ")}</p>}
                  {r.hint && <p className="text-xs text-warn">{r.hint}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
