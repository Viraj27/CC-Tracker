"use client";

import { useState } from "react";
import { useUpNext } from "@/components/derived";
import { ShowSkipped, UpNextList } from "@/components/UpNext";
import { PageTitle } from "@/components/ui";

export default function UpNextPage() {
  const { visible, hidden } = useUpNext();
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <PageTitle right={hidden.length > 0 && <ShowSkipped count={hidden.length} shown={shown} onToggle={() => setShown((x) => !x)} controls="skipped-list" />}>
        Up next
      </PageTitle>
      <UpNextList items={visible} hidden={hidden} shown={shown} />
    </div>
  );
}
