/**
 * Export / import format for all user data. Pure (no DB) so it can be tested
 * and reused for the v3 migration to a hosted DB.
 *
 * Every id is optional on import; missing ids are derived deterministically
 * from the record's content so re-importing the same file is idempotent.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { isoDate } from "./catalog/schema";
import type { UserData } from "./domain/types";
import { DEFAULT_SETTINGS } from "./domain/types";
import { muteKey, occurrenceKey } from "./domain/skips";

export const EXPORT_FORMAT = "cc-tracker-export";
/**
 * 2 (v4.1) adds per-holding `skips` and `mutes`. Version 1 files (no skips or
 * mutes) still import: both lists default to empty.
 */
export const EXPORT_VERSION = 2;

const monthKey = z.string().regex(/^\d{4}-\d{2}$/, "expected YYYY-MM");
const nullable = <T extends z.ZodType>(t: T) => t.nullable().optional().default(null);

const UsageIn = z.object({
  id: z.string().optional(),
  benefitId: z.string(),
  periodKey: z.string(),
  amount: z.number(),
  valueOverride: nullable(z.number()),
  date: isoDate,
  note: nullable(z.string()),
});
const PaymentIn = z.object({
  id: z.string().optional(),
  statementMonth: monthKey,
  dueDate: isoDate,
  paid: z.boolean().default(false),
  paidDate: nullable(isoDate),
});
const AfEventIn = z.object({
  id: z.string().optional(),
  postedDate: isoDate,
  amount: z.number(),
  outcome: z.enum(["paid", "retention_offer", "downgraded", "closed"]),
  note: nullable(z.string()),
});
const LifecycleIn = z.object({
  id: z.string().optional(),
  type: z.enum(["retention_call", "product_change", "closure"]),
  date: isoDate,
  offer: nullable(z.string()),
  accepted: nullable(z.boolean()),
  fromCard: nullable(z.string()),
  toCard: nullable(z.string()),
  details: nullable(z.string()),
});
const ActivationIn = z.object({
  id: z.string().optional(),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/),
  activated: z.boolean().default(true),
  date: nullable(isoDate),
});

// Skips are nested under their holding, so the holding id is implied.
const SkipIn = z
  .object({
    id: z.string().optional(),
    kind: z.enum(["af", "credit", "payment", "rotating", "unverified"]),
    benefitId: nullable(z.string()),
    period: z.string().min(1),
    date: isoDate,
  })
  .refine((s) => s.kind !== "credit" || s.benefitId, { message: "credit skips need a benefitId" });
const MuteIn = z
  .object({
    id: z.string().optional(),
    kind: z.enum(["rotating", "benefit"]),
    benefitId: nullable(z.string()),
    date: isoDate,
  })
  .refine((m) => (m.kind === "benefit") === !!m.benefitId, { message: "benefit mutes need a benefitId; rotating mutes must not have one" });

const HoldingIn = z
  .object({
    id: z.string().optional(),
    catalogCardId: nullable(z.string()),
    nickname: nullable(z.string()),
    issuer: nullable(z.string()),
    accountType: nullable(z.enum(["personal", "business"])),
    approvalDate: isoDate,
    status: z.enum(["open", "closed", "product_changed"]).default("open"),
    closedDate: nullable(isoDate),
    productChangedFromId: nullable(z.string()),
    afMonth: nullable(z.number().int().min(1).max(12)),
    afDay: nullable(z.number().int().min(1).max(31)),
    paymentDueDay: nullable(z.number().int().min(1).max(31)),
    notes: nullable(z.string()),
    usages: z.array(UsageIn).default([]),
    payments: z.array(PaymentIn).default([]),
    afEvents: z.array(AfEventIn).default([]),
    lifecycle: z.array(LifecycleIn).default([]),
    activations: z.array(ActivationIn).default([]),
    skips: z.array(SkipIn).default([]),
    mutes: z.array(MuteIn).default([]),
  })
  .refine((h) => h.catalogCardId || h.nickname, { message: "holding needs catalogCardId or nickname" });

const PointsIn = z.object({
  id: z.string().optional(),
  program: z.string(),
  balance: z.number(),
  asOf: isoDate,
  centsPerPoint: nullable(z.number().positive()),
});

const SettingsIn = z.object({
  afLeadDays: z.number().int().min(0).max(365).default(DEFAULT_SETTINGS.afLeadDays),
  creditLeadDays: z.number().int().min(0).max(365).default(DEFAULT_SETTINGS.creditLeadDays),
  paymentLeadDays: z.number().int().min(0).max(60).default(DEFAULT_SETTINGS.paymentLeadDays),
  perkValueOverrides: z.record(z.string(), z.number().nonnegative()).default({}),
  centsPerPoint: z.record(z.string(), z.number().positive()).default({}),
  paymentTrackingStart: nullable(monthKey),
});

export const ImportSchema = z.object({
  format: z.literal(EXPORT_FORMAT).optional(),
  version: z.number().int().optional(),
  holdings: z.array(HoldingIn).default([]),
  points: z.array(PointsIn).default([]),
  settings: SettingsIn.optional(),
});
export type ImportFile = z.infer<typeof ImportSchema>;

function stableId(prefix: string, ...parts: unknown[]): string {
  return `${prefix}_${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16)}`;
}

export class ImportError extends Error {}

/** Validate an import file and fill in deterministic ids. */
export function parseImport(raw: unknown): { data: UserData; hasSettings: boolean } {
  const res = ImportSchema.safeParse(raw);
  if (!res.success) {
    const msg = res.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new ImportError(`Invalid import file — ${msg}`);
  }
  const f = res.data;
  const data: UserData = {
    holdings: [],
    usages: [],
    payments: [],
    afEvents: [],
    lifecycle: [],
    points: [],
    activations: [],
    dismissals: [],
    mutes: [],
    settings: { ...DEFAULT_SETTINGS, ...(f.settings ?? {}) },
  };
  for (const h of f.holdings) {
    const id = h.id ?? stableId("h", h.catalogCardId ?? h.nickname, h.approvalDate);
    const { usages, payments, afEvents, lifecycle, activations, skips, mutes, ...rest } = h;
    data.holdings.push({ ...rest, id });
    for (const u of usages) data.usages.push({ ...u, holdingId: id, id: u.id ?? stableId("u", id, u) });
    for (const p of payments) data.payments.push({ ...p, holdingId: id, id: p.id ?? stableId("p", id, p.statementMonth) });
    for (const e of afEvents) data.afEvents.push({ ...e, holdingId: id, id: e.id ?? stableId("af", id, e) });
    for (const e of lifecycle) data.lifecycle.push({ ...e, holdingId: id, id: e.id ?? stableId("lc", id, e) });
    for (const a of activations) data.activations.push({ ...a, holdingId: id, id: a.id ?? stableId("ra", id, a.quarter) });
    // One row per occurrence / mute key (the DB's unique key); the first wins.
    for (const s of skips) {
      const d = { ...s, holdingId: id };
      const key = occurrenceKey(d);
      if (!data.dismissals.some((x) => occurrenceKey(x) === key)) data.dismissals.push({ ...d, id: s.id ?? stableId("sk", key) });
    }
    for (const m of mutes) {
      const r = { ...m, holdingId: id };
      const key = muteKey(r);
      if (!data.mutes.some((x) => muteKey(x) === key)) data.mutes.push({ ...r, id: m.id ?? stableId("mu", key) });
    }
  }
  for (const p of f.points) data.points.push({ ...p, id: p.id ?? stableId("pt", p.program) });

  const ids = new Set(data.holdings.map((h) => h.id));
  if (ids.size !== data.holdings.length) throw new ImportError("Duplicate holding ids in import file.");
  for (const h of data.holdings) {
    if (h.productChangedFromId && !ids.has(h.productChangedFromId)) {
      throw new ImportError(`Holding ${h.id}: productChangedFromId "${h.productChangedFromId}" not found in file.`);
    }
  }
  return { data, hasSettings: f.settings !== undefined };
}

/** Build the export document (nested by holding, same shape import accepts). */
export function buildExport(data: UserData, exportedAt: string) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt,
    settings: data.settings,
    holdings: data.holdings.map((h) => ({
      ...h,
      usages: data.usages.filter((x) => x.holdingId === h.id).map(({ holdingId: _, ...x }) => x),
      payments: data.payments.filter((x) => x.holdingId === h.id).map(({ holdingId: _, ...x }) => x),
      afEvents: data.afEvents.filter((x) => x.holdingId === h.id).map(({ holdingId: _, ...x }) => x),
      lifecycle: data.lifecycle.filter((x) => x.holdingId === h.id).map(({ holdingId: _, ...x }) => x),
      activations: data.activations.filter((x) => x.holdingId === h.id).map(({ holdingId: _, ...x }) => x),
      skips: data.dismissals.filter((x) => x.holdingId === h.id).map(({ holdingId: _, ...x }) => x),
      mutes: data.mutes.filter((x) => x.holdingId === h.id).map(({ holdingId: _, ...x }) => x),
    })),
    points: data.points,
  };
}
