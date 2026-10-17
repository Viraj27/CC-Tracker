"use client";

import { useApp } from "@/components/AppState";
import { useUpNext } from "@/components/derived";
import { UpNextList } from "@/components/UpNext";
import { PageTitle } from "@/components/ui";

export default function UpNextPage() {
  const { data } = useApp();
  const { visible, hidden } = useUpNext();
  const s = data.settings;
  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        sub={`Annual fees within ${s.afLeadDays} days, credits expiring within ${s.creditLeadDays}, payments due within ${s.paymentLeadDays} or past due, rotating quarters to activate, and unverified facts behind any of them. Soonest first. Skip hides one occurrence; skipped items stay under “skipped · show”.`}
      >
        Up next
      </PageTitle>
      <UpNextList items={visible} hidden={hidden} />
    </div>
  );
}
