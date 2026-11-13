# CC-Tracker — v9 Spec: Daily refresh (benefit changes and deals)

This is the "v2" phase of `SPEC.md` §2 and the freshness routine sketched in `SPEC-v6.2-catalog.md` §3.4, with two owner decisions that differ from those sketches:
- changes are **merged automatically**, not approved by the owner;
- the routine runs **daily**, and also keeps a **deals feed** (credit card offers and shopping deals; no bank account bonuses).

> Privacy: the routine reads and writes only the public repo. It never sees the database, so it never knows which cards the owner holds. Anything "for your cards" is matched in the app at render time.

## 1. Why
Today the catalog changes only when someone researches it by hand. Issuers change benefits several times a year, and offers come and go in days. The owner wants to open the app and find it current without watching blogs.

"Current" means **as of the last daily run**. The app does not fetch anything when opened (`SPEC.md` §3: no external services at runtime); it shows the run date.

## 2. Shape
- A **scheduled Claude Code routine** (cloud, once a day) checks out the repo, runs the steps in §3 to §5, and opens one pull request, `Daily refresh YYYY-MM-DD`.
- The PR **merges itself** when CI passes (§6). The existing deploy job then ships it; the catalog is bundled at build time and loaded into D1 on the first request (`DEPLOY.md`).
- The routine's instructions live in the repo at `routines/daily-refresh.md`, so they are versioned and reviewable.
- Everything the routine writes is under `catalog/`.

```
catalog/
  feed/sources.yaml     # where the routine looks (owner-edited)
  feed/deals.json       # the deals feed (routine-written)
  feed/changelog.json   # every catalog fact the routine changed (routine-written)
  feed/meta.json        # { ran_at, items_seen, status }
```

## 3. Sources
- `sources.yaml` lists feeds, each `{ id, name, url, kind: rss, trust: community }`.
- **First source:** the Doctor of Credit RSS feed (`https://www.doctorofcredit.com/feed/`; checked 2026-11-12, returns current posts).
- The routine reads the feed and, when it needs detail, the post it links to. It stores **facts and a link**, never the post's text (§4.2).
- Adding a source is a one-line edit. Sites without a feed are out of scope for now.

## 4. Deals feed

### 4.1 What goes in
Each new post is classified:

| Kind | Examples | Kept |
|---|---|---|
| `card_offer` | welcome bonus, upgrade or retention offers, spending offers | yes |
| `card_linked` | Chase Offers, Amex Offers, Capital One Offers | yes |
| `shopping` | merchant or portal deals, gift card deals | yes |
| other | bank account bonuses, brokerage offers, news, opinion | no |

### 4.2 Item
```json
{
  "id": "doc-2026-11-12-chase-aeroplan-60k",
  "kind": "card_offer",
  "title": "Chase Aeroplan: 60,000 points + 1.5x up to 20,000",
  "url": "https://www.doctorofcredit.com/…",
  "source": "doctorofcredit",
  "published": "2026-11-12",
  "expires": null,
  "card_id": "chase-aeroplan",
  "issuer": "chase",
  "offer": { "bonus": 60000, "unit": "points", "min_spend": 3000, "days": 90 }
}
```
- `title` is the routine's own one-line wording. `card_id` and `issuer` are set only when the item clearly maps to a catalog card or a known issuer; `offer` only for `card_offer` items where the post states the numbers.
- Every item is community-sourced and shown that way.
- **Retention:** an item leaves the feed at its `expires` date, or 30 days after `published` when it has none.

### 4.3 Offers into the catalog
When a `card_offer` item maps to a catalog card, the routine also updates that card's `public_offer` (v6.2 §3.1) with `source_type: community`, `as_of` and the post as `source_url`, and logs the old value in the changelog. This gives v8 **Find a card** its offers and, over time, the history behind its `Elevated` flag.

### 4.4 In the app
- **Route:** `/deals`, under **More** as **Deals**, with the run date at the top: `Updated Nov 12`. If `ran_at` is more than 3 days old the line turns into a warning: `Not updated since Nov 8`.
- **Groups**, in this order:
  1. **For your cards**: items whose `card_id` matches an open holding, or `card_linked` items whose `issuer` matches one.
  2. **New card offers**: other `card_offer` items; a row links to **Should I apply?** for catalog cards.
  3. **Shopping**: the rest.
- **Row** (one line, v5): title / source and date / expiry if any. Tap opens the source in a new tab. A row can be **dismissed** (existing `Dismissal` model, key `deal:<id>`).
- Deals never appear in **Up next**. The **More** entry shows a dot when there are unseen items in *For your cards*.

## 5. Benefit changes

### 5.1 Scope and triggers
The routine keeps `depth: full` cards accurate. A fact is re-checked when either:
- a feed post reports a change to a full catalog card (the trigger for cases like the Sapphire Reserve DoorDash and Lyft changes); or
- its `last_verified` is older than 180 days (at most 10 such facts per run, oldest first, to bound the run).

### 5.2 Confirm, then change
News is the trigger, not the source: in the same run that sees a post, the routine opens the card's official page and checks the change there.
- **Confirmed on the official page** (the fact's `source_url`, or the issuer page the post cites): edit the YAML, set `last_verified` to today, `verified: true`, and log it.
- **Not confirmable** (page unreachable, bot wall, or it still shows the old terms): the catalog is **not** changed. The routine adds a `reported_change` item to the feed tied to the card, e.g. `Reported: DoorDash credit changes Jan 1 · not on Chase's page yet`. It retries on later runs until confirmed or 30 days pass.
- A news post alone never changes an amount, a cycle or a date.

### 5.3 Rules that protect the owner's data
- **Never delete or rename a benefit `id`.** Usage rows point at it. A benefit that ends gets `ends_on`; a replacement is a new benefit with `starts_on`. Both fields already exist in `BenefitSchema`.
- **Changes announced for a future date** use `ends_on` / `starts_on`, so the app keeps showing today's terms until then.
- Catalog loads never touch user data (`SPEC.md` §10); this spec does not change that.

### 5.4 Changelog and the app
- Each changed fact appends to `changelog.json`: `{ date, card_id, path, from, to, effective, source_url, confirmed_by }`.
- **Deals page → What changed:** a fourth group listing changelog entries from the last 60 days, newest first: `Sapphire Reserve · DoorDash credit · $5/mo → $10/mo · from Jan 1` with ⓘ for the source.
- **Card page:** a card with an entry in the last 30 days shows a `CHANGED NOV 12` chip that opens the same list filtered to that card.
- **Something looks wrong:** each entry has a **Report** link that opens a prefilled GitHub issue (card, path, from, to, PR link). Reverting the day's PR is the fix; the next run will not re-apply a change whose issue is open (the routine reads open issues labelled `refresh`).

## 6. Automatic merge and its guards
The owner chose no review step. These checks stand in for it:

| Guard | How |
|---|---|
| Only catalog files change | CI fails a `Daily refresh` PR that touches anything outside `catalog/` |
| The catalog still validates | CI runs `npm run catalog:check` (new step), `typecheck`, `test`, `cf:build` |
| No orphaned usage | `catalog:check` fails if a benefit `id` present on `main` is missing in the PR |
| Blast radius | more than 10 catalog facts changed in one run, or any change to `annual_fee`, leaves the PR **open** with the label `needs-owner` instead of merging |
| Feed shape | `deals.json`, `changelog.json` and `meta.json` are validated by zod schemas in `catalog:check` |

**Repo setup needed (checked 2026-11-12: `allow_auto_merge` is off and `main` is unprotected):**
1. Turn on **Allow auto-merge** and protect `main` with the CI check required. The routine then runs `gh pr merge --auto --squash`.
2. Turn on **Automatically delete head branches**.
3. Give the routine a token that can open and merge PRs in this repo only.

## 7. When the routine fails
- A failed or partial run writes `meta.json` with `status: "failed"` and a reason when it can; the Deals page shows the stale-date warning either way (§4.4).
- A run that finds nothing new still updates `ran_at`, so "no news" and "not running" look different.
- A failing CI leaves the PR open; the next run closes it and starts fresh from `main`.

## 8. Tests
- Unit: feed schemas; deal grouping against holdings (card match, issuer match, neither); retention; dismissal; stale-date warning; changelog filtering by card and age.
- `catalog:check`: missing benefit id fails; out-of-schema feed files fail.
- CI: a fixture PR touching `src/` under the `Daily refresh` title fails the path guard.
- Routine dry run: `routines/daily-refresh.md` run locally against a saved copy of the feed produces a diff limited to `catalog/` and passes `catalog:check`.
- e2e (390px and desktop): Deals page groups, dismiss, What changed, the card chip; contrast in both themes.

## 9. Acceptance
1. A day after setup, the Deals page shows items dated that day and `Updated <today>`, with no manual step.
2. An offer for a held card's issuer appears under **For your cards**; the repo contains nothing that says which cards are held.
3. A confirmed benefit change reaches the app within one run, appears under **What changed** with its source, and no logged usage is lost.
4. An unconfirmed report changes no catalog fact and shows as `Reported`.
5. A run that would change an annual fee, or more than 10 facts, waits for the owner.
6. Three days without a run shows the warning.

## 10. Open items
1. **Doctor of Credit's terms** for automated reading of its feed have not been checked. The design stores only facts and links; confirm before the first run.
2. **Usage cost** of a daily run is unmeasured. Measure the first week and fall back to weekdays or weekly if it is too much.
3. **The v6.2 offers dataset** (`credit-card-bonuses-api`) had its last repo push on 2026-06-08 (checked 2026-11-12), though v6.2 describes it as synced daily. If it is stale, §4.3 becomes the only source of `public_offer`, and v6.2's import is used for stub basics only.
4. **Issuer pages behind bot walls** will make some confirmations fail (§5.2). Track how often in `meta.json` before deciding whether that needs a better fetch method.
