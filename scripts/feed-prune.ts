// Retention for catalog/feed/deals.json (docs/SPEC-v9-daily-refresh.md §4.2): drops items past their
// `expires` date, or 30 days after `published` when they have none, and sorts newest first.
//   npm run feed:prune                 as of today
//   npm run feed:prune -- --today 2026-11-13
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DealSchema } from "../src/lib/catalog/schema";
import { localToday } from "../src/lib/domain/dates";
import { pruneDeals } from "../src/lib/domain/deals";

const args = process.argv.slice(2);
const today = args.includes("--today") ? args[args.indexOf("--today") + 1] : localToday();
const file = path.join(process.cwd(), "catalog", "feed", "deals.json");
const deals = z.array(DealSchema).parse(JSON.parse(fs.readFileSync(file, "utf8")));
const kept = pruneDeals(deals, today);
fs.writeFileSync(file, `${JSON.stringify(kept, null, 2)}\n`);
console.log(`deals.json: kept ${kept.length} of ${deals.length} as of ${today}`);
