import type { PrismaClient } from "@prisma/client";
import { loadCatalog } from "../catalog/loader";
import type { Card, Catalog, PerkDefault, Program, RotatingProgram, Rule } from "../catalog/schema";

/**
 * Upsert the catalog into the DB cache tables when its content hash changed.
 * Only Catalog* tables are touched — user data is never read or written here.
 * Returns true when a reload happened.
 */
export async function syncCatalog(prisma: PrismaClient, catalog: Catalog): Promise<boolean> {
  const meta = await prisma.catalogMeta.findUnique({ where: { id: "catalog" } });
  if (meta?.hash === catalog.hash) return false;
  await prisma.$transaction([
    prisma.catalogCard.deleteMany(),
    prisma.catalogRule.deleteMany(),
    prisma.catalogDoc.deleteMany(),
    prisma.catalogCard.createMany({ data: catalog.cards.map((c) => ({ id: c.id, data: JSON.stringify(c) })) }),
    prisma.catalogRule.createMany({ data: catalog.rules.map((r) => ({ id: r.id, data: JSON.stringify(r) })) }),
    prisma.catalogDoc.createMany({
      data: [
        { id: "perk-defaults", data: JSON.stringify(catalog.perkDefaults) },
        { id: "programs", data: JSON.stringify(catalog.programs) },
        { id: "rotating", data: JSON.stringify(catalog.rotating) },
      ],
    }),
    prisma.catalogMeta.upsert({
      where: { id: "catalog" },
      create: { id: "catalog", hash: catalog.hash },
      update: { hash: catalog.hash, loadedAt: new Date() },
    }),
  ]);
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

let cached: Catalog | null = null;

/**
 * Load catalog/ from disk, sync it into the DB if changed, and return it as
 * stored in the DB. Disk is re-read on each call in development so catalog
 * edits show up immediately; in production it's read once per process
 * (i.e. picked up on restart/redeploy).
 */
export async function getCatalog(prisma: PrismaClient): Promise<Catalog> {
  if (cached && process.env.NODE_ENV === "production") return cached;
  const fromDisk = loadCatalog();
  if (cached?.hash === fromDisk.hash) return cached;
  await syncCatalog(prisma, fromDisk);
  cached = (await readCatalogFromDb(prisma)) ?? fromDisk;
  return cached;
}
