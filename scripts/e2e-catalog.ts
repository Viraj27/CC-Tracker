// Builds the catalog the e2e run uses: a copy of catalog/ with the made-up feed from
// e2e/feedFixture.ts in place of the committed (empty) one. Point CATALOG_DIR at the result.
//   tsx scripts/e2e-catalog.ts <out dir>
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { fixtureFeed, localToday } from "../e2e/feedFixture";
import { loadCatalog } from "../src/lib/catalog/loader";

const out = process.argv[2];
if (!out) {
  console.error("usage: tsx scripts/e2e-catalog.ts <out dir>");
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(process.cwd(), "catalog"), out, { recursive: true });
const feed = fixtureFeed(localToday());
const dir = path.join(out, "feed");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "sources.yaml"), YAML.stringify({ sources: feed.sources }));
fs.writeFileSync(path.join(dir, "deals.json"), `${JSON.stringify(feed.deals, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "changelog.json"), `${JSON.stringify(feed.changelog, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "meta.json"), `${JSON.stringify(feed.meta, null, 2)}\n`);
const c = loadCatalog(out); // validates, including the reference checks
console.log(`e2e catalog: ${c.cards.length} cards, ${c.feed.deals.length} deals, ${c.feed.changelog.length} changelog entries -> ${out}`);
