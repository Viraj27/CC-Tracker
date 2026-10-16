import type { Catalog } from "../catalog/schema";
import { addDays, diffDays, formatDate, quarterOf } from "./dates";
import { cardFor, holdingName } from "./holdings";
import { benefitStatus } from "./periods";
import { paymentSchedule } from "./payments";
import { nextAfDate } from "./roi";
import { isActivated, quarterView } from "./rotating";
import type { UserData } from "./types";

export type AttentionKind = "af" | "credit" | "payment" | "rotating" | "unverified";

export interface AttentionItem {
  id: string;
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
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function buildAttention(catalog: Catalog, data: UserData, today: string): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { settings } = data;
  const unverified = (id: string, holdingId: string, what: string, base: AttentionItem) =>
    items.push({
      ...base,
      id: `unverified:${id}`,
      kind: "unverified",
      holdingId,
      title: `Unverified catalog data: ${what}`,
      detail: `Affects “${base.title}”. Check the official source before acting.`,
      severity: "info",
    });

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
          id: `af:${h.id}:${date}`,
          kind: "af",
          holdingId: h.id,
          title: `${name}: ${fee === null ? "annual fee" : `${usd(fee)} annual fee`} posts ${formatDate(date)}${estimated ? " (est.)" : ""}`,
          detail: "Call for retention / downgrade / cancel? See downgrade options.",
          daysUntil: days,
          date,
          href: `${href}#downgrade`,
          severity: days <= 7 ? "critical" : "warning",
        };
        items.push(item);
        if (!card.annual_fee.verified) unverified(`af:${h.id}`, h.id, `${card.name} annual fee`, item);
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
        id: `credit:${h.id}:${b.id}:${s.period.key}`,
        kind: "credit",
        holdingId: h.id,
        title: `${name}: ${usd(s.remaining)} ${b.name} left`,
        detail: `Expires ${formatDate(s.period.expiry)}${b.enrollment_required ? " · enrollment required" : ""}`,
        daysUntil: s.daysToExpiry,
        date: s.period.expiry!,
        href: `${href}#benefit-${b.id}`,
        severity: s.daysToExpiry <= 7 ? "critical" : "warning",
      };
      items.push(item);
      if (!b.verified) unverified(`credit:${h.id}:${b.id}`, h.id, `${card!.name} — ${b.name}`, item);
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
        id: `payment:${h.id}:${p.month}`,
        kind: "payment",
        holdingId: h.id,
        title: p.state === "past_due" ? `${name}: payment PAST DUE` : `${name}: payment due ${formatDate(p.dueDate)}`,
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
            id: `rotating:${h.id}:${quarter}`,
            kind: "rotating",
            holdingId: h.id,
            title: `${name}: activate ${quarter} 5% categories`,
            detail: `${qv.entry!.categories.map((c) => c.name).join(", ")}${deadline ? ` · activate by ${formatDate(deadline)}` : ""}`,
            daysUntil: days,
            date: deadline ?? today,
            href: "/rotating",
            severity: "warning",
          };
          items.push(item);
          if (!qv.entry!.verified) unverified(`rotating:${h.id}:${quarter}`, h.id, `${program.name} ${quarter} calendar`, item);
        }
      }
    }
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return items.sort((a, b) => a.daysUntil - b.daysUntil || rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));
}
