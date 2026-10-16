import type { PrismaClient } from "@prisma/client";
import { loadCatalog } from "../catalog/loader";
import type { Card, Catalog, PerkDefault, Program, RotatingProgram, Rule } from "../catalog/schema";
import { type Db, isCloudflareWorker, type SqlStatement, sqlNow, upsertSql } from "./dbHandle";

/** The statements that replace the Catalog* cache tables with `catalog`. Never touches user data. */
export function catalogSyncStatements(catalog: Catalog): SqlStatement[] {
  return [
    { sql: `DELETE FROM "CatalogCard"`, params: [] },
    { sql: `DELETE FROM "CatalogRule"`, params: [] },
    { sql: `DELETE FROM "CatalogDoc"`, params: [] },
    ...catalog.cards.map((c) => upsertSql("CatalogCard", { id: c.id, data: JSON.stringify(c) })),
    ...catalog.rules.map((r) => upsertSql("CatalogRule", { id: r.id, data: JSON.stringify(r) })),
    upsertSql("CatalogDoc", { id: "perk-defaults", data: JSON.stringify(catalog.perkDefaults) }),
    upsertSql("CatalogDoc", { id: "programs", data: JSON.stringify(catalog.programs) }),
    upsertSql("CatalogDoc", { id: "rotating", data: JSON.stringify(catalog.rotating) }),
    // Written last, in the same atomic batch: the hash only changes if everything above did.
    upsertSql("CatalogMeta", { id: "catalog", hash: catalog.hash, loadedAt: sqlNow() }),
  ];
}

/**
 * Upsert the catalog into the DB cache tables when its content hash changed.
 * Only Catalog* tables are touched — user data is never read or written here.
 * Atomic (one batch), so concurrent first requests on D1 are safe.
 * Returns true when a reload happened.
 */
export async function syncCatalog(db: Db, catalog: Catalog): Promise<boolean> {
  const meta = await db.prisma.catalogMeta.findUnique({ where: { id: "catalog" } });
  if (meta?.hash === catalog.hash) return false;
  await db.batch(catalogSyncStatements(catalog));
  return true;
}

export async function readCatalogFromDb(prisma: PrismaClient): Promise<Catalog | null> {
  const meta = await prisma.catalogMeta.findUnique({ where: { id: "catalog" } });
  if (!meta) return null;
  const [cards, rules, docs] = await Promise.all([
    prisma.catalogCard.findMany({ orderBy: { id: "asc" } }),
    prisma.catalogRule.findMany({ orderBy: { id: "asc" } }),
    prisma.catalogDoc.findMany(),
  ]);
  const doc = <T>(id: string): T => JSON.parse(docs.find((d) => d.id === id)?.data ?? "[]") as T;
  return {
    hash: meta.hash,
    cards: cards.map((c) => JSON.parse(c.data) as Card),
    rules: rules.map((r) => JSON.parse(r.data) as Rule),
    perkDefaults: doc<PerkDefault[]>("perk-defaults"),
    programs: doc<Program[]>("programs"),
    rotating: doc<RotatingProgram[]>("rotating"),
  };
}

/**
 * Where the catalog comes from: `catalog/` on disk under Node; on Cloudflare
 * Workers (no project files at runtime) the copy bundled at build time by
 * scripts/bundle-catalog.ts. Both carry the same content hash.
 */
async function sourceCatalog(): Promise<Catalog> {
  if (isCloudflareWorker()) return (await import("@/generated/catalog.json")).default as unknown as Catalog;
  return loadCatalog();
}

let cached: Catalog | null = null;

/**
 * Load the catalog, sync it into the DB if changed, and return it as stored
 * in the DB. Disk is re-read on each call in development so catalog edits
 * show up immediately; in production it's read once per process / Worker
 * isolate (i.e. picked up on restart/redeploy).
 */
export async function getCatalog(db: Db): Promise<Catalog> {
  if (cached && process.env.NODE_ENV === "production") return cached;
  const source = await sourceCatalog();
  if (cached?.hash === source.hash) return cached;
  await syncCatalog(db, source);
  cached = (await readCatalogFromDb(db.prisma)) ?? source;
  return cached;
}
