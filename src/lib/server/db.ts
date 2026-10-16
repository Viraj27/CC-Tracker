import path from "node:path";
import { PrismaClient } from "@prisma/client";

// Same default as scripts/db-url.mjs: a gitignored SQLite file in prisma/.
process.env.DATABASE_URL ||= `file:${path.join(process.cwd(), "prisma", "cc-tracker.db")}`;

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/** v1 is single-profile; every user-data row is still scoped by profile id. */
export const PROFILE_ID = "default";
