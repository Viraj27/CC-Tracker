// Validates catalog/ and prints a provenance summary. Exit code 1 on error.
import { loadCatalog } from "../src/lib/catalog/loader";

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
  c.perkDefaults.forEach(count);
  for (const r of c.rotating) {
    count(r.rate);
    r.quarters.forEach(count);
  }
  console.log(`catalog OK — ${c.cards.length} cards, ${c.rules.length} rules, ${facts} facts (${unverified} unverified)`);
  console.log(`hash ${c.hash}`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
