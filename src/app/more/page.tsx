"use client";

import { MORE_LINKS } from "@/components/Nav";
import { Group, PageTitle, Row } from "@/components/ui";

/** The phone's "More" tab: the screens that don't get their own tab. */
export default function MorePage() {
  return (
    <div className="flex flex-col gap-3">
      <PageTitle>More</PageTitle>
      <Group>
        {MORE_LINKS.map((l) => (
          <Row key={l.href} title={l.label} href={l.href} chevron />
        ))}
      </Group>
    </div>
  );
}
