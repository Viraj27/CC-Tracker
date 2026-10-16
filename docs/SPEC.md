# CC-Tracker — Product & Technical Spec (v1)

Personal credit card tracker: rewards, benefits, annual fees (AF), payment deadlines, and issuer eligibility (5/24 etc.). Single user. Laptop-first, phone-ready.

> **Privacy rule:** this repo contains NO personal data. The owner's cards, dates, usage and notes live only in a local, gitignored database and are loaded from a gitignored `seed/my-cards.json` via the app's Import feature. Never commit personal data, never hard-code it, and never create fixtures that look like the owner's real portfolio — use clearly fake demo data for tests.

---

## 1. Goals

1. Always know **5/24 status** and when each card drops off; see per-issuer eligibility rules before applying for a new card.
2. Know **every benefit** on each held card — including niche ones (insurance, protections) — with key terms and an official source link.
3. **Log benefit usage** (amount + note) and see utilization and **ROI vs AF** per card.
4. Never miss an **AF posting** (time to call for retention / downgrade) or a **monthly payment** (all cards are manual pay).
5. A clean, interactive UI where marking a benefit used updates everything else automatically.

## 2. Phasing

| Phase | Scope |
|---|---|
| **v1 (this build)** | Everything in §4–§9. Local web app, local DB. |
| v2 | Scheduled Claude Code routine that checks official issuer pages and opens PRs updating `catalog/` (owner approves by merging). Third-party data in-app: CSR "The Edit" hotels and CSR "Exclusive Tables" (OpenTable) restaurant lists, refreshed on a schedule — only where source terms allow; otherwise link out. |
| v3 | Phone access: host the app (with login) or reach the Mac via Tailscale; PWA "Add to Home Screen". One shared DB — no device sync. |

v1 must be designed so v2/v3 need no rewrite (see §10).

## 3. Tech stack

- **Next.js (App Router) + TypeScript**, **Tailwind CSS**.
- **Prisma + SQLite** for v1 (DB file gitignored). Schema must stay Postgres-compatible so v3 can switch provider.
- **Vitest** for unit tests; Playwright optional for a smoke test.
- Responsive, mobile-first layout from day one. Light/dark follows system theme.
- No external services, accounts or API keys in v1.

## 4. Data architecture

Two clearly separated layers:

### 4.1 Catalog (public, in git) — `catalog/`
Human-readable YAML (or JSON) files, validated by a schema (zod) at load time. Loaded/upserted into the DB on app start (track a catalog version/hash so re-loads are idempotent and never touch user data).

```
catalog/
  cards/<card-id>.yaml        # one per card product
  rules/<issuer>.yaml         # issuer eligibility rules
  perk-defaults.yaml          # default $ values for non-credit perks
  rotating/chase-freedom.yaml # Freedom Flex 5% calendar by quarter
```

**Every factual field carries provenance:** `source_url` (official issuer page / benefits guide preferred) and `last_verified` (date). Facts that cannot be verified from an official source must be marked `verified: false` with a `note` explaining why. **Do not invent amounts, terms, or dates.** If unknown, leave null and flag it.

Card file contents:
- id, name, issuer, network, personal/business, current AF, AF waived first year (bool)
- **Earn rates** by category (for the best-card helper)
- **Benefits**, each with:
  - `kind`: `credit` (dollar credit) | `perk` (non-credit, e.g. free checked bag, lounge pass) | `protection` (insurance/protection) | `status` | `other`
  - name, description, amount (for credits), unit (USD / count)
  - `cycle`: `monthly` | `quarterly` | `semiannual` | `calendar_year` | `cardmember_year` | `per_use` | `one_time` | `none`
  - for protections: key terms — coverage limits, conditions (e.g. "must pay with this card"), how to claim
  - how to use / enrollment required (bool)
  - source_url, last_verified, verified
- **Downgrade / product-change options**: target products, what you keep/lose, source (official or community data points — mark community DPs `verified: false`).

Catalog scope for v1 = the owner's 7 card products only:
1. Discover it Cash Back
2. Chase Freedom Flex
3. Chase Sapphire Reserve
4. Wells Fargo Autograph
5. Capital One Venture X
6. Chase United Explorer
7. Amex Delta SkyMiles Gold

Note: some benefits reset on the **calendar year** even when the AF cycle is anniversary-based (e.g. several CSR credits). The cycle must be per-benefit, never assumed from the card's AF date.

Issuer rules (`rules/`): e.g. Chase 5/24, Sapphire bonus 48-month rule, Amex "have or have had" bonus language, Citi/Capital One/others as relevant. Each rule: id, issuer, plain-English description, machine-checkable parameters where possible (window months, counted account types), source_url, last_verified, verified. Rules change — the UI must always show `last_verified` and a "verify before applying" note.

### 4.2 User data (private, local DB only)
Entities (indicative — refine as needed):
- **Holding**: catalog card id, approval date, open/closed/product-changed, AF month/day (actual posting date), payment due day, notes.
- **BenefitUsage**: holding, benefit, period key (e.g. `2026`, `2026-H2`, `2026-Q4`, `cm-2025-06`), amount used, value override, date, note. Partial use supported; multiple entries per period.
- **PaymentRecord**: holding, statement month, due date, paid (bool), paid date.
- **AnnualFeeEvent**: holding, posted date, amount, outcome (paid / retention offer / downgraded / closed).
- **LifecycleEvent**: holding, type (`retention_call` | `product_change` | `closure`), date, details (offer, accepted/declined, from→to product).
- **PointsBalance**: program (Chase UR, Capital One Miles, United, Delta, Discover cashback, …), balance, as-of date, optional cents-per-point for est. value.
- **RotatingActivation**: holding, quarter, activated (bool), date.
- **Settings**: lead times, perk value overrides.

## 5. Features (v1)

### 5.1 Action dashboard (home)
Top to bottom:
1. **5/24 status**: count + next drop-off date (and which card).
2. **Needs attention** (sorted by urgency):
   - AF posting within lead time — with prompt: "call for retention / downgrade / cancel?" and link to the card's downgrade options.
   - Credits expiring within lead time with remaining unused value.
   - Payments due within lead time and not marked paid.
   - Freedom Flex quarter not activated.
   - Catalog items flagged `verified: false` that affect a pending action.
3. **Cards strip**: each card with utilization % (value used / value available this cycle) and ROI vs AF; tap → card page.

Lead time defaults (configurable in Settings): **AF 45 days, expiring credits 30 days, payments 7 days**.

### 5.2 Card page
- Header: AF, AF posting date, approval date, payment due day, 5/24 drop-off date.
- Benefits grouped by kind; each credit shows current period, used / remaining, expiry date; one-tap "log use" (amount defaults to remaining, editable; optional note and date).
- Perks (bags, lounge passes, etc.): log uses; value = default from `perk-defaults.yaml`, overridable per use.
- Protections: key terms, conditions, how to claim, source link.
- ROI panel: total value realized this AF year vs AF (credits + perk value), with breakdown.
- Lifecycle log (retention calls, PCs, closures) and AF history.
- Downgrade options.
- Earn rates.

Everything recalculates immediately on any change (dashboard, ROI, utilization, needs-attention).

### 5.3 5/24 & eligibility
- 5/24 = personal cards opened in the last 24 months (per the rule's counted-account definition in `rules/chase.yaml`). Show the list of counted cards and each drop-off date; a simple timeline of the count going forward.
- "Considering a card?" panel: pick an issuer/rule and see pass/fail with reasoning against the owner's history, plus `last_verified` and a verify-before-applying note. No card recommendations in v1.

### 5.4 Payments
- Per card, per month: due date (from payment due day), mark paid. Unpaid within lead time → Needs attention. Past-due unpaid → highlighted.

### 5.5 Freedom Flex rotating categories
- Show current and next quarter's 5% categories from `catalog/rotating/chase-freedom.yaml` (sourced from Chase's official calendar; quarters not yet announced shown as "not announced").
- Activation reminder per quarter until marked activated.

### 5.6 Best-card helper ("which card should I use?")
- Pick a category (dining, travel, groceries, gas, online, other…) → ranked list of the owner's open cards by effective earn rate, including Freedom Flex's current 5% category if activated. Show the rate and any caps/conditions noted in the catalog.

### 5.7 Points balances
- Manual entry per program with as-of date; totals and optional estimated value (user-set cents-per-point).

### 5.8 Settings, export/import
- Lead times; perk default overrides; cents-per-point.
- **Export** all user data to JSON; **Import** from JSON (validated; used for initial seed from `seed/my-cards.json` and future migration to hosted DB). Import must be idempotent or offer replace/merge.

## 6. Benefit period logic (must be unit-tested)
Given a benefit's `cycle`, the holding's approval/AF dates, and today:
- compute current period key, period start/end, expiry, remaining amount.
- `calendar_year`: Jan 1–Dec 31. `semiannual`: Jan–Jun, Jul–Dec. `quarterly`: calendar quarters. `monthly`: calendar months. `cardmember_year`: anniversary of approval (or AF date — field on benefit says which).
- Edge cases: leap years, approvals on 29–31st, period rollover on Jan 1.

## 7. UI / design
- Clean, minimal; follows system light/dark; card brand colors as accents.
- Mobile-first responsive (works at 375px wide), no horizontal scroll.
- Fast interactions: optimistic updates, no full-page reloads for logging.
- Accessible: keyboard navigable, sufficient contrast in both themes.

## 8. Reminders
In-app dashboard only for v1 (no email/push/calendar).

## 9. Out of scope for v1
Multi-user / P2 profiles (but keep a `profile`/owner concept so P2 can be added later), hosting/auth, statement CSV import, welcome-bonus tracking, recurring-charge tracking, card recommendations, notifications, v2 automation, third-party hotel/restaurant data.

## 10. Forward-compatibility requirements
- Catalog strictly separated from user data; catalog reloads never modify user data.
- Postgres-compatible Prisma schema.
- Catalog loader is a standalone module so a v2 routine/PR can update `catalog/` and the app picks it up on restart/redeploy.
- Export/import is the migration path to a hosted DB.
- Owner/profile id on user-data tables (single profile in v1).

## 11. Acceptance criteria (v1)
- `npm install && npm run dev` runs the app; `npm test` passes.
- Fresh clone with no DB → app creates/migrates DB and loads catalog automatically.
- Importing a JSON seed of holdings populates dashboard, 5/24, AF dates, payments.
- Logging a partial credit use updates remaining amount, utilization, ROI and needs-attention without reload.
- All 7 catalog cards present with benefits, earn rates, protections, downgrade options; every fact has `source_url` + `last_verified`, unverifiable facts flagged.
- Unit tests cover: 5/24 count and drop-off dates, benefit period computation (all cycles + edge cases), ROI, payment due dates, best-card ranking.
- `README.md` documents setup, catalog format, how to import seed data, and how to add a card.
- `.gitignore` excludes the DB file and `seed/`.

## 12. Open items for the owner
- Confirm which CSR credits are calendar-year vs semiannual from Chase's current benefits page (build should verify from official source).
