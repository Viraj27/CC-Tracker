"use client";

import { setPaymentPaid } from "@/app/actions";
import { tempId, useApp } from "@/components/AppState";
import { useHoldingViews } from "@/components/derived";
import { Badge, CardSwatch, Empty, PageTitle, Section, TextLink } from "@/components/ui";
import { formatDate } from "@/lib/domain/dates";
import { paymentSchedule, type PaymentState } from "@/lib/domain/payments";

const TONE: Record<PaymentState, "ok" | "danger" | "warn" | "info"> = {
  paid: "ok",
  past_due: "danger",
  due_soon: "warn",
  upcoming: "info",
};
const LABEL: Record<PaymentState, string> = { paid: "Paid", past_due: "Past due", due_soon: "Due soon", upcoming: "Upcoming" };

export default function PaymentsPage() {
  const { data, today, mutate } = useApp();
  const views = useHoldingViews().filter((v) => v.holding.status === "open");

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub={`All cards are manual pay. Unpaid within ${data.settings.paymentLeadDays} days shows on the dashboard.`}>
        Payments
      </PageTitle>
      {views.length === 0 && <Empty>No open cards.</Empty>}
      {views.map((v) => {
        const rows = paymentSchedule(
          v.holding,
          data.payments,
          today,
          data.settings.paymentLeadDays,
          data.settings.paymentTrackingStart,
        );
        return (
          <Section
            key={v.holding.id}
            title={
              <span className="flex items-center gap-2">
                <CardSwatch color={v.color} /> {v.name}
              </span>
            }
          >
            {!v.holding.paymentDueDay ? (
              <Empty>
                No payment due day set. <TextLink href={`/cards?edit=${v.holding.id}`}>Set it</TextLink>.
              </Empty>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <li
                    key={r.month}
                    className={`flex flex-wrap items-center gap-3 py-2 ${r.state === "past_due" ? "rounded-md bg-danger/10 px-2" : ""}`}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={r.paid}
                        aria-label={`Mark ${v.name} payment due ${formatDate(r.dueDate)} as paid`}
                        onChange={(e) => {
                          const paid = e.target.checked;
                          mutate(
                            (d) => {
                              const others = d.payments.filter((p) => !(p.holdingId === v.holding.id && p.statementMonth === r.month));
                              return {
                                ...d,
                                payments: [
                                  ...others,
                                  { id: tempId(), holdingId: v.holding.id, statementMonth: r.month, dueDate: r.dueDate, paid, paidDate: paid ? today : null },
                                ],
                              };
                            },
                            () => setPaymentPaid({ holdingId: v.holding.id, month: r.month, dueDate: r.dueDate, paid }),
                          );
                        }}
                      />
                      <span>Due {formatDate(r.dueDate)}</span>
                    </label>
                    <Badge tone={TONE[r.state]}>{LABEL[r.state]}</Badge>
                    {r.paidDate && <span className="text-xs text-muted">paid {formatDate(r.paidDate)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        );
      })}
    </div>
  );
}
