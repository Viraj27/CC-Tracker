/**
 * Storage tests, run against both backends the app uses:
 *   - local SQLite through Prisma (`npm run dev`)
 *   - Cloudflare D1 through Prisma's D1 adapter, on a local D1 created by
 *     wrangler with the real migrations (`wrangler d1 migrations apply`)
 * Uses only fake demo data.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import { loadCatalog } from "@/lib/catalog/loader";
import { buildExport, parseImport } from "@/lib/importExport";
import { readCatalogFromDb, syncCatalog } from "@/lib/server/catalogStore";
import { type D1Like, type Db, d1Db, prismaDb } from "@/lib/server/dbHandle";
import { loadUserData, writeImport } from "@/lib/server/userData";

const root = process.cwd();
const catalog = loadCatalog(path.join(root, "catalog"));
const demo = JSON.parse(fs.readFileSync(path.join(root, "examples", "demo-seed.json"), "utf8"));
const PROFILE = "default";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cc-tracker-db-test-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const bin = (name: string) => path.join(root, "node_modules", ".bin", name);
const run = (cmd: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync(bin(cmd), args, { cwd: root, env: { ...process.env, ...env }, encoding: "utf8", stdio: "pipe" });

/** A fake import big enough to exceed the D1 Free-plan limit of 50 queries per request if written row by row. */
function bigImport() {
  const usages = Array.from({ length: 120 }, (_, i) => ({
    benefitId: "travel-credit",
    periodKey: "cm-2025-01",
    amount: 1,
    date: `2025-${String((i % 12) + 1).padStart(2, "0")}-01`,
    note: `fake use ${i}`,
  }));
  return {
    holdings: [
      {
        catalogCardId: "chase-sapphire-reserve",
        nickname: "Bulk demo",
        approvalDate: "2025-01-15",
        usages,
        payments: Array.from({ length: 12 }, (_, i) => ({
          statementMonth: `2025-${String(i + 1).padStart(2, "0")}`,
          dueDate: `2025-${String(i + 1).padStart(2, "0")}-20`,
          paid: i % 2 === 0,
        })),
      },
    ],
  };
}

function storageSuite(name: string, open: () => Promise<{ db: Db; batches: () => number }>) {
  describe(name, () => {
    let db: Db;
    let batches: () => number;
    beforeAll(async () => {
      ({ db, batches } = await open());
    }, 180_000);

    it("loads the catalog once per content hash and reads it back unchanged", async () => {
      expect(await syncCatalog(db, catalog)).toBe(true);
      expect(await syncCatalog(db, catalog)).toBe(false);
      const stored = await readCatalogFromDb(db.prisma);
      expect(stored).toEqual(JSON.parse(JSON.stringify(catalog)));
    });

    it("imports the demo seed idempotently (merge twice = same data)", async () => {
      const { data, hasSettings } = parseImport(demo);
      await writeImport(db, PROFILE, data, "merge", hasSettings);
      const first = await loadUserData(db.prisma, PROFILE);
      await writeImport(db, PROFILE, data, "merge", hasSettings);
      const second = await loadUserData(db.prisma, PROFILE);
      expect(second).toEqual(first);
      expect(first.holdings).toHaveLength(data.holdings.length);
      expect(first.usages).toHaveLength(data.usages.length);
      expect(first.payments.map((p) => p.paid)).toEqual(data.payments.map((p) => p.paid));
    });

    it("export → replace import round-trips all user data", async () => {
      const before = await loadUserData(db.prisma, PROFILE);
      const exported = JSON.parse(JSON.stringify(buildExport(before, "2026-01-01T00:00:00.000Z")));
      const { data, hasSettings } = parseImport(exported);
      await writeImport(db, PROFILE, data, "replace", hasSettings);
      expect(await loadUserData(db.prisma, PROFILE)).toEqual(before);
    });

    it("a catalog reload never touches user data", async () => {
      const before = await loadUserData(db.prisma, PROFILE);
      expect(await syncCatalog(db, { ...catalog, hash: "changed", cards: catalog.cards.slice(1) })).toBe(true);
      expect(await loadUserData(db.prisma, PROFILE)).toEqual(before);
      expect(await syncCatalog(db, catalog)).toBe(true);
      expect((await readCatalogFromDb(db.prisma))?.cards).toHaveLength(catalog.cards.length);
    });

    it("writes a large import in a single atomic batch", async () => {
      const { data, hasSettings } = parseImport(bigImport());
      const n = batches();
      await writeImport(db, PROFILE, data, "replace", hasSettings);
      expect(batches() - n).toBe(1);
      const after = await loadUserData(db.prisma, PROFILE);
      expect(after.usages).toHaveLength(120);
      expect(after.payments).toHaveLength(12);
    });

    it("rolls back the whole import if any row fails", async () => {
      const before = await loadUserData(db.prisma, PROFILE);
      const { data } = parseImport(demo);
      // A usage pointing at a holding that doesn't exist violates the foreign key.
      data.usages.push({ ...data.usages[0], id: "u_bad", holdingId: "no-such-holding" });
      await expect(writeImport(db, PROFILE, data, "replace", false)).rejects.toThrow();
      expect(await loadUserData(db.prisma, PROFILE)).toEqual(before);
    });
  });
}

function counting(db: Db) {
  let count = 0;
  const batch = db.batch.bind(db);
  return {
    db: { ...db, batch: (s: Parameters<Db["batch"]>[0]) => (count++, batch(s)) },
    batches: () => count,
  };
}

storageSuite("local SQLite (Prisma)", async () => {
  const url = `file:${path.join(tmp, "local.db")}`;
  run("prisma", ["migrate", "deploy"], { DATABASE_URL: url });
  const prisma = new PrismaClient({ datasourceUrl: url });
  afterAll(() => prisma.$disconnect());
  return counting(prismaDb(prisma));
});

storageSuite("Cloudflare D1 (wrangler local, Prisma D1 adapter)", async () => {
  const persist = path.join(tmp, "wrangler-state");
  // The exact command CI runs against the hosted database, minus --remote.
  const out = run("wrangler", ["d1", "migrations", "apply", "cc-tracker", "--local", "--persist-to", persist]);
  expect(out).toMatch(/migration\.sql/);
  // `--persist-to X` stores state in X/v3; getPlatformProxy takes the v3 dir.
  const proxy = await getPlatformProxy<{ DB: D1Like }>({ configPath: path.join(root, "wrangler.jsonc"), persist: { path: path.join(persist, "v3") } });
  afterAll(() => proxy.dispose());
  const d1 = proxy.env.DB;
  const prisma = new PrismaClient({ adapter: new PrismaD1(d1 as unknown as ConstructorParameters<typeof PrismaD1>[0]) });
  return counting(d1Db(prisma, d1));
});

describe("D1 migrations", () => {
  it("every Prisma migration is picked up by wrangler's migrations_pattern", () => {
    const dirs = fs
      .readdirSync(path.join(root, "prisma", "migrations"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(dirs.length).toBeGreaterThan(0);
    for (const d of dirs) expect(fs.existsSync(path.join(root, "prisma", "migrations", d, "migration.sql")), d).toBe(true);
    const config = fs.readFileSync(path.join(root, "wrangler.jsonc"), "utf8");
    expect(config).toContain('"migrations_pattern": "prisma/migrations/*/migration.sql"');
  });
});
