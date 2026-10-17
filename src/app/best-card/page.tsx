"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppState";
import { Badge, CardBar, Empty, Group, GroupLabel, PageTitle } from "@/components/ui";
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
    () => rankCards(category, data.holdings, catalog, data.settings, data.activations, today, data.points, data.mutes),
    [category, data, catalog, today],
  );

  return (
    <div className="flex flex-col">
      <PageTitle help="Ranked by estimated value per dollar: rate × your cents per point (set in Settings or Points).">Best card</PageTitle>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-1 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0" role="radiogroup" aria-label="Spend category">
        {SPEND_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={category === c}
            onClick={() => setCategory(c)}
            className={`min-h-9 shrink-0 rounded-full border px-3.5 text-sm whitespace-nowrap ${category === c ? "border-transparent bg-btn font-semibold text-btn-text" : "border-hairline bg-list text-muted hover:border-text hover:text-text"}`}
          >
            {LABELS[c]}
          </button>
        ))}
      </div>
      <GroupLabel>{LABELS[category]}</GroupLabel>
      {ranked.length === 0 ? (
        <Empty>No open cards.</Empty>
      ) : (
        <Group data-testid="best-card-list" aria-label={`Best card for ${LABELS[category]}`}>
          {ranked.map((r, i) => (
            <li key={r.holdingId} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <span className="w-4 shrink-0 text-right font-mono text-sm text-muted">{i + 1}</span>
              <CardBar color={r.brandColor} />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate font-semibold">{r.name}</span>
                  {r.source === "rotating" && <Badge tone="accent">Rotating 5%</Badge>}
                  {r.remindersOff && <Badge tone="info">Reminders off</Badge>}
                  {!r.verified && <Badge tone="warn">⚠︎ Unverified</Badge>}
                </span>
                <span className="block truncate text-sm text-muted">
                  {r.label}
                  {r.conditions.length > 0 && ` · ${r.conditions.join(" · ")}`}
                </span>
                {r.hint && <span className="block text-xs text-warn">{r.hint}</span>}
              </span>
              <span className="shrink-0 text-right font-mono leading-tight">
                <span className="block text-[15px] font-bold">
                  {r.rate}
                  {r.unit === "percent" ? "%" : "x"}
                </span>
                <span className="block text-[11px] tracking-wider text-muted">≈{r.centsPerDollar.toFixed(1)}¢/$</span>
              </span>
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}
