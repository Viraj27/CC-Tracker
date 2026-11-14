"use server";

/**
 * Server actions. Every mutation returns the fresh UserData snapshot so the
 * client can reconcile its optimistic state; nothing triggers a page reload.
 */
import { z } from "zod";
import { isoDate, SPEND_CATEGORIES } from "@/lib/catalog/schema";
import { localToday } from "@/lib/domain/dates";
import { muteKey, occurrenceKey } from "@/lib/domain/skips";
import type { UserData } from "@/lib/domain/types";
import { buildExport, ImportError, parseImport } from "@/lib/importExport";
import { getDb, PROFILE_ID } from "@/lib/server/db";
import { type ImportMode, loadUserData, settingsRow, writeImport } from "@/lib/server/userData";

const profileId = PROFILE_ID;
const prismaClient = async () => (await getDb()).prisma;
const snapshot = async () => loadUserData(await prismaClient(), profileId);
const optStr = z.string().trim().nullable().optional().transform((v) => (v ? v : null));

async function ownHolding(holdingId: string) {
  const prisma = await prismaClient();
  const h = await prisma.holding.findFirst({ where: { id: holdingId, profileId } });
  if (!h) throw new Error("Card not found");
  return h;
}

// ------------------------------------------------------------ holdings --

const HoldingInput = z
  .object({
    id: z.string().optional(),
    catalogCardId: optStr,
    nickname: optStr,
    issuer: optStr,
    accountType: z.enum(["personal", "business"]).nullable().optional().default(null),
    approvalDate: isoDate,
    status: z.enum(["open", "closed", "product_changed"]),
    closedDate: isoDate.nullable().optional().default(null),
    productChangedFromId: optStr,
    afMonth: z.number().int().min(1).max(12).nullable().optional().default(null),
    afDay: z.number().int().min(1).max(31).nullable().optional().default(null),
    afRefundDays: z.number().int().min(1).max(365).nullable().optional().default(null),
    paymentDueDay: z.number().int().min(1).max(31).nullable().optional().default(null),
    notes: optStr,
  })
  .refine((h) => h.catalogCardId || h.nickname, { message: "Pick a catalog card or enter a name" });

export async function saveHolding(input: z.input<typeof HoldingInput>): Promise<UserData> {
  const prisma = await prismaClient();
  const { id, ...h } = HoldingInput.parse(input);
  if (id) {
    await ownHolding(id);
    await prisma.holding.update({ where: { id }, data: h });
  } else {
    await prisma.holding.create({ data: { ...h, profileId } });
  }
  return snapshot();
}

export async function deleteHolding(id: string): Promise<UserData> {
  const prisma = await prismaClient();
  await ownHolding(id);
  await prisma.holding.delete({ where: { id } });
  return snapshot();
}

// -------------------------------------------------------- benefit usage --

const UsageInput = z.object({
  holdingId: z.string(),
  benefitId: z.string(),
  periodKey: z.string(),
  amount: z.number().nonnegative(),
  valueOverride: z.number().nonnegative().nullable().optional().default(null),
  date: isoDate,
  note: optStr,
});

export async function logUsage(input: z.input<typeof UsageInput>): Promise<UserData> {
  const prisma = await prismaClient();
  const u = UsageInput.parse(input);
  await ownHolding(u.holdingId);
  await prisma.benefitUsage.create({ data: { ...u, profileId } });
  return snapshot();
}

export async function deleteUsage(id: string): Promise<UserData> {
  const prisma = await prismaClient();
  await prisma.benefitUsage.deleteMany({ where: { id, profileId } });
  return snapshot();
}

// ---------------------------------------------------------- enrollment --

const EnrollmentInput = z.object({ holdingId: z.string(), benefitId: z.string(), enrolledOn: isoDate });

/** "Mark enrolled" (docs/SPEC-v7-phone-feedback.md §1.2). Adds to the history; the latest wins. */
export async function addEnrollment(input: z.input<typeof EnrollmentInput>): Promise<UserData> {
  const prisma = await prismaClient();
  const e = EnrollmentInput.parse(input);
  await ownHolding(e.holdingId);
  await prisma.benefitEnrollment.create({ data: { ...e, profileId } });
  return snapshot();
}

/** Undo a "Mark enrolled". */
export async function deleteEnrollment(id: string): Promise<UserData> {
  const prisma = await prismaClient();
  await prisma.benefitEnrollment.deleteMany({ where: { id, profileId } });
  return snapshot();
}

// -------------------------------------------------------- welcome bonus --

const OfferInput = z.object({
  holdingId: z.string(),
  bonusAmount: z.number().positive(),
  bonusUnit: z.enum(["points", "miles", "usd"]),
  program: optStr,
  minSpend: z.number().positive().nullable().optional().default(null),
  windowMonths: z.number().int().min(1).max(36).nullable().optional().default(null),
  deadline: isoDate.nullable().optional().default(null),
  spentSoFar: z.number().nonnegative().nullable().optional().default(null),
  spentAsOf: isoDate.nullable().optional().default(null),
  metDate: isoDate.nullable().optional().default(null),
  postedDate: isoDate.nullable().optional().default(null),
  postedAmount: z.number().nonnegative().nullable().optional().default(null),
  outcome: z.literal("missed").nullable().optional().default(null),
  note: optStr,
});

/** Create or replace a card's welcome offer (docs/SPEC-v6-welcome-bonus.md): one per holding. */
export async function saveWelcomeOffer(input: z.input<typeof OfferInput>): Promise<UserData> {
  const prisma = await prismaClient();
  const { holdingId, ...o } = OfferInput.parse(input);
  await ownHolding(holdingId);
  await prisma.welcomeOffer.upsert({ where: { holdingId }, create: { ...o, holdingId, profileId }, update: o });
  return snapshot();
}

export async function deleteWelcomeOffer(holdingId: string): Promise<UserData> {
  const prisma = await prismaClient();
  await prisma.welcomeOffer.deleteMany({ where: { holdingId, profileId } });
  return snapshot();
}

// ------------------------------------------------------------ payments --

export async function setPaymentPaid(input: {
  holdingId: string;
  month: string;
  dueDate: string;
  paid: boolean;
}): Promise<UserData> {
  const p = z
    .object({ holdingId: z.string(), month: z.string().regex(/^\d{4}-\d{2}$/), dueDate: isoDate, paid: z.boolean() })
    .parse(input);
  await ownHolding(p.holdingId);
  const prisma = await prismaClient();
  const paidDate = p.paid ? localToday() : null;
  await prisma.paymentRecord.upsert({
    where: { holdingId_statementMonth: { holdingId: p.holdingId, statementMonth: p.month } },
    create: { profileId, holdingId: p.holdingId, statementMonth: p.month, dueDate: p.dueDate, paid: p.paid, paidDate },
    update: { paid: p.paid, paidDate, dueDate: p.dueDate },
  });
  return snapshot();
}

// ------------------------------------------------------------- rotating --

export async function setActivation(input: { holdingId: string; quarter: string; activated: boolean }): Promise<UserData> {
  const prisma = await prismaClient();
  const a = z.object({ holdingId: z.string(), quarter: z.string().regex(/^\d{4}-Q[1-4]$/), activated: z.boolean() }).parse(input);
  await ownHolding(a.holdingId);
  const date = a.activated ? localToday() : null;
  await prisma.rotatingActivation.upsert({
    where: { holdingId_quarter: { holdingId: a.holdingId, quarter: a.quarter } },
    create: { profileId, ...a, date },
    update: { activated: a.activated, date },
  });
  return snapshot();
}

// --------------------------------------------- Up next skips and mutes --

const OccurrenceInput = z
  .object({
    holdingId: z.string(),
    kind: z.enum(["af", "credit", "payment", "rotating", "enroll", "sub", "subpost", "unverified"]),
    benefitId: z.string().nullable(),
    period: z.string().min(1),
  })
  .refine((o) => (o.kind !== "credit" && o.kind !== "enroll") || o.benefitId, { message: "credit and enroll skips need a benefitId" });

/** Skip one Up next occurrence (or undo it). Never marks anything paid, used or activated. */
export async function setSkipped(input: z.input<typeof OccurrenceInput> & { skipped: boolean }): Promise<UserData> {
  const o = OccurrenceInput.parse(input);
  await ownHolding(o.holdingId);
  const prisma = await prismaClient();
  const key = occurrenceKey(o);
  if (input.skipped) {
    await prisma.dismissal.upsert({
      where: { profileId_key: { profileId, key } },
      create: { profileId, key, ...o, date: localToday() },
      update: {},
    });
  } else {
    await prisma.dismissal.deleteMany({ where: { profileId, key } });
  }
  return snapshot();
}

const MuteInput = z
  .object({ kind: z.enum(["rotating", "benefit"]), benefitId: z.string().nullable(), muted: z.boolean() })
  .refine((m) => (m.kind === "benefit") === !!m.benefitId, { message: "benefit mutes need a benefitId" });

/** Turn recurring reminders off / back on for one card (rotating activation, or individual credits/perks). */
export async function setMutes(input: { holdingId: string; mutes: z.input<typeof MuteInput>[] }): Promise<UserData> {
  const { holdingId, mutes } = z.object({ holdingId: z.string(), mutes: z.array(MuteInput) }).parse(input);
  await ownHolding(holdingId);
  const prisma = await prismaClient();
  const date = localToday();
  for (const m of mutes) {
    const benefitId = m.kind === "benefit" ? m.benefitId : null;
    const key = muteKey({ kind: m.kind, holdingId, benefitId });
    if (m.muted) {
      await prisma.reminderMute.upsert({
        where: { profileId_key: { profileId, key } },
        create: { profileId, holdingId, key, kind: m.kind, benefitId, date },
        update: {},
      });
    } else {
      await prisma.reminderMute.deleteMany({ where: { profileId, key } });
    }
  }
  return snapshot();
}

// -------------------------------------------------- AF & lifecycle log --

const AfOutcomeInput = z.enum(["pending", "paid", "retention_offer", "downgraded", "closed"]);

const AfInput = z.object({
  holdingId: z.string(),
  postedDate: isoDate,
  amount: z.number().nonnegative(),
  outcome: AfOutcomeInput,
  note: optStr,
});

export async function addAfEvent(input: z.input<typeof AfInput>): Promise<UserData> {
  const prisma = await prismaClient();
  const e = AfInput.parse(input);
  await ownHolding(e.holdingId);
  await prisma.annualFeeEvent.create({ data: { ...e, profileId } });
  return snapshot();
}

/** Record the decision on a posted fee: Keep, Retention offer, Downgrade, Close (or back to pending). */
export async function setAfOutcome(id: string, outcome: z.input<typeof AfOutcomeInput>): Promise<UserData> {
  const prisma = await prismaClient();
  await prisma.annualFeeEvent.updateMany({ where: { id, profileId }, data: { outcome: AfOutcomeInput.parse(outcome) } });
  return snapshot();
}

export async function deleteAfEvent(id: string): Promise<UserData> {
  const prisma = await prismaClient();
  await prisma.annualFeeEvent.deleteMany({ where: { id, profileId } });
  return snapshot();
}

const LifecycleInput = z.object({
  holdingId: z.string(),
  type: z.enum(["retention_call", "product_change", "closure"]),
  date: isoDate,
  offer: optStr,
  accepted: z.boolean().nullable().optional().default(null),
  fromCard: optStr,
  toCard: optStr,
  details: optStr,
});

/**
 * `resolveAf`: a posted, undecided fee event this retention call settles
 * (outcome `retention_offer`), saved in the same request so one can't land without the other.
 */
export async function addLifecycleEvent(input: z.input<typeof LifecycleInput>, resolveAf?: string): Promise<UserData> {
  const prisma = await prismaClient();
  const e = LifecycleInput.parse(input);
  await ownHolding(e.holdingId);
  await prisma.lifecycleEvent.create({ data: { ...e, profileId } });
  if (resolveAf) {
    await prisma.annualFeeEvent.updateMany({ where: { id: z.string().parse(resolveAf), profileId, holdingId: e.holdingId }, data: { outcome: "retention_offer" } });
  }
  return snapshot();
}

export async function deleteLifecycleEvent(id: string): Promise<UserData> {
  const prisma = await prismaClient();
  await prisma.lifecycleEvent.deleteMany({ where: { id, profileId } });
  return snapshot();
}

// --------------------------------------------------------------- points --

const PointsInput = z.object({
  program: z.string().min(1),
  balance: z.number(),
  asOf: isoDate,
  centsPerPoint: z.number().positive().nullable().optional().default(null),
});

export async function savePoints(input: z.input<typeof PointsInput>): Promise<UserData> {
  const prisma = await prismaClient();
  const p = PointsInput.parse(input);
  await prisma.pointsBalance.upsert({
    where: { profileId_program: { profileId, program: p.program } },
    create: { ...p, profileId },
    update: p,
  });
  return snapshot();
}

export async function deletePoints(id: string): Promise<UserData> {
  const prisma = await prismaClient();
  await prisma.pointsBalance.deleteMany({ where: { id, profileId } });
  return snapshot();
}

// ------------------------------------------------------------- settings --

const SpendProfileInput = z.partialRecord(z.enum(SPEND_CATEGORIES), z.number().nonnegative().max(1_000_000));
const FindCriteriaInput = z
  .object({
    accountType: z.enum(["personal", "business", "both"]),
    goal: z.enum(["bonus", "everyday"]),
    program: z.string().max(64),
    maxFee: z.number().nonnegative().nullable(),
    excludedIssuers: z.array(z.string().max(64)).max(64),
  })
  .partial();

const SettingsInput = z.object({
  afLeadDays: z.number().int().min(0).max(365),
  afWatchDays: z.number().int().min(0).max(365),
  creditLeadDays: z.number().int().min(0).max(365),
  paymentLeadDays: z.number().int().min(0).max(60),
  subLeadDays: z.number().int().min(0).max(365),
  subPostingDays: z.number().int().min(0).max(365),
  countBonusInRoi: z.boolean(),
  perkValueOverrides: z.record(z.string(), z.number().nonnegative()),
  centsPerPoint: z.record(z.string(), z.number().positive()),
  paymentTrackingStart: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
  spendProfile: SpendProfileInput,
  findCardCriteria: FindCriteriaInput,
  dismissedDeals: z.array(z.string().max(200)).max(2000),
  dealsSeenAt: z.string().max(40).nullable().transform((s) => s?.slice(0, 10) ?? null),
});

export async function saveSettings(input: z.input<typeof SettingsInput>): Promise<UserData> {
  const prisma = await prismaClient();
  const row = settingsRow(SettingsInput.parse(input));
  await prisma.settings.upsert({ where: { profileId }, create: { profileId, ...row }, update: row });
  return snapshot();
}

/** Find a card remembers its criteria (docs/SPEC-v8-find-a-card.md §2.2); nothing else in Settings changes. */
export async function saveFindCardCriteria(input: z.input<typeof FindCriteriaInput>): Promise<UserData> {
  const prisma = await prismaClient();
  const findCardCriteria = JSON.stringify(FindCriteriaInput.parse(input));
  await prisma.settings.upsert({ where: { profileId }, create: { profileId, findCardCriteria }, update: { findCardCriteria } });
  return snapshot();
}

// ----------------------------------------------------------------- deals --

/** Dismiss a deal, or bring it back (docs/SPEC-v9-daily-refresh.md §4.4). Only this column changes. */
export async function setDealDismissed(input: { dealId: string; dismissed: boolean }): Promise<UserData> {
  const { dealId, dismissed } = z.object({ dealId: z.string().min(1).max(200), dismissed: z.boolean() }).parse(input);
  const prisma = await prismaClient();
  const current = (await snapshot()).settings.dismissedDeals.filter((id) => id !== dealId);
  const dismissedDeals = JSON.stringify(dismissed ? [...current, dealId] : current);
  await prisma.settings.upsert({ where: { profileId }, create: { profileId, dismissedDeals }, update: { dismissedDeals } });
  return snapshot();
}

/**
 * The Deals page was opened: remember the date of the feed run it showed, for the "unseen" dot.
 * A date only: D1 reads a full date-time back from a TEXT column as a Date, which Prisma then rejects.
 */
export async function markDealsSeen(ranAt: string): Promise<UserData> {
  const dealsSeenAt = z.string().regex(/^\d{4}-\d{2}-\d{2}/).max(40).parse(ranAt).slice(0, 10);
  const prisma = await prismaClient();
  await prisma.settings.upsert({ where: { profileId }, create: { profileId, dealsSeenAt }, update: { dealsSeenAt } });
  return snapshot();
}

// ------------------------------------------------------- export / import --

export async function exportData(): Promise<string> {
  return JSON.stringify(buildExport(await snapshot(), new Date().toISOString()), null, 2);
}

export async function importData(
  json: string,
  mode: ImportMode,
): Promise<{ ok: true; data: UserData; summary: string } | { ok: false; error: string }> {
  try {
    const { data, hasSettings } = parseImport(JSON.parse(json));
    await writeImport(await getDb(), profileId, data, mode, hasSettings);
    return {
      ok: true,
      data: await snapshot(),
      summary: `Imported ${data.holdings.length} card(s), ${data.usages.length} benefit use(s), ${data.payments.length} payment(s), ${data.points.length} points balance(s)${
        data.dismissals.length + data.mutes.length ? `, ${data.dismissals.length} skip(s), ${data.mutes.length} reminder mute(s)` : ""
      }${data.enrollments.length ? `, ${data.enrollments.length} enrollment(s)` : ""
      }${data.welcomeOffers.length ? `, ${data.welcomeOffers.length} welcome offer(s)` : ""
      } (${mode}).`,
    };
  } catch (e) {
    if (e instanceof ImportError || e instanceof SyntaxError) return { ok: false, error: e.message };
    throw e;
  }
}
