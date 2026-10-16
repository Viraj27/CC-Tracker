import type { PrismaClient } from "@prisma/client";
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
import { type Db, type SqlStatement, sqlNow, upsertSql } from "./dbHandle";

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
 * The statements that write imported user data. `replace` wipes the
 * profile's user data first; `merge` upserts by id (ids are deterministic,
 * so re-imports are idempotent). Parents before children (foreign keys).
 */
export function importStatements(
  profileId: string,
  data: UserData,
  mode: ImportMode,
  includeSettings: boolean,
): SqlStatement[] {
  const now = sqlNow();
  const ops: SqlStatement[] = [];
  if (mode === "replace") {
    // Children cascade from holdings.
    ops.push({ sql: `DELETE FROM "Holding" WHERE "profileId" = ?`, params: [profileId] });
    ops.push({ sql: `DELETE FROM "PointsBalance" WHERE "profileId" = ?`, params: [profileId] });
  }
  for (const h of data.holdings) ops.push(upsertSql("Holding", { ...h, profileId, updatedAt: now }));
  for (const u of data.usages) ops.push(upsertSql("BenefitUsage", { ...u, profileId }));
  for (const p of data.payments) ops.push(upsertSql("PaymentRecord", { ...p, profileId }, ["holdingId", "statementMonth"]));
  for (const e of data.afEvents) ops.push(upsertSql("AnnualFeeEvent", { ...e, profileId }));
  for (const e of data.lifecycle) ops.push(upsertSql("LifecycleEvent", { ...e, profileId }));
  for (const a of data.activations) ops.push(upsertSql("RotatingActivation", { ...a, profileId }, ["holdingId", "quarter"]));
  for (const p of data.points) ops.push(upsertSql("PointsBalance", { ...p, profileId }, ["profileId", "program"]));
  if (includeSettings) ops.push(upsertSql("Settings", { profileId, ...settingsRow(data.settings) }, ["profileId"]));
  return ops;
}

/** Write imported user data atomically (one batch — a single D1 query on Cloudflare). */
export async function writeImport(
  db: Db,
  profileId: string,
  data: UserData,
  mode: ImportMode,
  includeSettings: boolean,
): Promise<void> {
  await ensureProfile(db.prisma, profileId);
  await db.batch(importStatements(profileId, data, mode, includeSettings));
}
