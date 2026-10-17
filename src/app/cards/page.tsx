"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useApp } from "@/components/AppState";
import { useHoldingViews } from "@/components/derived";
import { HoldingForm } from "@/components/HoldingForm";
import { Badge, CardBar, Group, GroupLabel, PageTitle } from "@/components/ui";
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
    <div className="flex flex-col">
      <PageTitle help="Catalog facts come from catalog/. Your cards and everything you log stay in your own database.">
        {editing ? "Edit card" : "Add card"}
      </PageTitle>

      <GroupLabel>{editing ? `Edit · ${views.find((v) => v.holding === editing)?.name}` : "New card"}</GroupLabel>
      <div className="rounded-[14px] bg-list p-4">
        <HoldingForm
          key={editing?.id ?? "new"}
          initial={editing}
          onDone={(id) => router.push(id ? `/cards/${id}` : "/")}
          onDeleted={() => router.push("/")}
        />
      </div>

      <GroupLabel>All cards · {views.length}</GroupLabel>
      <Group>
        {views.map((v) => (
          <li key={v.holding.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
            <CardBar color={v.color} />
            <Link href={`/cards/${v.holding.id}`} className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-semibold hover:underline">{v.name}</span>
                {v.holding.status !== "open" && <Badge tone="warn">{v.holding.status.replace("_", " ")}</Badge>}
              </span>
              <span className="block font-mono text-[11px] tracking-wider text-muted uppercase">Opened {shortDate(v.holding.approvalDate, today)}</span>
            </Link>
            <Link href={`/cards/${v.holding.id}#edit`} aria-label={`Edit ${v.name}`} className="min-h-9 shrink-0 py-2 text-sm font-medium underline-offset-4 hover:underline">
              Edit
            </Link>
          </li>
        ))}
      </Group>
    </div>
  );
}
