# CC-Tracker — v6 Spec: Welcome bonus (deadline-first)

Builds on v5 "App pass" (`SPEC-v5-app-pass.md`) and v4.1 Skip (`SPEC-v4.1-skip.md`); same visual language, one-line rows and sheets. Fills gap 1 of the competitor review: every leading tracker tracks welcome bonuses (SUBs); CC-Tracker doesn't (deferred in `SPEC.md` §9).

> Privacy: demo seed only in tests/screenshots. No personal data in the repo.

## 1. Why, and what this is not
Issuer apps already show spend progress, so **this feature does not log spend**. Its value is what issuer apps don't do:
1. **One deadline list across issuers.** Two or three cards in their bonus window at once show up in Up next together.
2. **The follow-through.** Mark the minimum met → confirm the bonus posted → get nudged if it hasn't posted after a while. Issuer trackers usually vanish once the minimum is met.
3. **A close-early guard.** Warn before closing or downgrading a card whose bonus is recent.
4. **A record.** Posted bonuses feed ROI, the lifecycle log, and the bonus re-eligibility rules.

Out of scope: itemized spend logging, issuer sync, a catalog of current public offers (see `SPEC-v6.2-catalog.md` for an optional prefill).

## 2. Data

New model `WelcomeOffer`, at most one per holding (`@@unique([holdingId])`), scoped by `profileId` like every user-data table:

| Field | Type | Notes |
|---|---|---|
| `bonusAmount` | Float | e.g. `60000` or `200` |
| `bonusUnit` | `points` \| `miles` \| `usd` | |
| `program` | String? | Points program id (`programs.yaml`); defaults to the card's `rewards_program` |
| `minSpend` | Float? | USD; null for "approved = bonus" offers |
| `windowMonths` | Int? | e.g. `3` |
| `deadline` | String? | YYYY-MM-DD. Owner-set exact date; when null, derived (§2.1) |
| `spentSoFar` | Float? | **Optional**, typed from the issuer app when it matters. Never required |
| `spentAsOf` | String? | Stamped when `spentSoFar` changes |
| `metDate` | String? | Set by **Met** |
| `postedDate` | String? | Set by **Posted** |
| `postedAmount` | Float? | Defaults to `bonusAmount`; editable (bonuses sometimes post short or split) |
| `outcome` | `missed` \| null | Set by **Missed**; otherwise status is derived |
| `note` | String? | e.g. "targeted offer", "referral from P2" |

### 2.1 Derived values (`src/lib/domain/welcomeBonus.ts`, unit-tested)
- **Deadline**: `deadline` if set, else `approvalDate + windowMonths` (calendar months, clamped to month end like `periods.ts`), shown with `(est.)`. Issuers word windows differently ("within 3 months of account opening"), so the estimate tells the owner to confirm with the issuer's tracker. Null when neither is set.
- **Status**: `posted` (postedDate) → `missed` (outcome) → `met` (metDate) → `overdue` (today > deadline) → `earning`.
- **Left to spend**: `minSpend − spentSoFar` when `spentSoFar` is set, else `minSpend`.
- **Value**: `postedAmount` (or `bonusAmount`) × cents-per-point from Points settings for `points`/`miles`; face value for `usd`. Null when no cpp is set.
- **Close guard date**: `approvalDate + 12 months`. This is a community rule of thumb (issuers, notably Amex, reserve the right to claw back bonuses on accounts closed early); the rule text and its source go in `catalog/rules/` with `source_type: community`, verified at build time.

## 3. Up next items

Two new kinds, built in `attention.ts` beside the existing ones. Both use v4.1 occurrence keys and can be **skipped** one occurrence at a time; like payments and annual fees they can **never be muted** (`mute: null`).

| Kind | Occurrence key | Shows when | Row (title / sub / right) | Primary action |
|---|---|---|---|---|
| `sub_deadline` | `sub:<holding>:<deadline>` | status `earning` and deadline within `subLeadDays` (default **30**), and stays while `overdue` for 14 days | `Spend $3,000` (or `Spend $1,200 more` with spentSoFar) / card short name / `60K pts` over the deadline date; urgent ≤ 7 days | **Met** |
| `sub_posting` | `subpost:<holding>:<metDate>` | status `met` and today ≥ metDate + `subPostingDays` (default **56**, about two statement cycles) | `Bonus not posted` / card / `60K pts` over the expected-by date | **Posted** |

- An `overdue` row reads `Deadline passed`, with **Met** (met in time, logged late) and **Missed** in its sheet.
- The sheet for both kinds shows: bonus, min spend, deadline (with `(est.)` and ⓘ explaining the estimate), optional **Spent so far** (one field, Enter saves, stamps `spentAsOf`), and the actions **Met**, **Posted**, **Missed**, **Edit offer**, **Skip**.
- Lead times live in Settings beside the existing ones (`subLeadDays`, `subPostingDays`).
- Wallet: a card in `earning` gets a state chip `BONUS · 22D` (urgent within 7 days), using the same chip logic as `FEE IN 30D`.

## 4. Card page
- **WELCOME BONUS** row directly under the stat strip while status is `earning`, `overdue` or `met`: `60K pts · $3,000 by Dec 14` / `22 days left` (or `Met · waiting to post`). Tap → the same sheet as §3.
- After `posted` or `missed`, the row leaves the card page. The result appears in **Lifecycle log** as a read-only entry (`Bonus posted 60K pts · Mar 3, 2026` or `Bonus missed`).
- **Close guard**: until the close guard date, when the bonus is posted or still pending:
  - **Downgrade options** and **Edit → status closed / product changed** show a warning line: `Bonus Mar 3 — closing before Jan 10, 2027 risks clawback` with ⓘ for the rule's source.
  - It warns, never blocks.

## 5. Add / edit card
- Add card and Edit card get an optional **Welcome offer** fieldset, collapsed by default: bonus + unit, min spend, months, exact deadline (optional), note. Program defaults from the card.
- Removing the offer deletes the `WelcomeOffer` row (confirm).
- No fields are required beyond `bonusAmount` + `bonusUnit` when the fieldset is used.

## 6. Everything else it touches
- **ROI**: a posted bonus is a one-time line, `Welcome bonus`, in the ROI breakdown sheet of the AF year it posted in. It is **excluded from the headline ROI %** by default (it would swamp first-year ROI); a Settings toggle `Count welcome bonus in ROI` (default off) includes it.
- **Rules / re-eligibility**: where a bonus rule counts from "received a bonus" (`effect: bonus`), the `family_window` check in `rules.ts` uses `postedDate` when known; otherwise it keeps today's behaviour (the holding's `approvalDate`). The "Considering a card?" result says which date it used.
- **Points**: no automatic balance change; points balances stay manual.
- **Import/export**: `WelcomeOffer` added to the export schema (bump the version); older exports import unchanged. Merge keys on `holdingId`.
- **Demo seed**: one card `earning` (deadline in ~20 days), one `met` 60 days ago (so `sub_posting` shows), one `posted`.

## 7. Tests
- Unit: deadline derivation (month-end clamps, leap year, exact override), status precedence, left-to-spend, value with and without cpp, close guard date, both Up next kinds incl. skip and the overdue tail, rule date selection.
- Storage: `WelcomeOffer` CRUD on SQLite and local D1; import/export round trip, merge idempotence.
- e2e (390px and desktop): add an offer in Add card, see the row in Up next, tap **Met**, then **Posted**, see the lifecycle entry; close-guard warning on Downgrade options; contrast passes in both themes.

## 8. Acceptance
1. A card with an offer shows its deadline in Up next within 30 days of it, in both groups as dates dictate.
2. **Met** → the deadline row disappears; 56 days later a **Bonus not posted** row appears until **Posted**.
3. Neither kind can be muted; Skip hides one occurrence only.
4. No screen asks for spend; `Spent so far` is optional and only changes the row's wording.
5. Closing or downgrading within 12 months of opening a card with a bonus shows the warning with its source.
6. `npm run typecheck`, `npm test`, `npm run test:e2e` pass.
