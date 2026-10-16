import path from "node:path";

// The DB file lives in prisma/ and is gitignored. Override with DATABASE_URL.
export function defaultDatabaseUrl() {
  return `file:${path.join(process.cwd(), "prisma", "cc-tracker.db")}`;
}
