"use client";

import Link from "next/link";
import { useApp } from "@/components/AppState";
import { use524, useAttention, useHoldingViews } from "@/components/derived";
import { Badge, CardSwatch, Empty, PageTitle, Progress, Section, TextLink, usd } from "@/components/ui";
import type { AttentionKind } from "@/lib/domain/attention";
import { formatDate } from "@/lib/domain/dates";

const KIND_LABEL: Record<AttentionKind, string> = {
  af: "Annual fee",
  credit: "Credit",
  payment: "Payment",
  rotating: "Activate",
  unverified: "Verify",
};

export default function Dashboard() {
  const { data } = useApp();
  const views = useHoldingViews();
  const attention = useAttention();
  const { status } = use524();

  if (data.holdings.length === 0) {
    return (
      <>
        <PageTitle>Welcome</PageTitle>
        <Section title="Get started">
          <p className="text-sm">
            No cards yet. <TextLink href="/settings#import">Import your seed file</TextLink> (e.g. <code>seed/my-cards.json</code>) or{" "}
            <TextLink href="/cards">add a card</TextLink>.
          </p>
        </Section>
      </>
    );
  }

  const open = views.filter((v) => v.holding.status === "open");

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Dashboard</PageTitle>

      <Section title="5/24 status" action={<TextLink href="/eligibility">Details →</TextLink>}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-3xl font-bold" data-testid="five24-count">
            {status.count}
            <span className="text-lg font-normal text-muted">/24</span>
          </p>
          <Badge tone={status.underLimit ? "ok" : "danger"}>{status.underLimit ? "Under 5/24" : "At or over 5/24"}</Badge>
          <p className="text-sm text-muted">
            {status.nextDropOff
              ? `Next drop-off: ${status.nextDropOff.name} on ${formatDate(status.nextDropOff.dropOffDate)}`
              : "No counted accounts."}
          </p>
        </div>
      </Section>

      <Section title={`Needs attention (${attention.length})`}>
        {attention.length === 0 ? (
          <Empty>Nothing needs attention right now.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border" data-testid="attention-list">
            {attention.map((a) => (
              <li key={a.id} className="py-2">
                <Link href={a.href} className="group flex items-start gap-3 rounded-md">
                  <span className="mt-0.5 w-20 shrink-0">
                    <Badge tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warn" : "info"}>
                      {KIND_LABEL[a.kind]}
                    </Badge>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-medium group-hover:underline ${a.severity === "critical" ? "text-danger" : ""}`}>
                      {a.title}
                    </span>
                    <span className="block text-sm text-muted">{a.detail}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {a.daysUntil < 0 ? `${-a.daysUntil}d late` : a.daysUntil === 0 ? "today" : `${a.daysUntil}d`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Cards">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((v) => (
            <li key={v.holding.id}>
              <Link
                href={`/cards/${v.holding.id}`}
                className="flex h-full flex-col gap-2 rounded-lg border border-border p-3 hover:border-accent"
                style={{ borderLeft: `4px solid ${v.color}` }}
                data-testid={`card-tile-${v.holding.id}`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <CardSwatch color={v.color} />
                  <span className="truncate">{v.name}</span>
                </span>
                <span className="text-xs text-muted">
                  Utilization{" "}
                  <span data-testid="utilization">{v.util.pct === null ? "—" : `${Math.round(v.util.pct * 100)}%`}</span>
                  {v.util.available > 0 && ` · ${usd(v.util.used)} of ${usd(v.util.available)} this cycle`}
                </span>
                <Progress value={v.util.pct} color={v.color} />
                <span className="text-xs text-muted">
                  {v.roi.annualFee > 0 ? (
                    <>
                      ROI: <span data-testid="roi">{usd(v.roi.realized)}</span> vs {usd(v.roi.annualFee)} AF ·{" "}
                      <span className={v.roi.net >= 0 ? "text-ok" : "text-danger"}>
                        {v.roi.net >= 0 ? "+" : ""}
                        {usd(v.roi.net)}
                      </span>
                    </>
                  ) : (
                    <>No annual fee · {usd(v.roi.realized)} realized</>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
