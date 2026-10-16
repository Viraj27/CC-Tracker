import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { cache } from "react";
import { type D1Like, type Db, d1Db, isCloudflareWorker, prismaDb } from "./dbHandle";

/** v1 is single-profile; every user-data row is still scoped by profile id. */
export const PROFILE_ID = "default";

const g = globalThis as unknown as { ccTrackerDb?: Db };

/** Local Node: one Prisma client on the gitignored SQLite file (same default as scripts/db-url.mjs). */
function localDb(): Db {
  if (g.ccTrackerDb) return g.ccTrackerDb;
  process.env.DATABASE_URL ||= `file:${path.join(process.cwd(), "prisma", "cc-tracker.db")}`;
  const db = prismaDb(new PrismaClient());
  // Reuse across dev hot reloads and requests.
  g.ccTrackerDb = db;
  return db;
}

/**
 * Workers: a new client per request on the `DB` D1 binding (OpenNext's
 * recommendation — no clients shared across requests). React `cache`
 * dedupes it within one server render.
 */
const workerDb = cache(async (): Promise<Db> => {
  const [{ getCloudflareContext }, { PrismaD1 }] = await Promise.all([
    import("@opennextjs/cloudflare"),
    import("@prisma/adapter-d1"),
  ]);
  const { env } = await getCloudflareContext({ async: true });
  const d1 = (env as unknown as { DB?: D1Like }).DB;
  if (!d1) throw new Error("D1 binding `DB` is missing — check wrangler.jsonc");
  const adapter = new PrismaD1(d1 as unknown as ConstructorParameters<typeof PrismaD1>[0]);
  return d1Db(new PrismaClient({ adapter }), d1);
});

export async function getDb(): Promise<Db> {
  return isCloudflareWorker() ? workerDb() : localDb();
}
