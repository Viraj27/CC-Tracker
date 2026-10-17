"use client";

import { useMemo } from "react";
import type { Card } from "@/lib/catalog/schema";
import { buildAttention } from "@/lib/domain/attention";
import { chase524Params, fiveTwentyFourStatus } from "@/lib/domain/fiveTwentyFour";
import { cardFor, holdingName } from "@/lib/domain/holdings";
import { cardRoi, cardUtilization, nextAfDate, type RoiResult, type Utilization } from "@/lib/domain/roi";
import type { Holding } from "@/lib/domain/types";
import { CUSTOM_CARD_COLOR, inkFor } from "@/lib/cardColors";
import { useApp } from "./AppState";

export interface HoldingView {
  holding: Holding;
  card: Card | null;
  name: string;
  color: string;
  /** Text colour on the card face. */
  ink: string;
  /** Annual fee in USD (0 when none or unknown). */
  fee: number;
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
        const color = card?.brand_color ?? CUSTOM_CARD_COLOR;
        return {
          holding: h,
          card,
          name: holdingName(h, card),
          color,
          ink: inkFor(color, card?.card_ink),
          fee: card?.annual_fee.amount ?? 0,
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
