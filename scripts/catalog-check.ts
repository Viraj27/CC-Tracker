// Validates catalog/ (cards, rules, feed) and prints a provenance summary. Exit code 1 on error.
//
//   npm run catalog:check                      validate
//   npm run catalog:check -- --base origin/main    also fail if a benefit id on that ref is missing now
//                                               (logged usage points at benefit ids; docs/SPEC-v9-daily-refresh.md §5.3, §6)
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { loadCatalog } from "../src/lib/catalog/loader";
import { missingBenefitIds } from "../src/lib/domain/deals";

const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : undefined;
const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

try {
  const c = loadCatalog();
  let facts = 0;
  let unverified = 0;
  const count = (x: { verified: boolean }) => {
    facts++;
    if (!x.verified) unverified++;
  };
  for (const card of c.cards) {
    count(card.annual_fee);
    card.earn_rates.forEach(count);
    card.benefits.forEach(count);
    card.downgrade_options.forEach(count);
  }
  c.rules.forEach(count);
  c.afPolicies.forEach(count);
  c.perkDefaults.forEach(count);
  for (const r of c.rotating) {
    count(r.rate);
    r.quarters.forEach(count);
  }

  if (base) {
    // Card files as they are on the base ref. Only ids are read, so an older schema still parses.
    const files = git("ls-tree", "-r", "--name-only", base, "catalog/cards/").split("\n").filter((f) => /\.ya?ml$/.test(f));
    const before = files.map((f) => {
      const doc = YAML.parse(git("show", `${base}:${f}`)) as { id: string; benefits?: { id: string }[] };
      return { id: doc.id, benefits: doc.benefits ?? [] };
    });
    const missing = missingBenefitIds(before, c.cards);
    if (missing.length) {
      throw new Error(
        `benefit ids on ${base} are missing now (logged usage points at them; end a benefit with ends_on instead of removing it):\n  - ${missing.join("\n  - ")}`,
      );
    }
    console.log(`no benefit id from ${base} is missing (${before.length} cards compared)`);
  }

  const stubs = c.cards.filter((x) => x.depth === "stub").length;
  console.log(`catalog OK — ${c.cards.length} cards (${c.cards.length - stubs} full, ${stubs} stub), ${c.rules.length} rules, ${c.afPolicies.length} fee policies, ${facts} facts (${unverified} unverified)`);
  console.log(`feed OK — ${c.feed.sources.length} source(s), ${c.feed.deals.length} deal(s), ${c.feed.changelog.length} changelog entr${c.feed.changelog.length === 1 ? "y" : "ies"}, last run ${c.feed.meta.ran_at ?? "never"} (${c.feed.meta.status})`);
  console.log(`hash ${c.hash}`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
