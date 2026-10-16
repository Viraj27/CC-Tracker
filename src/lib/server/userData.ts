import type { Prisma, PrismaClient } from "@prisma/client";
import { localToday } from "../domain/dates";
import type {
  AccountType,
  AfOutcome,
  HoldingStatus,
  LifecycleType,
  Settings,
  UserData,
} from "../domain/types";
import { DEFAULT_SETTINGS } from "../domain/types";

/** Ensure the single v1 profile and its settings exist. */
export async function ensureProfile(prisma: PrismaClient, profileId: string): Promise<void> {
  await prisma.profile.upsert({ where: { id: profileId }, create: { id: profileId, name: "Me" }, update: {} });
  await prisma.settings.upsert({
    where: { profileId },
    // Payments before the DB was created aren't flagged as past due.
    create: { profileId, paymentTrackingStart: localToday().slice(0, 7) },
    update: {},
  });
}

function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function loadUserData(prisma: PrismaClient, profileId: string): Promise<UserData> {
  await ensureProfile(prisma, profileId);
  const where = { profileId };
  const [holdings, usages, payments, afEvents, lifecycle, points, activations, settings] = await Promise.all([
    prisma.holding.findMany({ where, orderBy: [{ approvalDate: "asc" }, { id: "asc" }] }),
    prisma.benefitUsage.findMany({ where, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.paymentRecord.findMany({ where }),
    prisma.annualFeeEvent.findMany({ where, orderBy: { postedDate: "asc" } }),
    prisma.lifecycleEvent.findMany({ where, orderBy: { date: "asc" } }),
    prisma.pointsBalance.findMany({ where, orderBy: { program: "asc" } }),
    prisma.rotatingActivation.findMany({ where }),
    prisma.settings.findUnique({ where }),
  ]);
  return {
    holdings: holdings.map((h) => ({
      id: h.id,
      catalogCardId: h.catalogCardId,
      nickname: h.nickname,
      issuer: h.issuer,
      accountType: h.accountType as AccountType | null,
      approvalDate: h.approvalDate,
      status: h.status as HoldingStatus,
      closedDate: h.closedDate,
      productChangedFromId: h.productChangedFromId,
      afMonth: h.afMonth,
      afDay: h.afDay,
      paymentDueDay: h.paymentDueDay,
      notes: h.notes,
    })),
    usages: usages.map((u) => ({
      id: u.id,
      holdingId: u.holdingId,
      benefitId: u.benefitId,
      periodKey: u.periodKey,
      amount: u.amount,
      valueOverride: u.valueOverride,
      date: u.date,
      note: u.note,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      holdingId: p.holdingId,
      statementMonth: p.statementMonth,
      dueDate: p.dueDate,
      paid: p.paid,
      paidDate: p.paidDate,
    })),
    afEvents: afEvents.map((e) => ({
      id: e.id,
      holdingId: e.holdingId,
      postedDate: e.postedDate,
      amount: e.amount,
      outcome: e.outcome as AfOutcome,
      note: e.note,
    })),
    lifecycle: lifecycle.map((e) => ({
      id: e.id,
      holdingId: e.holdingId,
      type: e.type as LifecycleType,
      date: e.date,
      offer: e.offer,
      accepted: e.accepted,
      fromCard: e.fromCard,
      toCard: e.toCard,
      details: e.details,
    })),
    points: points.map((p) => ({
      id: p.id,
      program: p.program,
      balance: p.balance,
      asOf: p.asOf,
      centsPerPoint: p.centsPerPoint,
    })),
    activations: activations.map((a) => ({
      id: a.id,
      holdingId: a.holdingId,
      quarter: a.quarter,
      activated: a.activated,
      date: a.date,
    })),
    settings: settings
      ? {
          afLeadDays: settings.afLeadDays,
          creditLeadDays: settings.creditLeadDays,
          paymentLeadDays: settings.paymentLeadDays,
          perkValueOverrides: parseJson(settings.perkValueOverrides, {}),
          centsPerPoint: parseJson(settings.centsPerPoint, {}),
          paymentTrackingStart: settings.paymentTrackingStart,
        }
      : { ...DEFAULT_SETTINGS },
  };
}

export function settingsRow(s: Settings) {
  return {
    afLeadDays: s.afLeadDays,
    creditLeadDays: s.creditLeadDays,
    paymentLeadDays: s.paymentLeadDays,
    perkValueOverrides: JSON.stringify(s.perkValueOverrides),
    centsPerPoint: JSON.stringify(s.centsPerPoint),
    paymentTrackingStart: s.paymentTrackingStart,
  };
}

export type ImportMode = "merge" | "replace";

/**
 * Write imported user data. `replace` wipes the profile's user data first;
 * `merge` upserts by id (ids are deterministic, so re-imports are idempotent).
 */
export async function writeImport(
  prisma: PrismaClient,
  profileId: string,
  data: UserData,
  mode: ImportMode,
  includeSettings: boolean,
): Promise<void> {
  await ensureProfile(prisma, profileId);
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (mode === "replace") {
    // Children cascade from holdings.
    ops.push(prisma.holding.deleteMany({ where: { profileId } }));
    ops.push(prisma.pointsBalance.deleteMany({ where: { profileId } }));
  }
  // Insert originals before product-changed successors (no FK, but keeps order tidy).
  for (const { id, ...h } of data.holdings) {
    const row = { ...h, profileId };
    ops.push(prisma.holding.upsert({ where: { id }, create: { id, ...row }, update: row }));
  }
  for (const { id, ...u } of data.usages) {
    const row = { ...u, profileId };
    ops.push(prisma.benefitUsage.upsert({ where: { id }, create: { id, ...row }, update: row }));
  }
  for (const { id, ...p } of data.payments) {
    const row = { ...p, profileId };
    ops.push(
      prisma.paymentRecord.upsert({
        where: { holdingId_statementMonth: { holdingId: p.holdingId, statementMonth: p.statementMonth } },
        create: { id, ...row },
        update: row,
      }),
    );
  }
  for (const { id, ...e } of data.afEvents) {
    const row = { ...e, profileId };
    ops.push(prisma.annualFeeEvent.upsert({ where: { id }, create: { id, ...row }, update: row }));
  }
  for (const { id, ...e } of data.lifecycle) {
    const row = { ...e, profileId };
    ops.push(prisma.lifecycleEvent.upsert({ where: { id }, create: { id, ...row }, update: row }));
  }
  for (const { id, ...a } of data.activations) {
    const row = { ...a, profileId };
    ops.push(
      prisma.rotatingActivation.upsert({
        where: { holdingId_quarter: { holdingId: a.holdingId, quarter: a.quarter } },
        create: { id, ...row },
        update: row,
      }),
    );
  }
  for (const { id, ...p } of data.points) {
    const row = { ...p, profileId };
    ops.push(
      prisma.pointsBalance.upsert({
        where: { profileId_program: { profileId, program: p.program } },
        create: { id, ...row },
        update: row,
      }),
    );
  }
  if (includeSettings) {
    const row = settingsRow(data.settings);
    ops.push(prisma.settings.upsert({ where: { profileId }, create: { profileId, ...row }, update: row }));
  }
  await prisma.$transaction(ops);
}
