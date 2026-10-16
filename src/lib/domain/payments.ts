import { addMonthKey, clampedDate, diffDays, monthKey } from "./dates";
import type { Holding, PaymentRecord } from "./types";

/** Due date in a month for a payment due day (clamped: due day 31 in Feb → Feb 28/29). */
export function dueDateFor(month: string, dueDay: number): string {
  const [y, m] = month.split("-").map(Number);
  return clampedDate(y, m, dueDay);
}

export type PaymentState = "paid" | "past_due" | "due_soon" | "upcoming";

export interface PaymentRow {
  holdingId: string;
  month: string;
  dueDate: string;
  paid: boolean;
  paidDate: string | null;
  state: PaymentState;
  daysUntilDue: number;
}

/**
 * Payment rows for a holding: from `monthsBack` months ago through next month,
 * never before the account was opened or before `trackingStart`.
 */
export function paymentSchedule(
  holding: Holding,
  records: PaymentRecord[],
  today: string,
  leadDays: number,
  trackingStart: string | null = null,
  monthsBack = 2,
): PaymentRow[] {
  if (!holding.paymentDueDay || holding.status !== "open") return [];
  const first = [addMonthKey(monthKey(today), -monthsBack), monthKey(holding.approvalDate), trackingStart ?? ""]
    .sort()
    .at(-1)!;
  const last = addMonthKey(monthKey(today), 1);
  const rows: PaymentRow[] = [];
  for (let m = first; m <= last; m = addMonthKey(m, 1)) {
    const dueDate = dueDateFor(m, holding.paymentDueDay);
    // Due dates before the account was opened can't have a statement.
    if (dueDate < holding.approvalDate) continue;
    const rec = records.find((r) => r.holdingId === holding.id && r.statementMonth === m);
    const paid = rec?.paid ?? false;
    const daysUntilDue = diffDays(today, dueDate);
    const state: PaymentState = paid
      ? "paid"
      : daysUntilDue < 0
        ? "past_due"
        : daysUntilDue <= leadDays
          ? "due_soon"
          : "upcoming";
    rows.push({ holdingId: holding.id, month: m, dueDate, paid, paidDate: rec?.paidDate ?? null, state, daysUntilDue });
  }
  return rows;
}
