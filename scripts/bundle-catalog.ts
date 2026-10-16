// Writes the validated catalog to src/generated/catalog.json (gitignored) so
// the Cloudflare Workers build can bundle it — Workers can't read catalog/
// from disk at runtime. Runs on install and before every build.
import fs from "node:fs";
import path from "node:path";
import { loadCatalog } from "../src/lib/catalog/loader";

const out = path.join(process.cwd(), "src", "generated", "catalog.json");
const catalog = loadCatalog();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(catalog)}\n`);
console.log(`[cc-tracker] bundled catalog: ${catalog.cards.length} cards (hash ${catalog.hash.slice(0, 12)}) -> ${path.relative(process.cwd(), out)}`);
