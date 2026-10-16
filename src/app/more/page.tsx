"use client";

import Link from "next/link";
import { MORE_LINKS } from "@/components/Nav";
import { PageTitle } from "@/components/ui";

/** The phone's "More" tab: the screens that don't get their own tab. */
export default function MorePage() {
  return (
    <div className="flex flex-col gap-5">
      <PageTitle>More</PageTitle>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {MORE_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex min-h-14 items-center justify-between gap-3 py-3 hover:opacity-80">
              <span>
                <span className="block text-lg font-semibold">{l.label}</span>
                <span className="block text-sm text-muted">{l.sub}</span>
              </span>
              <span aria-hidden className="font-mono text-muted">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
