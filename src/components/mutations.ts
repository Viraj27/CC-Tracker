"use client";

import { useCallback } from "react";
import { addEnrollment, deleteEnrollment, setActivation, setMutes, setPaymentPaid, setSkipped } from "@/app/actions";
import { muteKey, occurrenceKey, type Occurrence } from "@/lib/domain/skips";
import type { MuteKind } from "@/lib/domain/types";
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

/** "Mark enrolled" on a benefit (optimistic), dated today. Used by the benefit sheet and Up next. */
export function useAddEnrollment() {
  const { mutate, today } = useApp();
  return useCallback(
    (holdingId: string, benefitId: string) =>
      mutate(
        (d) => ({ ...d, enrollments: [...d.enrollments, { id: tempId(), holdingId, benefitId, enrolledOn: today }] }),
        () => addEnrollment({ holdingId, benefitId, enrolledOn: today }),
      ),
    [mutate, today],
  );
}

/** Undo a "Mark enrolled" (optimistic). */
export function useDeleteEnrollment() {
  const { mutate } = useApp();
  return useCallback(
    (id: string) => mutate((d) => ({ ...d, enrollments: d.enrollments.filter((e) => e.id !== id) }), () => deleteEnrollment(id)),
    [mutate],
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

/** Skip one Up next occurrence, or undo it (optimistic). Nothing is marked paid, used or activated. */
export function useSetSkipped() {
  const { mutate, today } = useApp();
  return useCallback(
    (o: Occurrence, skipped: boolean) => {
      const key = occurrenceKey(o);
      return mutate(
        (d) => ({
          ...d,
          dismissals: [
            ...d.dismissals.filter((x) => occurrenceKey(x) !== key),
            ...(skipped ? [{ id: tempId(), ...o, date: today }] : []),
          ],
        }),
        () => setSkipped({ ...o, skipped }),
      );
    },
    [mutate, today],
  );
}

export interface MuteChange {
  kind: MuteKind;
  benefitId: string | null;
  muted: boolean;
}

/** Turn a card's recurring reminders off / back on (optimistic): rotating activation, or individual credits/perks. */
export function useSetMutes() {
  const { mutate, today } = useApp();
  return useCallback(
    (holdingId: string, changes: MuteChange[]) => {
      if (!changes.length) return Promise.resolve(true);
      const keys = new Set(changes.map((c) => muteKey({ ...c, holdingId })));
      return mutate(
        (d) => ({
          ...d,
          mutes: [
            ...d.mutes.filter((m) => !keys.has(muteKey(m))),
            ...changes.filter((c) => c.muted).map((c) => ({ id: tempId(), holdingId, kind: c.kind, benefitId: c.benefitId, date: today })),
          ],
        }),
        () => setMutes({ holdingId, mutes: changes }),
      );
    },
    [mutate, today],
  );
}
