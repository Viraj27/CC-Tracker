// Creates the local SQLite database (if missing) and applies migrations.
// Runs automatically before `npm run dev` / `npm run build`.
import { execSync } from "node:child_process";
import { defaultDatabaseUrl } from "./db-url.mjs";

process.env.DATABASE_URL ||= defaultDatabaseUrl();
execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
