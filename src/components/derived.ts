"use client";

import { useMemo } from "react";
import type { Card } from "@/lib/catalog/schema";
import { buildAttention } from "@/lib/domain/attention";
import { chase524Params, fiveTwentyFourStatus } from "@/lib/domain/fiveTwentyFour";
import { cardFor, holdingName } from "@/lib/domain/holdings";
import { cardRoi, cardUtilization, nextAfDate, type RoiResult, type Utilization } from "@/lib/domain/roi";
import type { Holding } from "@/lib/domain/types";
import { useApp } from "./AppState";

export interface HoldingView {
  holding: Holding;
  card: Card | null;
  name: string;
  color: string;
  util: Utilization;
  roi: RoiResult;
  nextAf: { date: string; estimated: boolean };
}

export function useHoldingViews(): HoldingView[] {
  const { catalog, data, today } = useApp();
  return useMemo(
    () =>
      data.holdings.map((h) => {
        const card = cardFor(h, catalog);
        return {
          holding: h,
          card,
          name: holdingName(h, card),
          color: card?.brand_color ?? "#6b7280",
          util: cardUtilization(h, card, data.usages, today),
          roi: cardRoi(h, card, data.usages, catalog, data.settings, today),
          nextAf: nextAfDate(h, today),
        };
      }),
    [catalog, data, today],
  );
}

export function useAttention() {
  const { catalog, data, today } = useApp();
  return useMemo(() => buildAttention(catalog, data, today), [catalog, data, today]);
}

export function use524() {
  const { catalog, data, today } = useApp();
  return useMemo(() => {
    const rule = catalog.rules.find((r) => r.id === "chase-5-24") ?? null;
    return { rule, status: fiveTwentyFourStatus(data.holdings, catalog, today, chase524Params(catalog)) };
  }, [catalog, data.holdings, today]);
}
