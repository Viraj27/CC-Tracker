# CC-Tracker — v4.1 Spec: Skip and "Don't remind me" on Up next

Builds on v4 "Wallet" (`docs/SPEC-v4-wallet.md`); same visual language and tokens. Lets the owner close off Up next (Needs-attention) items they don't intend to act on, for example Discover's rotating 5% when they never activate it.

> Same privacy rule as v1: no personal data in the repo. Tests, screenshots and examples use the fake demo seed only.

## 1. Behaviour

### 1.1 Skip (every item type)
Every Up next item has a quiet **Skip** next to its primary action. This covers payments due or past due, annual fees within the lead time, expiring credits, rotating 5% activation, unverified-fact items, and any kind added later. Skip is a ghost pill: a real `<button>` with a target of at least 40px and an accessible name (`Skip — <card>: <item>`).

- Skip hides **only that occurrence**:
  - Discover activation for `2026-Q4`
  - the `2026-10` statement payment for a card
  - CSR DoorDash for October 2026
  - the United fee posting on `2026-11-16`
- The next occurrence appears as normal: the next quarter, month, statement or fee date.
- Skipping **never** marks anything paid, used or activated.
- A skipped past-due payment stays hidden while it is still past due and inside the payments look-back. It is still unpaid, and `/payments` still shows it as past due.
- An unverified-fact item annotates another item. Skipping that item also hides its unverified note, and restoring the item restores the note. The note can also be skipped on its own.

### 1.2 Don't remind me (recurring reminders, per card)
This is a permanent mute, and it can be turned back on. It exists only for reminders that recur and that the owner can legitimately opt out of:

| Mute | Scope | Silences |
|---|---|---|
| Rotating 5% activation | per card (holding) | every quarter's "Activate" item for that card |
| A credit or perk | per benefit on a card, e.g. "never remind me about Lyft" | that benefit's Up next items, every period |

Where it is offered:
- **(a) When skipping** a rotating or credit item, Skip opens a choice in place: **Skip this quarter** (or **this month** / **this half** / **this year**, from the benefit's cycle) or **Stop reminding me**, plus Cancel. Focus moves to the first choice; Escape cancels.
- **(b) As switches** in the card's Wallet detail:
  - A new **Rotating 5%** section on cards with a rotating calendar. It shows this and next quarter's categories, the activation checkbox and the reminders switch.
  - A `Reminders on/off` switch (`role="switch"`) on every credit and perk row.
- **(c) In Edit card**: an "Up next reminders" fieldset with one checkbox per rotating program, credit and perk. It is saved with the form.

Muted rotating cards get no Up next item. `/rotating` still shows the categories and the activation checkboxes, with a **Reminders off** badge. **Best card** still ranks the card and shows its rotating categories (as a bonus once activated, or the "activate first" hint), also marked **Reminders off**.

Payments and annual fees can **never** be muted, only skipped one occurrence at a time. This is a safety rule, enforced in the domain (`mute: null` on those items), the server action and the import schema.

Perks: today Up next has no perk items (only dollar credits with a period). Perk rows still carry the switch, so the setting is stored and applies to any future perk reminder.

### 1.3 Show skipped
- **Wallet strip**: the last element of the Up next strip is a small mono link, `N SKIPPED · SHOW`. It reveals the skipped and muted items, greyed, after it in the strip.
- **`/up-next`**: the same link sits under the list and reveals a dashed-hairline "Skipped" list.
- Each revealed item is labelled `SKIPPED` or `REMINDERS OFF` and has **Unskip** or **Turn reminders back on**.
- **N counts only items that would otherwise show now.** A skip for a past quarter or a payment not yet due isn't counted.
- Greyed means muted text colour, not opacity, so it still passes the 4.5:1 contrast check (covered by the contrast e2e).

Skipped and muted items also leave the Wallet's card chips, stack order and headline, because those are derived from the visible Up next items.

## 2. Data

### 2.1 Occurrence keys (stable, deterministic)
`src/lib/domain/skips.ts`: `occurrenceKey({kind, holdingId, benefitId, period})` = `kind:holding[:benefit]:period`. It is also the Up next item's `id`.

| Kind | period | Example |
|---|---|---|
| `rotating` | quarter | `rotating:<holding>:2026-Q4` |
| `payment` | statement month | `payment:<holding>:2026-10` |
| `credit` | benefit period key | `credit:<holding>:doordash-promos:2026-10` |
| `af` | fee posting date | `af:<holding>:2026-11-16` |
| `unverified` | `<kind>@<period>` of the item it annotates | `unverified:<holding>:y-credit:credit@2026` |

Mute keys follow the same pattern: `rotating:<holding>` and `benefit:<holding>:<benefit>`. Nothing is random. The same data on the same day always gives the same keys.

### 2.2 Tables (Prisma, one migration for SQLite and D1)
Migration `prisma/migrations/20261017090555_up_next_skips`:

- **`Dismissal`**: one skipped occurrence. Columns:
  - `id`, `profileId`
  - `holdingId`: FK, cascades on card delete
  - `key`: the occurrence key; `@@unique([profileId, key])`
  - `kind`, `benefitId`, `period`
  - `date`: the day it was skipped
- **`ReminderMute`**: one "Don't remind me". Columns:
  - `id`, `profileId`
  - `holdingId`: FK, cascades on card delete
  - `key`: the mute key; `@@unique([profileId, key])`
  - `kind` (`rotating` | `benefit`), `benefitId`, `date`

`npm run dev` applies the migration with `prisma migrate deploy`. On Workers, CI applies it with `wrangler d1 migrations apply --remote` (`npm run cf:migrate:remote`) before deploying, the same as every migration. A unit test pins that order.

### 2.3 Export / import
- The export format is now **version 2**. Each holding carries:
  - `skips: [{id, kind, benefitId, period, date}]`
  - `mutes: [{id, kind, benefitId, date}]`
- Both are nested under the holding, so the holding id is implied, and both are optional on import (default `[]`).
- **Version 1 files still import** unchanged.
- Missing ids are derived from the key (`stableId`), and duplicate keys in one file collapse to the first one.
- **Merge** upserts on `(profileId, key)`. **Replace** clears them with the profile's cards.
- A `credit` skip must name its benefit. A `benefit` mute must name its benefit, and a `rotating` mute must not. Payment and fee mutes are rejected.

## 3. Code map
- `src/lib/domain/skips.ts`: keys, `isMuted`, `splitAttention(items, dismissals, mutes) → {visible, hidden}`.
- `src/lib/domain/attention.ts`: items carry `occurrence`, `periodNoun`, `mute` (null for payments, fees and unverified items) and `parentId` (unverified).
- `src/app/actions.ts`: `setSkipped`, `setMutes`. `src/components/mutations.ts`: optimistic `useSetSkipped`, `useSetMutes`.
- `src/components/UpNext.tsx`: `AttentionActions` (primary + Skip + choice), `ShowSkipped`, revealed items. `src/components/Reminders.tsx`: `ReminderSwitch`.
- `CardDetail.tsx` (Rotating 5% section), `BenefitRow.tsx` (switch), `HoldingForm.tsx` (Edit card reminders), `/rotating` and `/best-card` (Reminders off badge).

## 4. Tests
- Unit (`tests/skips.test.ts`, `tests/importExport.test.ts`, `tests/db.test.ts`):
  - occurrence keys
  - filtering and counts
  - next-period occurrences (quarter, month, statement, fee year)
  - mute scope
  - Best card marking
  - export/import round trip, including a version 1 file and validation
  - storage round trip on local SQLite **and** D1
  - the CI migration order
- e2e (`e2e/skip.spec.ts`):
  - skip an item: it's gone, the count shows, Show skipped and Unskip bring it back, keyboard and 40px target, payments skip in one tap and stay unpaid
  - stop reminding rotating for a card: no Up next item, still on `/rotating` and Best card marked reminders off, back on from the Wallet switch
  - per-credit switch and Edit card
  - next month's occurrence appears, using Playwright's browser clock: the app's "today" is the browser's local date
- The contrast e2e also measures the revealed skipped list.
- Screenshots: `docs/screenshots/up-next-skipped-390-{light,dark}.png` and `up-next-strip-skipped-390-{light,dark}.png`.

## 5. Feature parity checklist (v4 §5, all still working, plus v4.1)
- [x] 5/24 count, counted list, drop-off dates, forward timeline
- [x] Issuer rule checker with provenance
- [x] Needs attention: AF within lead time, expiring credits, payments due/past due, rotating activation, unverified facts affecting actions
- [x] **v4.1** Skip on every Up next item (one occurrence; nothing marked paid/used/activated)
- [x] **v4.1** Don't remind me for rotating activation (per card) and credits/perks (per benefit); never for payments or annual fees
- [x] **v4.1** `N SKIPPED · SHOW` on the strip and `/up-next`, with Unskip / Turn reminders back on
- [x] **v4.1** Reminder switches in the Wallet detail (Rotating 5% section, credit and perk rows) and Edit card
- [x] Per-card: overview, ROI, credits with period/expiry/remaining, log use (partial, note, date), usage history
- [x] Perks, other benefits, protections, earn rates, downgrade options
- [x] AF history, lifecycle log
- [x] Add card, edit card, custom cards, closed/product-changed cards
- [x] Payments: mark paid, past due (skipped payments stay past due here)
- [x] Rotating: current/next quarter, activation toggle (**v4.1**: Reminders off badge)
- [x] Best card ranking incl. activated 5% quarter (**v4.1**: Reminders off badge)
- [x] Points; Settings; export JSON (**v4.1**: version 2 with skips/mutes); import merge/replace (version 1 files still import)
- [x] Provenance on every fact
- [x] Light + dark; 375–430px with no horizontal scroll; PWA unchanged
- [x] Works on local SQLite (`npm run dev`) and Workers + D1 (`npm run preview`)
