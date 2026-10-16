"use client";

import { useCallback } from "react";
import { setActivation, setPaymentPaid } from "@/app/actions";
import { tempId, useApp } from "./AppState";

/** Mark a statement month paid / unpaid (optimistic). Used by Payments and Up next. */
export function useSetPaid() {
  const { mutate, today } = useApp();
  return useCallback(
    (holdingId: string, month: string, dueDate: string, paid: boolean) =>
      mutate(
        (d) => ({
          ...d,
          payments: [
            ...d.payments.filter((p) => !(p.holdingId === holdingId && p.statementMonth === month)),
            { id: tempId(), holdingId, statementMonth: month, dueDate, paid, paidDate: paid ? today : null },
          ],
        }),
        () => setPaymentPaid({ holdingId, month, dueDate, paid }),
      ),
    [mutate, today],
  );
}

/** Toggle a rotating-category quarter's activation (optimistic). Used by Rotating and Up next. */
export function useSetActivated() {
  const { mutate, today } = useApp();
  return useCallback(
    (holdingId: string, quarter: string, activated: boolean) =>
      mutate(
        (d) => ({
          ...d,
          activations: [
            ...d.activations.filter((a) => !(a.holdingId === holdingId && a.quarter === quarter)),
            { id: tempId(), holdingId, quarter, activated, date: activated ? today : null },
          ],
        }),
        () => setActivation({ holdingId, quarter, activated }),
      ),
    [mutate, today],
  );
}
