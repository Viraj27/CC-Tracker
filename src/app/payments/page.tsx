"use client";

import { useApp } from "@/components/AppState";
import { useHoldingViews } from "@/components/derived";
import { useSetPaid } from "@/components/mutations";
import { Badge, CardSwatch, Empty, PageTitle, Section, TextLink } from "@/components/ui";
import { formatDate, shortDate } from "@/lib/domain/dates";
import { paymentSchedule, type PaymentState } from "@/lib/domain/payments";

const TONE: Record<PaymentState, "ok" | "danger" | "warn" | "info"> = {
  paid: "ok",
  past_due: "danger",
  due_soon: "warn",
  upcoming: "info",
};
const LABEL: Record<PaymentState, string> = { paid: "Paid", past_due: "Past due", due_soon: "Due soon", upcoming: "Upcoming" };

export default function PaymentsPage() {
  const { data, today } = useApp();
  const setPaid = useSetPaid();
  const views = useHoldingViews().filter((v) => v.holding.status === "open");

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub={`All cards are manual pay. Unpaid within ${data.settings.paymentLeadDays} days shows in Up next.`}>Payments</PageTitle>
      {views.length === 0 && <Empty>No open cards.</Empty>}
      {views.map((v) => {
        const rows = paymentSchedule(v.holding, data.payments, today, data.settings.paymentLeadDays, data.settings.paymentTrackingStart);
        return (
          <Section
            key={v.holding.id}
            title={
              <span className="flex items-center gap-2 normal-case">
                <CardSwatch color={v.color} />
                <span className="font-sans text-base font-semibold tracking-normal text-text">{v.name}</span>
                {v.holding.paymentDueDay && <span>· due day {v.holding.paymentDueDay}</span>}
              </span>
            }
          >
            {!v.holding.paymentDueDay ? (
              <Empty>
                No payment due day set. <TextLink href={`/cards/${v.holding.id}#edit`}>Set it</TextLink>.
              </Empty>
            ) : (
              <ul className="divide-y divide-hairline">
                {rows.map((r) => (
                  <li key={r.month} className={`flex flex-wrap items-center gap-3 py-2 ${r.state === "past_due" ? "text-urgent" : ""}`}>
                    <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={r.paid}
                        aria-label={`Mark ${v.name} payment due ${formatDate(r.dueDate)} as paid`}
                        onChange={(e) => setPaid(v.holding.id, r.month, r.dueDate, e.target.checked)}
                      />
                      <span className="font-mono text-sm tracking-wider uppercase">Due {shortDate(r.dueDate, today)}</span>
                    </label>
                    <Badge tone={TONE[r.state]}>{LABEL[r.state]}</Badge>
                    {r.paidDate && <span className="font-mono text-xs tracking-wider text-muted uppercase">paid {shortDate(r.paidDate, today)}</span>}
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
