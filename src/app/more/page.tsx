"use client";

import { MORE_LINKS } from "@/components/Nav";
import { useUnseenDeals } from "@/components/derived";
import { Badge, Group, PageTitle, Row } from "@/components/ui";

/** The phone's "More" tab: the screens that don't get their own tab. */
export default function MorePage() {
  const unseen = useUnseenDeals();
  return (
    <div className="flex flex-col gap-3">
      <PageTitle>More</PageTitle>
      <Group>
        {MORE_LINKS.map((l) => (
          <Row key={l.href} title={l.label} href={l.href} chevron badges={l.href === "/deals" && unseen > 0 ? <Badge tone="accent">New</Badge> : undefined} />
        ))}
      </Group>
    </div>
  );
}
