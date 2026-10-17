# CC-Tracker

Personal credit card tracker: rewards, benefits, annual fees, payment deadlines and issuer eligibility (5/24 etc.). Single user, works on laptop and phone widths. See [`docs/SPEC.md`](docs/SPEC.md) for the full spec.

Runs locally (`npm run dev`, SQLite) or hosted on **Cloudflare Workers + D1 behind Cloudflare Access**, installable on an iPhone as a home-screen app. To deploy, follow **[`docs/DEPLOY.md`](docs/DEPLOY.md)**; the v3 spec is [`docs/SPEC-v3-phone.md`](docs/SPEC-v3-phone.md).

> **Privacy:** this repo contains **no personal data and no secrets**. Your cards, dates, usage and notes live only in the local, gitignored SQLite DB (`prisma/cc-tracker.db`), in your gitignored `seed/my-cards.json`, and (if you deploy) in your own Cloudflare D1 database. Cloudflare credentials are GitHub Actions secrets only. Test fixtures and `examples/demo-seed.json` are obviously fake.

## Screens

The v5 "App pass" ([`docs/SPEC-v5-app-pass.md`](docs/SPEC-v5-app-pass.md)) makes the phone UI feel like an app: one line per item, details in sheets, no explanatory paragraphs, provenance behind ⓘ. It builds on the v4 "Wallet" design ([`docs/SPEC-v4-wallet.md`](docs/SPEC-v4-wallet.md)), a stack of physical-looking cards, and v4.1 Skip ([`docs/SPEC-v4.1-skip.md`](docs/SPEC-v4.1-skip.md)). Screenshots (demo seed only, light and dark, desktop and 390px) are in [`docs/screenshots/`](docs/screenshots/): `wallet-*`, `card-*`, `up-next-*` (one row swiped), `sheet-*` (a credit sheet with ⓘ open), `eligibility-*`, `up-next-skipped-*`.

**Everywhere:** large titles (34px) with no intro paragraphs (a screen's help, where it has any, sits behind an ⓘ next to the title); iOS-style inset grouped lists (a list surface slightly lighter than the ground, 14px radius, hairline separators) with mono caps section labels; one-line rows: the thing on the first line (`DoorDash`, `Payment due`, `Annual fee`, `Activate Q4 5%`), the card's short name on the second, amount over date on the right (urgent colour when due soon). Tapping a row opens a **sheet**: a bottom sheet on phones, a right-side panel on desktop. Sheets close on a backdrop tap, a drag down, Esc or ✕; focus stays inside while open and returns to the row after. **Provenance** (source link, checked date, a one-line description) hides behind a small ⓘ (`Source`, 32px target) on every fact; **⚠ Unverified** and **Community curated** badges always stay visible.

| Screen | What's there |
|---|---|
| **Wallet** (`/`) | Phone: large title **Wallet** with the 5/24 count pill; **UP NEXT** with the top 3 items as one-line rows (tap → the item's sheet) and `ALL n →`; **CARDS · n**, the stack as ~58px strips (name + state chip like `PAST DUE`, `FEE IN 30D`) with the last card in full. Tapping a card pushes its **Card page**. Desktop (≥ 1024px): the header line (open cards, 5/24, next drop-off), an **Up next strip** (short titles, each with its action and a quiet **Skip**, `N SKIPPED · SHOW` at the end), the stack on the left (selected card in full; click or arrow keys; the selection is in the URL, `/?card=<id>`) and the selected card's Card page on the right. |
| **Card page** (`/cards/<id>`) | Nav bar `‹ Wallet` / **Edit** (edit-card sheet: every holding field, reminders, delete). A short banner in the card's colour (name, issuer · pay-by day, annual fee), the one-sentence headline, and a stat strip: **Left** (unused credits this period), **ROI** (this AF year; tap for the breakdown sheet), **5/24** (drop-off date or `Out`). **CREDITS**, soonest expiry first: name / `CYCLE · EXPIRY` / remaining / `›`. Tap → the **credit sheet**: Left and Expires, quick amounts (`$5`, `$10`, remaining pre-selected, `Other`), a **Log $X** pill, amount / date / note under **More options**, this period's uses (deletable), **Skip this month** when it's in Up next, and the **Reminders on/off** switch. Cards with rotating categories get a **ROTATING 5%** row (this quarter's categories, activated or not) → a sheet with this and next quarter, the activation checkboxes and the reminders switch. Then drill-in rows with counts, each opening a sheet: **Perks** (each perk: log a count with a value override, value per use, reminders), **Other benefits**, **Protections & insurance** (coverage, conditions, how to claim), **Earn rates**, **Downgrade options** (Community curated badge on the row) with links to **Fee history** (fee, posting date, AF events, add/delete) and **Lifecycle log** (retention calls, product changes, closures). Deep links still work: `#downgrade`, `#edit`, `#benefit-<id>`, `#af-history`, `#lifecycle`, `?log=<benefit>` open the matching sheet. |
| **Up next** (`/up-next`) | Large title with `N SKIPPED · SHOW` on the right. **NEXT 14 DAYS** and **LATER** groups of one-line rows with a card-colour bar: annual fees within the lead time, expiring credits, payments due or past due, rotating quarters to activate, unverified facts behind any of them. **Swipe a row left** (touch or mouse drag) for **Skip** and its action (`Log`, `Paid`, `Activate`, `Options`); one row opens at a time. Without swiping: tap the row for its sheet (same actions: Mark paid, Mark activated, Log, See options; **Skip this month/quarter/one**; **Stop reminding me** for credits and rotating), or Tab to the row and on to its actions (desktop: hover). Skip hides that occurrence only (nothing is marked paid, used or activated); payments and annual fees can only be skipped, never muted. The revealed skipped list has Unskip / Turn reminders back on. |
| **5/24** (`/eligibility`) | Count and status, counted cards with drop-off dates, the count going forward, and "Considering a card?" issuer-rule checks (rule text and source behind ⓘ, Community badge visible). |
| **Payments**, **Rotating**, **Best card**, **Points**, **Settings** | Per card, statements to mark paid (past due highlighted); this and next quarter's categories and activation ("Reminders off" on cards you muted); open cards ranked for a spend category; points balances and estimated value; lead times, perk values (Unverified badges visible), cents per point, export / import. |
| **Add card** (`/cards`) | Add a catalog or custom card and list every card, closed and product-changed ones included. With no cards, the Wallet shows a Get started list. |

On phones (< 1024px) there is no top bar; a bottom tab bar has **Wallet · Up next · 5/24 · More**, and More lists the other screens. Light and dark follow the system theme. Type is Hanken Grotesk and Space Mono, self-hosted at build time by `next/font`.

## Setup

Requires Node.js 20+ (developed on 22).

```bash
npm install      # also generates the Prisma client
npm run dev      # creates/migrates the DB, then starts http://localhost:3000
npm test         # unit + storage tests (Vitest), incl. a local Cloudflare D1
```

On a fresh clone, `npm run dev` creates the SQLite database, applies migrations (`scripts/db-setup.mjs`) and loads `catalog/` into it on server start. No accounts, API keys or external services.

Other scripts:

| Script | What it does |
|---|---|
| `npm run typecheck` | TypeScript check |
| `npm run catalog:check` | Validate `catalog/` and print a provenance summary |
| `npm run test:e2e` | Playwright end-to-end tests (throwaway DB), incl. touch swipes (`e2e/app-pass.spec.ts`) and WCAG contrast in both themes (`e2e/contrast.spec.ts`). To use an existing Chromium, set `PW_CHROMIUM_PATH=/path/to/chrome`. Against the Workers build: run `npm run preview`, then `E2E_BASE_URL=http://localhost:8787 npm run test:e2e`. `SCREENSHOTS=1 npm run test:e2e -- screenshots` regenerates `docs/screenshots/` |
| `npm run build && npm start` | Production build (Node) |
| `npm run preview` | Build the Cloudflare Worker and run it locally in workerd against a local D1 (http://localhost:8787) |
| `npm run cf:build` | Build the Worker bundle only (`.open-next/`) |
| `npm run cf:migrate:local` / `cf:migrate:remote` | Apply `prisma/migrations` to the local / hosted D1 |
| `npm run cf:d1:ensure`, `npm run cf:deploy` | Used by CI to deploy (see [`docs/DEPLOY.md`](docs/DEPLOY.md)) |
| `node scripts/generate-icons.mjs` | Regenerate the PWA icons in `public/icons/` |

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

Holding fields: `catalogCardId` (or `nickname` for cards not in the catalog, e.g. ones that only matter for 5/24), `approvalDate`, `status` (`open` | `closed` | `product_changed`), `closedDate`, `productChangedFromId` (set this on the new product after a product change so 5/24 counts the account once), `afMonth`/`afDay` (actual AF posting date), `paymentDueDay`, `notes`, `issuer`, `accountType`. Each holding can also carry `usages`, `payments`, `afEvents`, `lifecycle`, `activations`, `skips` (`{kind, benefitId, period, date}`, one skipped Up next occurrence) and `mutes` (`{kind: "rotating" | "benefit", benefitId, date}`, "Don't remind me"). Exports are format version 2. Version 1 files (no skips or mutes) still import. Top-level `points` and `settings` are optional. **Export** writes this same format, so an export is a full backup and the migration path to a hosted DB later.

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

**Every fact carries provenance:** `source_url` (an official issuer page wherever possible), `last_verified` (YYYY-MM-DD) and `verified`. If a fact could not be confirmed from an official source it is `verified: false` with a `note` explaining why. Unknown amounts are `null`, never guessed. The UI shows a ⚠ Unverified badge on every unverified fact and its source behind an ⓘ, and Up next flags unverified facts that affect a pending action. The loader rejects missing provenance or an unverified fact without a note.

**Community curated:** facts issuers never publish (Chase 5/24, product-change paths) carry `source_type: community`, a community `source_url` and a `note`. The UI shows them with a "Community curated" badge instead of the unverified warning. Omitted `source_type` means `official`.

> Verification note (2026-10-16): catalog facts were re-checked against issuer pages and Guides to Benefits. Remaining non-official items are community curated (5/24, product-change paths); the United Club pass price and United bag fee are still unverified — set your own values in Settings.

Key card fields: `id`, `name`, `issuer`, `network`, `account_type`, `family` (used by issuer rules), `rewards_program`, `rotating_program`, `brand_color` and `card_ink` (the Wallet card's fill and text colour: generic colours only, no logos; ink must reach 4.5:1 on the fill), `annual_fee {amount, first_year_waived}`, `earn_rates[] {categories, rate, unit, conditions, cap}`, `benefits[]`, `downgrade_options[] {target_name, keep, lose}`.

Benefit fields: `kind` (`credit` | `perk` | `protection` | `status` | `other`), `name`, optional `short_name` (the one-line row title, e.g. `DoorDash`; display only, derived from `name` when omitted), `description`, `amount`, `unit` (`USD` | `count`), and `cycle` (`monthly` | `quarterly` | `semiannual` | `calendar_year` | `cardmember_year` | `per_use` | `one_time` | `none`). A `cardmember_year` benefit must also set `anniversary_basis: approval | af_date`; the cycle is always per benefit, never assumed from the AF date. Other fields: `enrollment_required`, `how_to_use`, `perk_default` (perks), `protection {coverage, conditions, how_to_claim}` (protections) and optional `starts_on` / `ends_on`.

Issuer rules use `effect: approval | bonus` and a machine-checkable `check`. The supported types are:

- `x_in_y`: at most N new accounts in a window, e.g. 5/24.
- `family_window`: e.g. 48 months since a card in the same family.
- `lifetime_family`: Amex "have or have had".
- `max_open`: a cap on open cards.
- `manual`: no automatic check.

The catalog is synced into the DB when the server starts (on Cloudflare: on the first request after a deploy, from a copy bundled at build time), keyed on a content hash. A reload only rewrites the `Catalog*` tables and never touches user data. The loader (`src/lib/catalog/loader.ts`) is standalone, so a future automated routine can edit `catalog/` and the app picks the change up on restart.

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
  - Up next skips and reminder mutes (`skips.ts`: stable occurrence keys, visible vs skipped split)
- `src/lib/catalog/`: the zod schema and the standalone loader.
- `src/lib/server/`: database access (`db.ts`: local SQLite under Node, D1 via `@prisma/adapter-d1` on Workers), catalog sync and user-data reads/writes. Bulk writes (catalog sync, import) run as one atomic batch (`dbHandle.ts`), because D1 doesn't support Prisma transactions and limits queries per request.
- `src/app/actions.ts`: server actions. Each one returns the fresh user-data snapshot.
- `src/components/AppState.tsx`: one client-side state with optimistic updates. Every view is derived from it, so a change updates the Wallet, ROI, utilization and Up next immediately with no reload.
- `src/components/Wallet.tsx`, `WalletCard.tsx`, `CardPage.tsx`, `UpNext.tsx`: the Wallet, the Card page and Up next (one DOM for phone and desktop; the layout switches at 1024px in CSS). Stack order, card chips and headlines are pure functions in `src/lib/domain/wallet.ts`; one-line titles are `AttentionItem.short` (`attention.ts`) and `benefitShortName` (`holdings.ts`).
- `src/components/Sheet.tsx`, `CardSheets.tsx`, `LogUse.tsx`: sheets (a native modal `<dialog>` in a portal, with a drill-in stack), their content (item, credit/benefit, ROI, rotating, drill-in lists, edit), and logging a use. `ui.tsx` has the shared pieces: large titles, grouped lists, one-line rows, provenance behind ⓘ.
- `prisma/schema.prisma`: Postgres-compatible (JSON is stored as text). Every user-data table has `profileId`; v1 uses a single profile. `prisma/migrations/` is the single migration history for both local SQLite and D1.
- `wrangler.jsonc`, `open-next.config.ts`, `.github/workflows/ci.yml`: Cloudflare Workers config and CI/CD. `public/manifest.webmanifest` and `public/icons/`: the PWA.
