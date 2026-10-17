"use client";

import { isMuted } from "@/lib/domain/skips";
import type { MuteKind } from "@/lib/domain/types";
import { useApp } from "./AppState";
import { useSetMutes } from "./mutations";

/**
 * "Don't remind me" as a switch: on = Up next reminds you (default), off =
 * muted for this card until switched back on. Only for recurring reminders
 * (rotating activation, credits and perks), never payments or annual fees.
 */
export function ReminderSwitch({
  holdingId,
  kind,
  benefitId = null,
  name,
}: {
  holdingId: string;
  kind: MuteKind;
  benefitId?: string | null;
  /** What the reminder is about, for the accessible name ("Reminders: Lyft in-app credit"). */
  name: string;
}) {
  const { data } = useApp();
  const setMutes = useSetMutes();
  const on = !isMuted(data.mutes, holdingId, kind, benefitId);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Reminders: ${name}`}
      data-testid={`reminders-${kind === "rotating" ? "rotating" : benefitId}`}
      onClick={() => setMutes(holdingId, [{ kind, benefitId, muted: on }])}
      className="inline-flex min-h-10 shrink-0 items-center gap-2 font-mono text-[11px] tracking-wider whitespace-nowrap text-muted uppercase hover:text-text"
    >
      <span
        aria-hidden
        className={`relative inline-block h-4 w-7 rounded-full border transition-colors ${on ? "border-transparent bg-btn" : "border-muted bg-transparent"}`}
      >
        <span
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-[left] ${on ? "left-[14px] bg-btn-text" : "left-[2px] bg-muted"}`}
        />
      </span>
      {on ? "Reminders on" : "Reminders off"}
    </button>
  );
}
