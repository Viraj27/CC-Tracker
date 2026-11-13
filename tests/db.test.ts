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
import { fixtureFeed } from "../e2e/feedFixture";
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

    it("stores skips and mutes; merge is idempotent and replace round-trips them", async () => {
      const file = JSON.parse(JSON.stringify(demo));
      file.holdings[0].skips = [
        { kind: "credit", benefitId: "lyft-credit", period: "2026-10", date: "2026-10-17" },
        { kind: "af", period: "2027-01-15", date: "2026-10-17" },
      ];
      file.holdings[1].mutes = [{ kind: "rotating", date: "2026-10-17" }];
      const { data, hasSettings } = parseImport(file);
      await writeImport(db, PROFILE, data, "replace", hasSettings);
      const first = await loadUserData(db.prisma, PROFILE);
      expect(first.dismissals.map((d) => `${d.holdingId}/${d.kind}/${d.period}`).sort()).toEqual([
        "demo-reserve/af/2027-01-15",
        "demo-reserve/credit/2026-10",
      ]);
      expect(first.mutes).toEqual([{ id: data.mutes[0].id, holdingId: "demo-flex", kind: "rotating", benefitId: null, date: "2026-10-17" }]);
      await writeImport(db, PROFILE, data, "merge", hasSettings);
      expect(await loadUserData(db.prisma, PROFILE)).toEqual(first);

      const exported = JSON.parse(JSON.stringify(buildExport(first, "2026-10-17T00:00:00.000Z")));
      const again = parseImport(exported);
      await writeImport(db, PROFILE, again.data, "replace", again.hasSettings);
      expect(await loadUserData(db.prisma, PROFILE)).toEqual(first);

      // A unique key per occurrence: a second skip of the same occurrence with another id doesn't duplicate it.
      const twice = { ...again.data, dismissals: again.data.dismissals.map((d) => ({ ...d, id: `${d.id}-other` })) };
      await writeImport(db, PROFILE, twice, "merge", false);
      expect((await loadUserData(db.prisma, PROFILE)).dismissals).toHaveLength(2);

      // Deleting a card deletes its skips and mutes.
      await db.prisma.holding.delete({ where: { id: "demo-flex" } });
      expect((await loadUserData(db.prisma, PROFILE)).mutes).toEqual([]);
      await writeImport(db, PROFILE, parseImport(demo).data, "replace", true);
    });

    it("stores a welcome offer per holding; merge is idempotent, replace round-trips, and it goes with its card", async () => {
      const file = JSON.parse(JSON.stringify(demo));
      file.holdings[1].welcomeOffer = { bonusAmount: 200, bonusUnit: "usd", minSpend: 500, windowMonths: 3, spentSoFar: 120.5, spentAsOf: "2026-11-01", note: "fake offer" };
      file.settings = { subLeadDays: 45, subPostingDays: 70, countBonusInRoi: true };
      const { data, hasSettings } = parseImport(file);
      await writeImport(db, PROFILE, data, "replace", hasSettings);
      const first = await loadUserData(db.prisma, PROFILE);
      expect(first.welcomeOffers.map((o) => o.holdingId).sort()).toEqual(["demo-flex", "demo-reserve"]);
      expect(first.welcomeOffers.find((o) => o.holdingId === "demo-flex")).toEqual({
        id: data.welcomeOffers.find((o) => o.holdingId === "demo-flex")!.id,
        holdingId: "demo-flex",
        bonusAmount: 200,
        bonusUnit: "usd",
        program: null,
        minSpend: 500,
        windowMonths: 3,
        deadline: null,
        spentSoFar: 120.5,
        spentAsOf: "2026-11-01",
        metDate: null,
        postedDate: null,
        postedAmount: null,
        outcome: null,
        note: "fake offer",
      });
      expect(first.settings).toMatchObject({ subLeadDays: 45, subPostingDays: 70, countBonusInRoi: true });
      await writeImport(db, PROFILE, data, "merge", hasSettings);
      expect(await loadUserData(db.prisma, PROFILE)).toEqual(first);

      // One offer per holding: a merge with another id replaces it, never adds a second.
      const changed = { ...data, welcomeOffers: data.welcomeOffers.map((o) => ({ ...o, id: `${o.id}-other`, metDate: "2026-11-10" })) };
      await writeImport(db, PROFILE, changed, "merge", false);
      const merged = await loadUserData(db.prisma, PROFILE);
      expect(merged.welcomeOffers).toHaveLength(2);
      expect(merged.welcomeOffers.every((o) => o.metDate === "2026-11-10")).toBe(true);

      const exported = JSON.parse(JSON.stringify(buildExport(merged, "2026-11-12T00:00:00.000Z")));
      const again = parseImport(exported);
      await writeImport(db, PROFILE, again.data, "replace", again.hasSettings);
      expect(await loadUserData(db.prisma, PROFILE)).toEqual(merged);

      await db.prisma.holding.delete({ where: { id: "demo-flex" } });
      expect((await loadUserData(db.prisma, PROFILE)).welcomeOffers.map((o) => o.holdingId)).toEqual(["demo-reserve"]);
      await writeImport(db, PROFILE, { ...parseImport(demo).data, settings: parseImport({}).data.settings }, "replace", true);
    });

    it("stores a pending fee event, the per-card refund window and the watch setting; the catalog keeps its fee policies", async () => {
      const file = JSON.parse(JSON.stringify(demo));
      file.holdings[0].afRefundDays = 45;
      file.holdings[0].afEvents = [{ postedDate: "2026-11-18", amount: 795, outcome: "pending" }];
      file.settings = { afWatchDays: 60 };
      const { data, hasSettings } = parseImport(file);
      await writeImport(db, PROFILE, data, "replace", hasSettings);
      const first = await loadUserData(db.prisma, PROFILE);
      expect(first.holdings.find((h) => h.id === file.holdings[0].id)?.afRefundDays).toBe(45);
      expect(first.afEvents).toEqual([{ id: data.afEvents[0].id, holdingId: file.holdings[0].id, postedDate: "2026-11-18", amount: 795, outcome: "pending", note: null }]);
      expect(first.settings.afWatchDays).toBe(60);
      const again = parseImport(JSON.parse(JSON.stringify(buildExport(first, "2026-11-20T00:00:00.000Z"))));
      await writeImport(db, PROFILE, again.data, "replace", again.hasSettings);
      expect(await loadUserData(db.prisma, PROFILE)).toEqual(first);
      expect((await readCatalogFromDb(db.prisma))?.afPolicies).toEqual(catalog.afPolicies);
      expect(catalog.afPolicies.map((p) => p.issuer).sort()).toEqual(["amex", "capital_one", "chase", "wells_fargo"]);
      await writeImport(db, PROFILE, { ...parseImport(demo).data, settings: parseImport({}).data.settings }, "replace", true);
    });

    it("stores the spend profile and Find a card's criteria; saving one keeps the other", async () => {
      const file = JSON.parse(JSON.stringify(demo));
      file.settings = { spendProfile: { dining: 500, groceries: 600.5 }, findCardCriteria: { goal: "everyday", maxFee: 250, excludedIssuers: ["amex"] } };
      const { data, hasSettings } = parseImport(file);
      await writeImport(db, PROFILE, data, "replace", hasSettings);
      const first = await loadUserData(db.prisma, PROFILE);
      expect(first.settings.spendProfile).toEqual({ dining: 500, groceries: 600.5 });
      expect(first.settings.findCardCriteria).toEqual({ goal: "everyday", maxFee: 250, excludedIssuers: ["amex"] });
      // What the criteria-only save does: one column, the profile untouched.
      await db.prisma.settings.update({ where: { profileId: PROFILE }, data: { findCardCriteria: JSON.stringify({ accountType: "both" }) } });
      const second = await loadUserData(db.prisma, PROFILE);
      expect(second.settings.findCardCriteria).toEqual({ accountType: "both" });
      expect(second.settings.spendProfile).toEqual({ dining: 500, groceries: 600.5 });
      const again = parseImport(JSON.parse(JSON.stringify(buildExport(second, "2026-11-13T00:00:00.000Z"))));
      await writeImport(db, PROFILE, again.data, "replace", again.hasSettings);
      expect(await loadUserData(db.prisma, PROFILE)).toEqual(second);
      await writeImport(db, PROFILE, { ...parseImport(demo).data, settings: parseImport({}).data.settings }, "replace", true);
    });

    it("stores dismissed deals and the last feed seen; the catalog cache keeps the feed", async () => {
      const file = JSON.parse(JSON.stringify(demo));
      file.settings = { dismissedDeals: ["deal-a", "deal-b"], dealsSeenAt: "2026-11-13T06:00:00Z" };
      const { data, hasSettings } = parseImport(file);
      await writeImport(db, PROFILE, data, "replace", hasSettings);
      const first = await loadUserData(db.prisma, PROFILE);
      expect(first.settings.dismissedDeals).toEqual(["deal-a", "deal-b"]);
      expect(first.settings.dealsSeenAt).toBe("2026-11-13"); // stored as a date: D1 would hand a date-time back as a Date
      // What dismissing one more does: one column, the seen date untouched.
      await db.prisma.settings.update({ where: { profileId: PROFILE }, data: { dismissedDeals: JSON.stringify(["deal-a"]) } });
      const second = await loadUserData(db.prisma, PROFILE);
      expect(second.settings.dismissedDeals).toEqual(["deal-a"]);
      expect(second.settings.dealsSeenAt).toBe("2026-11-13");
      const again = parseImport(JSON.parse(JSON.stringify(buildExport(second, "2026-11-13T00:00:00.000Z"))));
      await writeImport(db, PROFILE, again.data, "replace", again.hasSettings);
      expect(await loadUserData(db.prisma, PROFILE)).toEqual(second);
      expect((await readCatalogFromDb(db.prisma))?.feed).toEqual(catalog.feed);
      // A feed that changes is a new content hash, and replaces the cached one.
      const feed = fixtureFeed("2026-11-13");
      const withFeed = { ...catalog, hash: `${catalog.hash}-feed`, feed: { ...feed, deals: feed.deals.filter((d) => d.id !== "expired-deal") } };
      expect(await syncCatalog(db, withFeed)).toBe(true);
      expect((await readCatalogFromDb(db.prisma))?.feed).toEqual(withFeed.feed);
      expect(await loadUserData(db.prisma, PROFILE)).toEqual(second);
      expect(await syncCatalog(db, catalog)).toBe(true);
      await writeImport(db, PROFILE, { ...parseImport(demo).data, settings: parseImport({}).data.settings }, "replace", true);
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

  it("the deploy job applies D1 migrations before deploying the new code", () => {
    const ci = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    const migrate = ci.indexOf("npm run cf:migrate:remote");
    expect(migrate).toBeGreaterThan(0);
    expect(ci.indexOf("npm run cf:deploy")).toBeGreaterThan(migrate);
  });
});
