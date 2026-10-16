import type { RotatingProgram, RotatingQuarter } from "../catalog/schema";
import { nextQuarter, quarterOf } from "./dates";
import type { RotatingActivation } from "./types";

export interface QuarterView {
  quarter: string;
  /** Catalog entry, or null when the quarter isn't in the catalog yet. */
  entry: RotatingQuarter | null;
  announced: boolean;
}

export function quarterView(program: RotatingProgram, quarter: string): QuarterView {
  const entry = program.quarters.find((q) => q.quarter === quarter) ?? null;
  return { quarter, entry, announced: !!entry?.announced };
}

export function currentAndNextQuarter(program: RotatingProgram, today: string): [QuarterView, QuarterView] {
  const cur = quarterOf(today);
  return [quarterView(program, cur), quarterView(program, nextQuarter(cur))];
}

export function isActivated(activations: RotatingActivation[], holdingId: string, quarter: string): boolean {
  return activations.some((a) => a.holdingId === holdingId && a.quarter === quarter && a.activated);
}
