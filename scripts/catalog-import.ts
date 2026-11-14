// Writes or refreshes catalog stubs from the open dataset credit-card-bonuses-api
// (docs/SPEC-v6.2-catalog.md §3.2). Nothing runs at app runtime: the output is a git diff to review.
//
//   npm run catalog:import                       fetch the dataset and write changed files
//   npm run catalog:import -- --dry-run          list what would change
//   npm run catalog:import -- --file data.json --as-of 2026-06-08    use a saved copy
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { AllowListSchema, DATASET_REPO, DATASET_URL, DatasetCardSchema, ImportError, planImport } from "../src/lib/catalog/importStubs";
import { ProgramsFileSchema } from "../src/lib/catalog/schema";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const root = path.join(process.cwd(), "catalog");

async function main() {
  const file = opt("--file");
  let asOf = opt("--as-of");
  let raw: unknown;
  if (file) {
    if (!asOf) throw new ImportError("--file needs --as-of YYYY-MM-DD (the date the saved copy was current)");
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } else {
    const res = await fetch(DATASET_URL);
    if (!res.ok) throw new ImportError(`fetching ${DATASET_URL}: HTTP ${res.status}`);
    raw = await res.json();
    if (!asOf) {
      // The dataset's own date: when its data file last changed upstream, not today.
      const api = await fetch(`https://api.github.com/repos/${DATASET_REPO}/commits?sha=master&path=exports/data.json&per_page=1`, { headers: { "User-Agent": "cc-tracker-catalog-import" } });
      if (!api.ok) throw new ImportError(`could not read the dataset's last-updated date (HTTP ${api.status}); pass --as-of YYYY-MM-DD`);
      asOf = z.array(z.object({ commit: z.object({ committer: z.object({ date: z.string() }) }) })).parse(await api.json())[0].commit.committer.date.slice(0, 10);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new ImportError(`--as-of must be YYYY-MM-DD, got "${asOf}"`);
  const dataset = z.array(DatasetCardSchema).parse(raw);
  const allow = AllowListSchema.parse(YAML.parse(fs.readFileSync(path.join(root, "import-allowlist.yaml"), "utf8"))).cards;
  const programs = ProgramsFileSchema.parse(YAML.parse(fs.readFileSync(path.join(root, "programs.yaml"), "utf8"))).programs;

  const existing = new Map<string, { text: string; depth: "stub" | "full" }>();
  for (const f of fs.readdirSync(path.join(root, "cards")).filter((x) => x.endsWith(".yaml"))) {
    const text = fs.readFileSync(path.join(root, "cards", f), "utf8");
    existing.set(f.replace(/\.yaml$/, ""), { text, depth: YAML.parse(text)?.depth === "stub" ? "stub" : "full" });
  }
  const plan = planImport(dataset, allow, existing, programs, asOf);
  for (const w of plan.writes) {
    if (!dryRun) fs.writeFileSync(path.join(root, "cards", `${w.id}.yaml`), w.text);
    console.log(`${dryRun ? "would write" : "wrote"} ${w.kind === "stub" ? "stub " : "offer"} catalog/cards/${w.id}.yaml`);
  }
  for (const s of plan.skipped) console.log(`skipped ${s.id}: ${s.reason}`);
  console.log(`dataset of ${asOf}: ${dataset.length} cards, ${allow.length} allow-listed, ${plan.writes.length} file(s) ${dryRun ? "would change" : "changed"}`);
}

main().catch((e) => {
  console.error(e instanceof ImportError || e instanceof z.ZodError ? e.message : e);
  process.exit(1);
});
