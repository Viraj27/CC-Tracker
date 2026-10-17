# CC-Tracker — v5 Spec: "App pass" (less text, native-feeling phone UI)

Builds on v4 Wallet (`SPEC-v4-wallet.md`) and v4.1 Skip (`SPEC-v4.1-skip.md`). **No feature may be lost**: every v4/v4.1 parity item must still be reachable. Data model, domain logic, hosting unchanged unless the UI requires it.

> Privacy: demo seed only in tests/screenshots. No personal data in the repo.

## 1. Why
On the iPhone the app reads like a web document: sentence-long Up next titles that repeat the card name, an explanatory paragraph on Up next, and a card detail where every benefit has a paragraph plus a "Source · checked" line. Goal: it should feel like an app. Owner approved a phone mockup (summarised below).

## 2. Principles
1. **One line per item.** Title is the thing (e.g. `DoorDash`, `Payment due`, `Annual fee`, `Activate Q4 5%`), never "<Card>: <sentence>". Second line = card short name only. Right side = amount (mono, bold) over date (mono; urgent colour when within lead time).
2. **Details on demand.** Tapping a row opens a **bottom sheet** (phone) / dialog or side panel (desktop ≥1024px). Long content (benefit descriptions, protections terms, histories) lives in sheets or drill-in screens, not inline.
3. **No explanatory paragraphs** on screens. At most one short sentence (the card headline). Help text moves to a sheet or is deleted.
4. **Provenance behind ⓘ.** Source link + checked date are hidden by default; a small ⓘ (32px target, `aria-label="Source"`) on each fact/sheet reveals them. **⚠ Unverified** and **Community curated** keep a small visible badge everywhere (warnings never hidden).
5. **Grouped lists.** Lists sit in inset rounded groups (surface slightly lighter than the ground, radius 14px, hairline separators between rows) — iOS-style grouped lists. Section labels: mono caps, 11px, muted.
6. Keep v4 tokens (ground `#E7E5E0`, text `#15171C`, muted `#616369`, hairline `#D3D1CB`, urgent `#B4371B`, Hanken Grotesk + Space Mono). Add a list-surface token (light ≈ `#F3F2EE`; derive dark). All text ≥ 4.5:1; contrast e2e must keep passing.

## 3. Screens (phone < 1024px)

### 3.1 Wallet (`/`)
- Large title **Wallet** (34px/700) with a mono pill `3/24` (5/24 count) on the right. Drop the long mono header line on phone.
- **UP NEXT** label + `ALL <n> →` link (→ Up next tab). Below: a grouped list of the **top 3** Up next items as one-line rows (tap → sheet). Replaces the horizontal strip on phone.
- **CARDS · <n>** label + Wallet stack: collapsed strips (~58px) showing name + state chip; the last card shown in full. **Tapping a card opens the Card page** (3.2) as a pushed screen (URL `/cards/<id>`), not detail-below.

### 3.2 Card page (`/cards/<id>`)
- Nav bar: `‹ Wallet` back (history back / link to `/`), `Edit` on the right (opens edit-holding form as a sheet or pushed screen).
- Short card banner (~150px tall, card colour): name, issuer · pay-by day, annual fee.
- One-sentence headline (derived, as v4) — max one line where possible.
- **Stat strip**: one grouped row of 3 cells — `Left` (unused credits this period), `ROI` (this AF year), `5/24` (date or `Out`). Tapping ROI opens the ROI breakdown sheet.
- **CREDITS** grouped list: row = name / mono sub `CYCLE · EXPIRY` (urgent colour within lead time) / remaining amount / `›`. Tap → Credit sheet (3.4).
- If the card has rotating categories: a **ROTATING 5%** group row showing this quarter's categories in one line + activated state; tap → sheet with current/next quarter, activation toggle, reminders on/off.
- Then one grouped list of drill-in rows with counts: **Perks**, **Other benefits**, **Protections & insurance**, **Earn rates**, **Downgrade options** (Community badge visible), **Fee history**, **Lifecycle log**. Each opens a drill-in screen or sheet containing what v4 shows today (descriptions, key terms, how to claim, add-event forms, perk value overrides, reminders toggles), with ⓘ provenance per fact.

### 3.3 Up next (`/up-next`)
- Large title **Up next**; right side mono `N SKIPPED · SHOW` when applicable (v4.1 behaviour).
- **Remove the intro paragraph.**
- Groups: **NEXT 14 DAYS**, **LATER** (by due date). One-line rows as §2.1, each with a card-colour bar (10×28px) at the left.
- **Swipe left** on a row reveals two actions: **Skip** (grey) and the primary action (`Log` / `Paid` / `Activate` / `Options`; black). Implement with pointer events (touch + mouse drag), snap open/closed, one row open at a time, `prefers-reduced-motion` respected. **Accessible alternative required**: tapping the row opens the sheet, which contains the same actions; swipe actions also reachable by keyboard (e.g. focusing the row exposes them).

### 3.4 Item / credit sheet
- Grabber, title (22px/700), card name, ⓘ (reveals source + checked date + one-line description of the fact).
- Two key figures (mono 24px): credit → `Left` / `Expires`; payment → `Card` / `Due`; fee → `Fee` / `Posts`; rotating → `Card` / `Activate by`.
- Credit: quick-amount chips (`$5`, `$10`, remaining, `Other`), remaining pre-selected; primary pill **Log $X** (50px). Partial use, note and date stay available under a `More options` disclosure. Usage history for the period shown in the sheet (compact list) with delete.
- Payment: **Mark paid**. Rotating: **Mark activated**. Fee: **See options** (downgrade/retention/AF history).
- Secondary text buttons: **Skip this month/quarter/one** and, for credits/perks/rotating only, **Stop reminding me** (v4.1 rules; never for payments/fees).
- Dismiss: tap backdrop, drag down, Esc. Focus trapped while open, returned on close.

### 3.5 Other screens
5/24, Payments, Rotating, Best card, Points, Settings, More, Add card: apply the same rules — large title, no intro paragraphs (move to ⓘ/sheet), grouped one-line lists, provenance behind ⓘ with badges visible.

## 4. Desktop (≥ 1024px)
Keep the v4 two-column Wallet (stack left, card detail right), but the right pane uses the Card page content from 3.2 (stat strip, credit rows, drill-in rows) instead of the long inline document; sheets render as a right-side panel or centered dialog. Up next strip may stay horizontal on desktop but uses the short titles. Swipe not required on desktop (row hover shows Skip + action).

## 5. Parity & acceptance
- Every v4 §5 and v4.1 item still works (list it in the PR with where it now lives).
- Update e2e to the new UI; new e2e: open card page from the stack and back; open a credit sheet and log a partial amount with note; swipe-to-skip on Up next (touch emulation) and the keyboard/tap alternative; ⓘ reveals source; Unverified/Community badges still visible without tapping; phone 390px no horizontal scroll; contrast spec passes (incl. sheets, list surface, both themes).
- Unit tests pass; typecheck; CI green; e2e on dev and Workers preview.
- Screenshots (demo seed, light + dark, 390px + desktop): Wallet, Card page, Up next (one row swiped), sheet with ⓘ open → `docs/screenshots/`.
- README screens overview updated.
