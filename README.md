# CC-Tracker

Personal credit card tracker: rewards, benefits, annual fees, payment deadlines and issuer eligibility (5/24 etc.). Single user, local-first, works on laptop and phone widths. See [`docs/SPEC.md`](docs/SPEC.md) for the full spec.

> **Privacy:** this repo contains **no personal data**. Your cards, dates, usage and notes live only in the local, gitignored SQLite DB (`prisma/cc-tracker.db`) and in your gitignored `seed/my-cards.json`. Test fixtures and `examples/demo-seed.json` are obviously fake.

## Setup

Requires Node.js 20+ (developed on 22).

```bash
npm install      # also generates the Prisma client
npm run dev      # creates/migrates the DB, then starts http://localhost:3000
npm test         # unit tests (Vitest)
```

On a fresh clone, `npm run dev` creates the SQLite database, applies migrations (`scripts/db-setup.mjs`) and loads `catalog/` into it on server start. No accounts, API keys or external services.

Other scripts:

| Script | What it does |
|---|---|
| `npm run typecheck` | TypeScript check |
| `npm run catalog:check` | Validate `catalog/` and print a provenance summary |
| `npm run test:e2e` | Optional Playwright smoke test (throwaway DB). To use an existing Chromium, set `PW_CHROMIUM_PATH=/path/to/chrome` |
| `npm run build && npm start` | Production build |

Set `DATABASE_URL` to use a different DB file (default `file:<repo>/prisma/cc-tracker.db`).

## Importing your seed data

1. Create `seed/my-cards.json`. The `seed/` folder is gitignored, so this file is never committed.
2. Open **Settings → Export / import**, choose **Merge** (safe to re-run) or **Replace**, and pick the file.

The import is validated before anything is written. Every `id` is optional. Missing ids are derived from the record's content, so importing the same file twice does not create duplicates. A minimal file:

```json
{
  "holdings": [
    {
      "catalogCardId": "chase-sapphire-reserve",
      "approvalDate": "2025-01-15",
      "afMonth": 1, "afDay": 15,
      "paymentDueDay": 20
    },
    { "nickname": "Some store card", "issuer": "examplebank", "accountType": "personal", "approvalDate": "2025-09-10", "status": "closed" }
  ]
}
```

Holding fields: `catalogCardId` (or `nickname` for cards not in the catalog, e.g. ones that only matter for 5/24), `approvalDate`, `status` (`open` | `closed` | `product_changed`), `closedDate`, `productChangedFromId` (set this on the new product after a product change so 5/24 counts the account once), `afMonth`/`afDay` (actual AF posting date), `paymentDueDay`, `notes`, `issuer`, `accountType`. Each holding can also carry `usages`, `payments`, `afEvents`, `lifecycle` and `activations`. Top-level `points` and `settings` are optional. **Export** writes this same format, so an export is a full backup and the migration path to a hosted DB later.

To try the app without your own data, import [`examples/demo-seed.json`](examples/demo-seed.json) (fake).

## Catalog format

The catalog is public, human-readable YAML in `catalog/`, validated with zod (`src/lib/catalog/schema.ts`) whenever it is loaded:

```
catalog/
  cards/<card-id>.yaml        # one per card product (file name = id)
  rules/<issuer>.yaml         # issuer eligibility rules
  perk-defaults.yaml          # default $ value per use of non-credit perks
  programs.yaml               # rewards programs + default cents-per-point (an assumption, overridable)
  rotating/<program>.yaml     # quarterly 5% calendars (chase-freedom, discover-5)
```

**Every fact carries provenance:** `source_url` (an official issuer page wherever possible), `last_verified` (YYYY-MM-DD) and `verified`. If a fact could not be confirmed from an official source it is `verified: false` with a `note` explaining why. Unknown amounts are `null`, never guessed. The UI shows a ⚠ Unverified badge and source link next to every fact, and the dashboard flags unverified facts that affect a pending action. The loader rejects missing provenance or an unverified fact without a note.

> v1 verification note: issuer sites could not be loaded directly from the build environment, so facts were checked using search results restricted to the issuers' own domains. Some details are marked unverified because no official source confirmed them, including Chase 5/24, Amex and Capital One velocity rules, product-change paths, some protection limits, and the Discover Q4 2026 calendar. Please spot-check before relying on them.

Key card fields: `id`, `name`, `issuer`, `network`, `account_type`, `family` (used by issuer rules), `rewards_program`, `rotating_program`, `brand_color`, `annual_fee {amount, first_year_waived}`, `earn_rates[] {categories, rate, unit, conditions, cap}`, `benefits[]`, `downgrade_options[] {target_name, keep, lose}`.

Benefit fields: `kind` (`credit` | `perk` | `protection` | `status` | `other`), `name`, `description`, `amount`, `unit` (`USD` | `count`), and `cycle` (`monthly` | `quarterly` | `semiannual` | `calendar_year` | `cardmember_year` | `per_use` | `one_time` | `none`). A `cardmember_year` benefit must also set `anniversary_basis: approval | af_date`; the cycle is always per benefit, never assumed from the AF date. Other fields: `enrollment_required`, `how_to_use`, `perk_default` (perks), `protection {coverage, conditions, how_to_claim}` (protections) and optional `starts_on` / `ends_on`.

Issuer rules use `effect: approval | bonus` and a machine-checkable `check`. The supported types are:

- `x_in_y`: at most N new accounts in a window, e.g. 5/24.
- `family_window`: e.g. 48 months since a card in the same family.
- `lifetime_family`: Amex "have or have had".
- `max_open`: a cap on open cards.
- `manual`: no automatic check.

The catalog is synced into the DB when the server starts, keyed on a content hash. A reload only rewrites the `Catalog*` tables and never touches user data. The loader (`src/lib/catalog/loader.ts`) is standalone, so a future automated routine can edit `catalog/` and the app picks the change up on restart.

## Adding a card

1. Copy an existing file in `catalog/cards/` to `catalog/cards/<new-id>.yaml`. The file name must equal `id`.
2. Fill in every fact from the issuer's official product page or Guide to Benefits, with `source_url` and `last_verified`. Anything you can't confirm gets `verified: false` plus a `note`. Don't invent amounts; use `null`.
3. If its rewards program is new, add it to `catalog/programs.yaml`. If it has perks with a dollar value, add them to `catalog/perk-defaults.yaml`. If it has rotating categories, add `catalog/rotating/<id>.yaml` and set `rotating_program`.
4. Run `npm run catalog:check` and `npm test`, then restart `npm run dev`.

## Architecture

- `src/lib/domain/`: pure, unit-tested logic for:
  - benefit periods
  - 5/24 and issuer rules
  - ROI and utilization
  - payments
  - best-card ranking
  - rotating categories
  - the needs-attention list
- `src/lib/catalog/`: the zod schema and the standalone loader.
- `src/lib/server/`: the Prisma client, catalog sync and user-data reads/writes.
- `src/app/actions.ts`: server actions. Each one returns the fresh user-data snapshot.
- `src/components/AppState.tsx`: one client-side state with optimistic updates. Every view is derived from it, so a change updates the dashboard, ROI, utilization and needs-attention immediately with no reload.
- `prisma/schema.prisma`: Postgres-compatible (JSON is stored as text). Every user-data table has `profileId`; v1 uses a single profile.
