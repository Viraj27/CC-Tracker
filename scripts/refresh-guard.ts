// The checks that stand in for a review of a "Daily refresh" pull request
// (docs/SPEC-v9-daily-refresh.md §6). Compares the working tree with a base ref.
//
//   npm run refresh:guard -- --base origin/main            print the decision
//   npm run refresh:guard -- --base origin/main --paths-only   CI: fail if anything outside catalog/ changed
//
// Decision (last line, `decision=<value>`):
//   auto         only catalog/ changed, at most 10 facts, no annual fee: merge when CI is green
//   needs-owner  leave the PR open with the `needs-owner` label
//   reject       files outside catalog/ changed (exit code 1)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { z } from "zod";
import { ChangelogEntrySchema } from "../src/lib/catalog/schema";
import { guardRun } from "../src/lib/domain/deals";

const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "origin/main";
const pathsOnly = args.includes("--paths-only");
const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });

try {
  // Committed changes since the merge base, plus anything not committed yet (the routine runs this before committing).
  const mergeBase = git("merge-base", base, "HEAD").trim();
  const changed = new Set(
    [git("diff", "--name-only", mergeBase), git("ls-files", "--others", "--exclude-standard")]
      .join("\n")
      .split("\n")
      .filter(Boolean),
  );
  const log = z.array(ChangelogEntrySchema);
  let before: z.infer<typeof log> = [];
  try {
    before = log.parse(JSON.parse(git("show", `${mergeBase}:catalog/feed/changelog.json`)));
  } catch {
    // No changelog on the base yet: everything in it is new.
  }
  const file = "catalog/feed/changelog.json";
  const now = fs.existsSync(file) ? log.parse(JSON.parse(fs.readFileSync(file, "utf8"))) : [];
  const result = guardRun([...changed], before, now);

  console.log(`${changed.size} file(s) changed against ${base}; ${result.added.length} changelog entr${result.added.length === 1 ? "y" : "ies"} added`);
  for (const r of result.reasons) console.log(`- ${r}`);
  if (pathsOnly) {
    if (result.outside.length) {
      console.error("A Daily refresh pull request may only change files under catalog/.");
      process.exit(1);
    }
    console.log("paths OK — only catalog/ changed");
  } else {
    console.log(`decision=${result.decision}`);
    if (result.decision === "reject") process.exit(1);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
