# CC-Tracker — v6.1 Spec: Annual fee, after it posts

Builds on v6 (`SPEC-v6-welcome-bonus.md`), v5 and v4.1. Fills gap 3 of the competitor review: keep the annual fee (AF) decision alive after the anniversary, through the issuer's cancel-for-refund window.

> Privacy: demo seed only in tests/screenshots. No personal data in the repo.

## 1. The problem today
`attention.ts` (annual fee block) shows the AF item only from `afLeadDays` before the anniversary up to the anniversary itself. `nextAfDate` → `nextAnniversary` (`dates.ts`) rolls to next year the day after, so **the item vanishes exactly when the fee actually bills**: the fee posts on the first statement after the anniversary, and the refund window counts from then. That's the moment a cancel or downgrade gets the fee back.

## 2. Phases
One AF cycle per holding per anniversary date. Each phase is one Up next item; every phase can be **skipped** (one occurrence) and **never muted**, as today.

| Phase | Starts | Ends | Row (title / sub / right) | Primary action |
|---|---|---|---|---|
| 1. **Upcoming** (exists) | `afLeadDays` before the anniversary | anniversary | `Annual fee` / card / `$795` over the date | **Options** |
| 2. **Watch for the fee** (new) | day after the anniversary | fee confirmed posted, or anniversary + `afWatchDays` (default **45**, about one statement cycle) | `Watch for fee` / card / `$795` over `expected by` date | **Fee posted** |
| 3. **Refund window** (new) | the confirmed post date | post date + issuer `refund_days` | `Decide by Dec 14` / card / `$795` over that date; urgent ≤ 5 days | **Decide** |

- The phase-1 rule "handled when an AF event or lifecycle event falls in the window" stays, and now also ends phases 2 and 3 when the event is a decision (§3).
- Phase 2 expiring without a confirmation shows nothing further (the owner skipped it or the fee didn't post); the next cycle starts as normal.
- First-year-waived cards: the first cycle's phase 1 and 2 are suppressed only if the catalog `first_year_waived` is true **and** the anniversary is the first one.

## 3. Actions and data
- **Fee posted** (sheet): date (default today), amount (default catalog fee). Creates an `AnnualFeeEvent` with a new outcome **`pending`** (posted, undecided). Moves the cycle to phase 3.
- **Decide** (sheet), one tap each, all updating that same `AnnualFeeEvent`:
  - **Keep** → outcome `paid`.
  - **Retention offer** → opens the existing lifecycle form prefilled `retention_call`; on save, outcome `retention_offer`.
  - **Downgrade** → opens Downgrade options; on product change, outcome `downgraded`.
  - **Close** → opens Edit (status closed); on save, outcome `closed`.
- The sheet also shows: `Refund window: 30 days from posting · ⓘ` (source), the days left, the downgrade targets in one line, and, if v6's close guard applies, the clawback warning (§5).
- **Call retention** nudge: in phase 1 and 3, if the cycle has no `retention_call` lifecycle event, the sheet shows a quiet **Log retention call** button. No separate Up next row.
- Migration: `outcome` gains `pending`. Existing events are unchanged. Import schema accepts it.

## 4. Refund windows (catalog)
Each `catalog/rules/<issuer>.yaml` gets an optional top-level block:

```yaml
annual_fee_policy:
  refund_days: 30          # days after the fee posts to cancel/downgrade for a full refund
  basis: posting           # posting | statement (counted from the statement the fee is on)
  source_url: https://…
  last_verified: 2026-…
  verified: true
  source_type: community   # most issuers state this only in cardmember agreements or via data points
  note: …
```

- Values are **researched and sourced at build time, one per issuer** (Chase, Amex, Capital One, Discover, Wells Fargo at least, matching held cards). This spec doesn't fix numbers; none were verified while writing it.
- Missing policy → phase 3 still appears but reads `Decide soon` with `Refund window not in catalog · ⓘ`, ending 30 days after posting. The ⓘ says the 30 is a placeholder, not a fact.
- Optional per-holding override `afRefundDays` (Edit card → Reminders) for issuer exceptions the owner knows about.
- `npm run catalog:check` counts the new facts.

## 5. Best exit window (with v6)
When a card has a v6 close guard date **and** an AF cycle, the card page's AF sheet shows one line:
- Close guard clears **before** the refund window ends: `Best exit: Jan 10 – Feb 9, 2027` (keeps the bonus and refunds the fee).
- Close guard clears **after** it: `Closing now risks the bonus; keeping costs $795` (no recommendation, just the trade).

## 6. Wallet and card page
- State chips follow the phase: `FEE IN 30D` (phase 1, exists), `WATCH FEE` (2), `DECIDE · 9D` (3, urgent ≤ 5 days).
- **Fee history** lists `pending` events as `Posted Nov 18 · deciding` until resolved.

## 7. Tests
- Unit: phase boundaries around the anniversary (incl. Feb 29 anniversaries, year rollover), phase 2 timeout, posting moves to phase 3, each decision ends the cycle, missing policy fallback, per-holding override, first-year-waived suppression, best exit window both ways.
- Storage + import/export round trip with `pending`.
- e2e: on the day after the demo card's anniversary the row reads `Watch for fee`; **Fee posted** → `Decide by …`; **Keep** clears it; contrast in both themes.

## 8. Acceptance
1. The day after an anniversary, Up next still shows the fee (phase 2) instead of nothing.
2. Logging the posting shows a countdown to the end of the issuer's refund window, with its source behind ⓘ.
3. Keep / Retention / Downgrade / Close each resolve the cycle and are recorded in Fee history.
4. AF items can be skipped, never muted.
5. typecheck, unit, e2e pass.
