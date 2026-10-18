/**
 * Benefit enrollment (docs/SPEC-v7-phone-feedback.md §1.2–1.3): whether a benefit
 * that needs enrolling is enrolled, and when that enrollment lapses.
 */
import type { Benefit } from "../catalog/schema";
import { addDays, addMonths, parseIso, toIso } from "./dates";
import { benefitAnchor, computePeriod } from "./periods";
import type { BenefitEnrollment, Holding } from "./types";

export type EnrollmentState = "none" | "needed" | "enrolled" | "lapsed";

export interface EnrollmentView {
  /** none: no enrollment to track (not required, or tracked on the Rotating page). */
  state: EnrollmentState;
  /** The latest enrollment, if any. */
  latest: BenefitEnrollment | null;
  /** First day the latest enrollment no longer counts; null if it never lapses. */
  lapsesOn: string | null;
}

/** First day an enrollment made on `enrolledOn` no longer counts; null if it lasts for the holding. */
export function lapseDate(benefit: Benefit, holding: Holding, enrolledOn: string): string | null {
  const lasts = benefit.enrollment_lasts ?? "holding";
  if (lasts === "holding" || lasts === "rotating") return null;
  if (lasts === "calendar_year") return toIso(parseIso(enrolledOn).y + 1, 1, 1);
  if (lasts === "period") {
    const end = computePeriod(benefit.cycle, enrolledOn, benefitAnchor(benefit, holding)).end;
    return end ? addDays(end, 1) : null;
  }
  return addMonths(enrolledOn, lasts.months);
}

export function enrollmentView(
  benefit: Benefit,
  holding: Holding,
  enrollments: BenefitEnrollment[],
  today: string,
): EnrollmentView {
  if (!benefit.enrollment_required || benefit.enrollment_lasts === "rotating") return { state: "none", latest: null, lapsesOn: null };
  const latest =
    enrollments
      .filter((e) => e.holdingId === holding.id && e.benefitId === benefit.id && e.enrolledOn <= today)
      .sort((a, b) => b.enrolledOn.localeCompare(a.enrolledOn) || b.id.localeCompare(a.id))[0] ?? null;
  if (!latest) return { state: "needed", latest: null, lapsesOn: null };
  const lapsesOn = lapseDate(benefit, holding, latest.enrolledOn);
  return { state: lapsesOn && today >= lapsesOn ? "lapsed" : "enrolled", latest, lapsesOn };
}
