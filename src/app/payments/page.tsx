"use client";

import { useApp } from "@/components/AppState";
import { useHoldingViews } from "@/components/derived";
import { useSetPaid } from "@/components/mutations";
import { Badge, CardSwatch, Empty, Group, GroupLabel, PageTitle, Row } from "@/components/ui";
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
    <div className="flex flex-col">
      <PageTitle help={`All cards are manual pay. Unpaid statements within ${data.settings.paymentLeadDays} days show in Up next.`}>Payments</PageTitle>
      {views.length === 0 && <Empty>No open cards.</Empty>}
      {views.map((v) => {
        const rows = paymentSchedule(v.holding, data.payments, today, data.settings.paymentLeadDays, data.settings.paymentTrackingStart);
        return (
          <section key={v.holding.id} aria-label={v.name}>
            <GroupLabel right={v.holding.paymentDueDay ? <span className="font-mono text-[11px] tracking-wider text-muted uppercase">Due day {v.holding.paymentDueDay}</span> : undefined}>
              <span className="flex items-center gap-2">
                <CardSwatch color={v.color} />
                {v.name}
              </span>
            </GroupLabel>
            <Group>
              {!v.holding.paymentDueDay ? (
                <Row title="No payment due day" sub="Set it in Edit card" href={`/cards/${v.holding.id}#edit`} chevron />
              ) : (
                rows.map((r) => (
                  <li key={r.month} className={`flex min-h-12 items-center gap-3 px-4 py-1.5 ${r.state === "past_due" ? "text-urgent" : ""}`}>
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
                    {r.paidDate && <span className="font-mono text-[11px] tracking-wider text-muted uppercase">paid {shortDate(r.paidDate, today)}</span>}
                    <Badge tone={TONE[r.state]}>{LABEL[r.state]}</Badge>
                  </li>
                ))
              )}
            </Group>
          </section>
        );
      })}
    </div>
  );
}
