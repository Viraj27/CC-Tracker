"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Wallet } from "@/components/Wallet";

/** Deep link to a card: the same Wallet view with that card selected. */
export default function CardPage() {
  return (
    <Suspense>
      <WalletFromPath />
    </Suspense>
  );
}

function WalletFromPath() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  return <Wallet url="path" selectedId={decodeURIComponent(id)} logBenefitId={params.get("log")} />;
}
