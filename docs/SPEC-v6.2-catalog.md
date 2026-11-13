# CC-Tracker — v6.2 Spec: Catalog of cards you might get (brainstorm + plan)

Fills gap 8 of the competitor review. Today `catalog/cards/` holds **7 cards** (the ones held), each fully researched with per-fact provenance. CardPointers claims 5,000+ and MaxRewards 900+, but for one person the useful target is the **40–80 cards you'd realistically consider**, so "Considering a card?", Add card and the v6 welcome-offer form work *before* you apply.

> Privacy: the catalog is public (in git) and never holds personal data. Which cards you consider stays out of it.

## 1. What a prospective card needs
Different features need very different depth:

| Feature | Needs |
|---|---|
| 5/24 + "Considering a card?" rules | issuer, `account_type`, `family`, network |
| Add card picker + Wallet look | name, `brand_color`, `card_ink` |
| AF upcoming / v6.1 phases | `annual_fee` (amount, first-year waived) |
| v6 welcome-offer prefill (optional) | a current public offer, dated |
| Best card, ROI, credits, protections | `earn_rates`, `benefits` with cycles, terms, sources |

The last row is the expensive part (CSR alone is 370 lines of sourced YAML) and is only needed **once you hold the card**.

## 2. Options considered

| # | Approach | Coverage | Quality | Upkeep | Verdict |
|---|---|---|---|---|---|
| A | Hand research per card in a Claude Code session (today's method) | slow, ~1 session per full card | high: official sources, `last_verified` | manual | Keep, for full depth only |
| B | Import an open dataset: [andenacitelli/credit-card-bonuses-api](https://github.com/andenacitelli/credit-card-bonuses-api) (79 stars, synced daily; checked 2026-10-17: 175 US cards, 15 issuers, 46 business, 5 discontinued) | name, issuer, network, business flag, AF, first-year-waived, product URL, current + historical offers (spend, days, amount) | third-party; no benefit cycles (its `credits` field is a valuation list, e.g. "First checked bag free, $50") | re-run a script | **Use for stubs** |
| C | Scheduled Claude routine (the v2 idea in `SPEC.md` §2): re-verify stale facts, deepen flagged stubs, open PRs you merge | grows over time | high (same as A, reviewed in PRs) | automatic, you review | **Use for freshness + promotion** |
| D | In-app AI extraction ("paste a card URL") | on demand | variable | none | Reject: breaks "no external services, no API keys" (`SPEC.md` §3) |
| E | Scrape issuer sites | broad | fragile | high, ToS risk | Reject |
| F | Copy a competitor's database | broad | unknown | n/a | Reject: no license |

Dataset B's license is MIT + Commons Clause: personal, non-commercial use is fine; the MIT notice (with the Commons Clause condition) must ship with any copied data. This repo is public, so derived files carry that notice.

## 3. Plan: two tiers
### 3.1 Schema
- `CardSchema` gains `depth: "stub" | "full"` (default `full`, so the 7 existing cards are unchanged).
- A **stub** requires only: `id`, `name`, `issuer`, `network`, `account_type`, `family` (when a rule uses one), `rewards_program`, `brand_color`, `product_page`, `annual_fee` (with provenance). `earn_rates` and `benefits` may be empty (today `earn_rates` needs ≥ 1).
- Stub facts imported from B carry `source_type: community`, `verified: false` and `note: "imported from credit-card-bonuses-api <date>; not yet checked against product_page"` until checked. The v5 **⚠ Unverified** badge shows them honestly.
- Optional `public_offer` on stubs and full cards: `{bonus, unit, min_spend, days, as_of, source_url}`. Used **only** to prefill the v6 Welcome offer fieldset, labelled `Public offer as of Oct 17 · ⓘ`; the owner's own offer always wins (owner choice: offers are per holding).

### 3.2 Files and scripts
- Stubs live in `catalog/cards/` like full cards (one file each), so a stub becomes full by editing one file.
- `npm run catalog:import` (`scripts/catalog-import.ts`): fetches B's JSON, filters to an allow-list (`catalog/import-allowlist.yaml`, the 40–80 cards by B's `cardId` + our `id`), and writes or updates **stub** files. It never touches a `depth: full` file except `public_offer`. Output is a git diff you review; nothing is applied at runtime.
- Issuer + network mapping (`AMERICAN_EXPRESS` → `amex`, etc.) lives in the script, unit-tested. Unknown values fail loudly.
- `brand_color` for stubs: a new per-issuer default map in `cardColors.ts` (today it only has `CUSTOM_CARD_COLOR`); generic colours only, as v4 requires: no issuer artwork.
- The `catalog/` licence notice for imported data goes in `catalog/THIRD_PARTY.md`.

### 3.3 Promotion to full ("upgrade on apply")
- When you add a holding for a stub card, the card page shows `Basic card info only` with ⓘ, and the app works with what it has (5/24, AF, rules; no credits).
- Promotion is a research task (A or C): add earn rates, benefits with cycles, protections and downgrade paths from official sources, set `depth: full`, `verified: true` per fact. One PR per card.

### 3.4 Freshness (C, later)
- A scheduled Claude Code routine (monthly) runs `catalog:import` for stubs, re-checks any full-card fact with `last_verified` older than **180 days** against its `source_url`, and opens one PR with the diffs and the pages it opened. You merge or close.
- This is the `SPEC.md` v2 phase; it needs its own spec (scheduling, PR format, rate limits). Out of scope here.

## 4. Choosing the 40–80
Not decided here. A starting rule: current, non-discontinued cards from issuers whose rules are in `catalog/rules/` (Chase, Amex, Capital One, Discover) plus Citi, Bank of America, US Bank, Barclays and Wells Fargo, personal and business. Adding an issuer also needs its rules file (gap 4 in the review).

## 5. Open questions for the owner
1. The allow-list: which cards? (Could be drafted from B and trimmed by you.)
2. Should "Considering a card?" let you pick a specific catalog card (and run every rule that card's issuer + family triggers), instead of picking a rule? That's the main payoff of stubs.
3. Is a monthly routine PR acceptable noise, or quarterly?

## 6. Acceptance (tiers + import; routine excluded)
1. `catalog:check` passes with stubs and reports `N full, M stub, K unverified`.
2. `catalog:import` is idempotent: a second run with no upstream change produces no diff.
3. A stub can be added as a holding; 5/24, AF items and rules work for it; the card page shows the basic-info notice; no screen errors on empty earn rates or benefits.
4. Best card skips cards with no earn rates and says so in one line.
5. The 7 existing full cards are byte-identical after an import.
