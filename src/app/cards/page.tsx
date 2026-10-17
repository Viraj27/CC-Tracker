"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useApp } from "@/components/AppState";
import { useHoldingViews } from "@/components/derived";
import { HoldingForm } from "@/components/HoldingForm";
import { Badge, CardSwatch, PageTitle, Section } from "@/components/ui";
import { shortDate } from "@/lib/domain/dates";

/** Add a card (catalog or custom) and list every card, open or not. `?edit=<id>` edits one here. */
export default function CardsPage() {
  return (
    <Suspense>
      <Cards />
    </Suspense>
  );
}

function Cards() {
  const { today } = useApp();
  const views = useHoldingViews();
  const params = useSearchParams();
  const router = useRouter();
  const editing = views.find((v) => v.holding.id === params.get("edit"))?.holding;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="Catalog facts come from catalog/; your cards and everything you log stay in your own database.">
        {editing ? "Edit card" : "Add card"}
      </PageTitle>

      <Section title={editing ? `Edit · ${views.find((v) => v.holding === editing)?.name}` : "New card"}>
        <HoldingForm
          key={editing?.id ?? "new"}
          initial={editing}
          onDone={(id) => router.push(id ? `/cards/${id}` : "/")}
          onDeleted={() => router.push("/")}
        />
      </Section>

      <Section title={`All cards · ${views.length}`}>
        <ul className="divide-y divide-hairline">
          {views.map((v) => (
            <li key={v.holding.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <CardSwatch color={v.color} />
              <Link href={`/cards/${v.holding.id}`} className="min-w-0 flex-1 font-semibold hover:underline">
                {v.name}
              </Link>
              {v.holding.status !== "open" && <Badge tone="warn">{v.holding.status.replace("_", " ")}</Badge>}
              <span className="font-mono text-xs tracking-wider text-muted uppercase">opened {shortDate(v.holding.approvalDate, today)}</span>
              <Link href={`/cards/${v.holding.id}#edit`} className="min-h-9 py-2 text-sm font-medium underline-offset-4 hover:underline">
                Edit
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
