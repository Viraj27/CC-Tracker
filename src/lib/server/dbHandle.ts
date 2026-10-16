import type { PrismaClient } from "@prisma/client";

export type SqlValue = string | number | boolean | null | undefined;
export interface SqlStatement {
  sql: string;
  params: SqlValue[];
}

/**
 * Database handle used by the server code. Prisma does the queries; bulk
 * writes (catalog sync, import) go through `batch`, which runs every
 * statement atomically in one round trip.
 *
 * Why a separate batch path: on Cloudflare D1, Prisma's `$transaction` is
 * not atomic (the D1 adapter runs each query on its own) and the Workers
 * Free plan allows only 50 D1 queries per request, so a per-row upsert
 * import would fail on a real export. A D1 `batch()` is one query and is
 * executed as a single SQL transaction.
 */
export interface Db {
  prisma: PrismaClient;
  batch(statements: SqlStatement[]): Promise<void>;
}

/** The subset of the D1 binding API we use (avoids pulling workers-types into the app's globals). */
export interface D1Like {
  prepare(sql: string): { bind(...values: unknown[]): unknown };
  batch(statements: unknown[]): Promise<unknown>;
}

/** True when running on Cloudflare Workers (OpenNext), false under Node (`next dev`, `next start`, tests). */
export function isCloudflareWorker(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

const bindable = (v: SqlValue) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

/** Local SQLite (or any Prisma datasource): batch = one Prisma transaction. */
export function prismaDb(prisma: PrismaClient): Db {
  return {
    prisma,
    async batch(statements) {
      if (!statements.length) return;
      await prisma.$transaction(statements.map((s) => prisma.$executeRawUnsafe(s.sql, ...s.params.map(bindable))));
    },
  };
}

/** Cloudflare D1: Prisma via the D1 adapter, batch = native D1 batch (atomic). */
export function d1Db(prisma: PrismaClient, d1: D1Like): Db {
  return {
    prisma,
    async batch(statements) {
      if (!statements.length) return;
      await d1.batch(statements.map((s) => d1.prepare(s.sql).bind(...s.params.map(bindable))));
    },
  };
}

const q = (name: string) => `"${name}"`;

/**
 * `INSERT ... ON CONFLICT (conflict) DO UPDATE` for one row. Columns in
 * `conflict` (and `id`) are never updated. Works on SQLite and D1.
 */
export function upsertSql(table: string, row: Record<string, SqlValue>, conflict: string[] = ["id"]): SqlStatement {
  const cols = Object.keys(row);
  const update = cols.filter((c) => c !== "id" && !conflict.includes(c));
  const action = update.length ? `UPDATE SET ${update.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")}` : "NOTHING";
  return {
    sql: `INSERT INTO ${q(table)} (${cols.map(q).join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ON CONFLICT (${conflict.map(q).join(", ")}) DO ${action}`,
    params: cols.map((c) => row[c]),
  };
}

/**
 * DateTime value for raw SQL. Both Prisma's SQLite engine and its D1 adapter
 * read ISO-8601 text back as a DateTime.
 */
export const sqlNow = () => new Date().toISOString();
