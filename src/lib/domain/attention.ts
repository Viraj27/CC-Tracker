import type { Benefit, Catalog } from "../catalog/schema";
import { addDays, diffDays, formatDate, quarterOf } from "./dates";
import { benefitShortName, cardFor, holdingName } from "./holdings";
import { enrollmentView } from "./enrollment";
import { benefitStatus, isBenefitActive } from "./periods";
import { paymentSchedule } from "./payments";
import { nextAfDate } from "./roi";
import { isActivated, quarterView } from "./rotating";
import { occurrenceKey, type Occurrence } from "./skips";
import type { MuteKind, SkipKind, UserData } from "./types";
import { bonusLabel, expectedPostBy, leftToSpend, offerDeadline, offerFor, offerMetDate, offerStatus, OVERDUE_TAIL_DAYS } from "./welcomeBonus";

export type AttentionKind = SkipKind;

export interface AttentionItem {
  /** The stable occurrence key (`occurrenceKey(occurrence)`), e.g. `rotating:<holding>:2026-Q4`. */
  id: string;
  /** What a Skip records: kind + holding + benefit + period/date. */
  occurrence: Occurrence;
  /** "Skip this <periodNoun>" (recurring reminders); null when the occurrence is one date. */
  periodNoun: "month" | "quarter" | "half" | "year" | null;
  /** The permanent "Don't remind me" this item offers (rotating, credits); never payments or fees. */
  mute: { kind: MuteKind; benefitId: string | null } | null;
  /** Unverified items: the item they annotate (hidden with it). */
  parentId?: string;
  kind: AttentionKind;
  holdingId: string;
  title: string;
  detail: string;
  /** Days until the deadline (negative = overdue). Sort key. */
  daysUntil: number;
  date: string;
  href: string;
  /** Past-due payments are highlighted. */
  severity: "critical" | "warning" | "info";
  /** Structured parts for compact views (the Wallet's Up next strip). */
  cardName: string;
  /** The title without the card name, e.g. "$10 Lyft in-app credit left". */
  label: string;
  /** One-line row title: the thing itself, e.g. "Lyft", "Payment due", "Annual fee", "Activate Q4 5%". */
  short: string;
  /** USD at stake (fee, credit remaining), when known. */
  amount: number | null;
  /** Shown in place of `amount` when the stake isn't dollars, e.g. `60K pts`. */
  amountText?: string;
  /** Credits: the benefit to log against. */
  benefitId?: string;
  benefitName?: string;
  /** Payments: the statement month (YYYY-MM) and its due date. */
  month?: string;
  /** Rotating: the quarter to activate (YYYY-Qn). */
  quarter?: string;
}

const PERIOD_NOUN: Partial<Record<Benefit["cycle"], AttentionItem["periodNoun"]>> = {
  monthly: "month",
  quarterly: "quarter",
  semiannual: "half",
  calendar_year: "year",
  cardmember_year: "year",
};

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function buildAttention(catalog: Catalog, data: UserData, today: string): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { settings } = data;
  const unverified = (what: string, base: AttentionItem) => {
    const occurrence: Occurrence = {
      kind: "unverified",
      holdingId: base.holdingId,
      benefitId: base.occurrence.benefitId,
      period: `${base.kind}@${base.occurrence.period}`,
    };
    items.push({
      ...base,
      id: occurrenceKey(occurrence),
      occurrence,
      periodNoun: null,
      mute: null,
      parentId: base.id,
      kind: "unverified",
      title: `Unverified catalog data: ${what}`,
      label: `Unverified: ${what}`,
      short: `Verify: ${base.short}`,
      detail: `Affects “${base.title}”. Check the official source before acting.`,
      severity: "info",
    });
  };
  const occ = (kind: SkipKind, holdingId: string, period: string, benefitId: string | null = null) => {
    const occurrence: Occurrence = { kind, holdingId, benefitId, period };
    return { id: occurrenceKey(occurrence), occurrence };
  };

  for (const h of data.holdings) {
    if (h.status !== "open") continue;
    const card = cardFor(h, catalog);
    const name = holdingName(h, card);
    const href = `/cards/${h.id}`;

    // Annual fee posting within lead time.
    const fee = card?.annual_fee.amount ?? null;
    if (card && fee !== 0) {
      const { date, estimated } = nextAfDate(h, today);
      const days = diffDays(today, date);
      const windowStart = addDays(date, -settings.afLeadDays);
      const handled =
        data.afEvents.some((e) => e.holdingId === h.id && e.postedDate >= windowStart && e.postedDate <= date) ||
        data.lifecycle.some((e) => e.holdingId === h.id && e.date >= windowStart && e.date <= date);
      if (days <= settings.afLeadDays && !handled) {
        const item: AttentionItem = {
          ...occ("af", h.id, date),
          periodNoun: null,
          mute: null,
          kind: "af",
          holdingId: h.id,
          title: `${name}: ${fee === null ? "annual fee" : `${usd(fee)} annual fee`} posts ${formatDate(date)}${estimated ? " (est.)" : ""}`,
          cardName: name,
          label: `${fee === null ? "Annual fee" : `${usd(fee)} annual fee`} posts${estimated ? " (est.)" : ""}`,
          short: "Annual fee",
          amount: fee,
          detail: "Call for retention / downgrade / cancel? See downgrade options.",
          daysUntil: days,
          date,
          href: `${href}#downgrade`,
          severity: days <= 7 ? "critical" : "warning",
        };
        items.push(item);
        if (!card.annual_fee.verified) unverified(`${card.name} annual fee`, item);
      }
    }

    // Credits expiring within lead time with value left.
    for (const b of card?.benefits ?? []) {
      if (b.kind !== "credit" || b.amount === null) continue;
      if (b.cycle === "per_use" || b.cycle === "none" || b.cycle === "one_time") continue;
      const s = benefitStatus(b, h, data.usages, today);
      if (!s.active || s.remaining === null || s.remaining <= 0 || s.daysToExpiry === null) continue;
      if (s.daysToExpiry > settings.creditLeadDays) continue;
      const item: AttentionItem = {
        ...occ("credit", h.id, s.period.key, b.id),
        periodNoun: PERIOD_NOUN[b.cycle] ?? null,
        mute: { kind: "benefit", benefitId: b.id },
        kind: "credit",
        holdingId: h.id,
        title: `${name}: ${usd(s.remaining)} ${b.name} left`,
        cardName: name,
        label: `${usd(s.remaining)} ${b.name} left`,
        short: benefitShortName(b),
        amount: s.remaining,
        benefitId: b.id,
        benefitName: b.name,
        detail: `Expires ${formatDate(s.period.expiry)}${b.enrollment_required ? " · enrollment required" : ""}`,
        daysUntil: s.daysToExpiry,
        date: s.period.expiry!,
        href: `${href}#benefit-${b.id}`,
        severity: s.daysToExpiry <= 7 ? "critical" : "warning",
      };
      items.push(item);
      if (!b.verified) unverified(`${card!.name} — ${b.name}`, item);
    }

    // Re-enrollment due within lead time, or lapsed (docs/SPEC-v7-phone-feedback.md §1.3).
    // Muted with the benefit's own Reminders switch.
    for (const b of card?.benefits ?? []) {
      if (!isBenefitActive(b, today)) continue;
      const e = enrollmentView(b, h, data.enrollments, today);
      if (!e.lapsesOn || (e.state !== "enrolled" && e.state !== "lapsed")) continue;
      const days = diffDays(today, e.lapsesOn);
      if (days > settings.creditLeadDays) continue;
      const lapsed = e.state === "lapsed";
      const item: AttentionItem = {
        ...occ("enroll", h.id, e.lapsesOn, b.id),
        periodNoun: null,
        mute: { kind: "benefit", benefitId: b.id },
        kind: "enroll",
        holdingId: h.id,
        title: `${name}: re-enroll in ${b.name}`,
        cardName: name,
        label: `Re-enroll in ${b.name}`,
        short: `Re-enroll: ${benefitShortName(b)}`,
        amount: null,
        benefitId: b.id,
        benefitName: b.name,
        detail: `${lapsed ? "Enrollment lapsed" : "Enrollment lapses"} ${formatDate(e.lapsesOn)}${b.how_to_use ? ` · ${b.how_to_use}` : ""}`,
        daysUntil: days,
        date: e.lapsesOn,
        href: `${href}#benefit-${b.id}`,
        severity: "warning",
      };
      items.push(item);
      if (!b.verified) unverified(`${card!.name} — ${b.name}`, item);
    }

    // Welcome bonus (docs/SPEC-v6-welcome-bonus.md §3): the spend deadline, then a
    // bonus that was met but hasn't posted. Skippable; never muted.
    const offer = offerFor(data.welcomeOffers, h.id);
    if (offer) {
      const status = offerStatus(offer, h, today);
      const deadline = offerDeadline(offer, h);
      const bonus = bonusLabel(offer);
      if ((status === "earning" || status === "overdue") && deadline) {
        const days = diffDays(today, deadline.date);
        if (days <= settings.subLeadDays && days >= -OVERDUE_TAIL_DAYS) {
          const left = leftToSpend(offer);
          const short =
            status === "overdue"
              ? "Deadline passed"
              : left === null || left === 0
                ? "Confirm bonus met"
                : `Spend ${usd(left)}${offer.spentSoFar ? " more" : ""}`;
          items.push({
            ...occ("sub", h.id, deadline.date),
            periodNoun: null,
            mute: null,
            kind: "sub",
            holdingId: h.id,
            title: `${name}: ${short} for the ${bonus} welcome bonus by ${formatDate(deadline.date)}${deadline.estimated ? " (est.)" : ""}`,
            cardName: name,
            label: `${short} for the ${bonus} welcome bonus`,
            short,
            amount: null,
            amountText: bonus,
            detail:
              status === "overdue"
                ? "Mark it met if you made the spend in time, or missed."
                : `Welcome bonus deadline${deadline.estimated ? " (estimated from the approval date; check the issuer's tracker)" : ""}.`,
            daysUntil: days,
            date: deadline.date,
            href: `${href}#bonus`,
            severity: days <= 7 ? "critical" : "warning",
          });
        }
      }
      if (status === "met") {
        const met = offerMetDate(offer, h)!;
        const by = expectedPostBy(offer, h, settings)!;
        if (today >= by) {
          items.push({
            ...occ("subpost", h.id, met),
            periodNoun: null,
            mute: null,
            kind: "subpost",
            holdingId: h.id,
            title: `${name}: ${bonus} welcome bonus not posted yet (expected by ${formatDate(by)})`,
            cardName: name,
            label: `${bonus} welcome bonus not posted`,
            short: "Bonus not posted",
            amount: null,
            amountText: bonus,
            detail: "Check the account, then mark it posted. Contact the issuer if it's missing.",
            daysUntil: diffDays(today, by),
            date: by,
            href: `${href}#bonus`,
            severity: "warning",
          });
        }
      }
    }

    // Payments due within lead time, and past-due ones.
    for (const p of paymentSchedule(
      h,
      data.payments,
      today,
      settings.paymentLeadDays,
      settings.paymentTrackingStart,
    )) {
      if (p.state !== "due_soon" && p.state !== "past_due") continue;
      items.push({
        ...occ("payment", h.id, p.month),
        periodNoun: null,
        mute: null,
        kind: "payment",
        holdingId: h.id,
        title: p.state === "past_due" ? `${name}: payment PAST DUE` : `${name}: payment due ${formatDate(p.dueDate)}`,
        cardName: name,
        label: p.state === "past_due" ? "Payment past due" : "Payment due",
        short: p.state === "past_due" ? "Payment past due" : "Payment due",
        amount: null,
        month: p.month,
        detail: p.state === "past_due" ? `Was due ${formatDate(p.dueDate)} — mark paid once settled.` : "Not marked paid yet.",
        daysUntil: p.daysUntilDue,
        date: p.dueDate,
        href: "/payments",
        severity: p.state === "past_due" ? "critical" : p.daysUntilDue <= 2 ? "critical" : "warning",
      });
    }

    // Rotating 5% quarter not activated.
    const program = card?.rotating_program ? catalog.rotating.find((r) => r.id === card.rotating_program) : undefined;
    if (program) {
      const quarter = quarterOf(today);
      const qv = quarterView(program, quarter);
      if (qv.announced && !isActivated(data.activations, h.id, quarter)) {
        const deadline = qv.entry!.activation_deadline;
        const days = deadline ? diffDays(today, deadline) : 0;
        if (!deadline || days >= 0) {
          const item: AttentionItem = {
            ...occ("rotating", h.id, quarter),
            periodNoun: "quarter",
            mute: { kind: "rotating", benefitId: null },
            kind: "rotating",
            holdingId: h.id,
            title: `${name}: activate ${quarter} 5% categories`,
            cardName: name,
            label: `Activate ${quarter} 5% categories`,
            short: `Activate ${quarter.slice(5)} ${program.rate.value}${program.rate.unit === "percent" ? "%" : "x"}`,
            amount: null,
            quarter,
            detail: `${qv.entry!.categories.map((c) => c.name).join(", ")}${deadline ? ` · activate by ${formatDate(deadline)}` : ""}`,
            daysUntil: days,
            date: deadline ?? today,
            href: "/rotating",
            severity: "warning",
          };
          items.push(item);
          if (!qv.entry!.verified) unverified(`${program.name} ${quarter} calendar`, item);
        }
      }
    }
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return items.sort((a, b) => a.daysUntil - b.daysUntil || rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));
}
