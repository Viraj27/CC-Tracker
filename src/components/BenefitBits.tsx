"use client";

import { Fragment } from "react";
import type { Benefit } from "@/lib/catalog/schema";
import { periodRange, shortDate } from "@/lib/domain/dates";
import type { EnrollmentView } from "@/lib/domain/enrollment";
import type { CreditView } from "@/lib/domain/periods";
import { Badge } from "./ui";

/**
 * Small shared pieces for credit rows and benefit sheets
 * (docs/SPEC-v7-phone-feedback.md §1–2).
 */

/** `Requires enrollment` until marked enrolled; `Re-enroll` once that lapses. */
export function EnrollmentBadge({ e }: { e: EnrollmentView }) {
  if (e.state === "needed") return <Badge tone="accent">Requires enrollment</Badge>;
  if (e.state === "lapsed") return <Badge tone="accent">Re-enroll</Badge>;
  return null;
}

/** The date the issuer stops offering the benefit, always with the year. */
export const benefitEndsText = (b: Benefit) => (b.ends_on ? `Benefit ends ${shortDate(b.ends_on)}` : null);

/** Greyed rows: this period is used up, or the benefit hasn't started / has ended. */
export const isGreyed = (cv: CreditView) => cv.state !== "open";

/**
 * The period line, e.g. `SEMIANNUAL · JUL–DEC · EXPIRES 31 DEC`, or for a used-up
 * credit `SEMIANNUAL · JAN–JUN 2027 · OPENS 1 JAN`. `urgent` marks the expiry.
 * The parts are wrap points: callers that allow wrapping get whole parts per line.
 */
export function PeriodLine({ benefit: b, cv, cycleLabel, today, urgent }: { benefit: Benefit; cv: CreditView; cycleLabel: string; today: string; urgent: boolean }) {
  const p = cv.shown;
  const range = p.start && p.end ? periodRange(p.start, p.end, today) : null;
  let tail: React.ReactNode = null;
  switch (cv.state) {
    case "open":
      tail = p.expiry && (
        <>
          EXPIRES <span className={urgent ? "font-bold text-urgent" : ""}>{shortDate(p.expiry, today)}</span>
        </>
      );
      break;
    case "used_upcoming":
    case "not_started":
      // The range before it already carries the year: `JAN–JUN 2027 · OPENS 1 JAN`.
      tail = `OPENS ${shortDate(cv.opensOn, range ? cv.opensOn ?? today : today)}`;
      break;
    case "used_final":
      tail = "USED";
      break;
    case "ended":
      tail = "ENDED";
      break;
  }
  const parts: React.ReactNode[] = [cycleLabel.toUpperCase(), cv.state === "ended" || cv.state === "used_final" ? null : range, tail].filter(Boolean);
  // Each part stays whole, so a line too long for a 390px row wraps between parts, never inside a date.
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && "\u00a0· "}
          <span className="whitespace-nowrap">{part}</span>
        </Fragment>
      ))}
    </>
  );
}
