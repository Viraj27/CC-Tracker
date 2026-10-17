"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Wallet } from "@/components/Wallet";

export default function Home() {
  return (
    <Suspense>
      <WalletFromQuery />
    </Suspense>
  );
}

function WalletFromQuery() {
  const params = useSearchParams();
  return <Wallet url="query" selectedId={params.get("card")} logBenefitId={params.get("log")} />;
}
