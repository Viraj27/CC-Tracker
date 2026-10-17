# CC-Tracker — v7 Spec: Phone feedback pass

Builds on v5 (`SPEC-v5-app-pass.md`), v6, v6.1 and v6.2. Comes from the owner using the app on a phone (Oct 18, 2026). Five changes: clearer credit rows, greyed-out upcoming periods, no 5/24 count on the phone home screen, a new **Should I apply?** page, and portal vs. direct rows in Best card.

> Privacy: demo seed only in tests/screenshots. No personal data in the repo.

## 1. Credit rows: enrollment and benefit end dates
### 1.1 The problem today
On the CSR card page, StubHub has an **Enroll** badge and an **Ends Dec 31 27** badge. Dining has neither. Both are correct (Chase requires StubHub activation; StubHub is offered only through 2027), but:
- **Enroll** never goes away, even after the owner has enrolled.
- **Ends …** reads like *this period's* expiry. It's actually the date the issuer stops offering the benefit. The owner read it as "expires 31 Dec 2027".

### 1.2 Enrollment
- The badge text becomes **Requires enrollment** on the credit row and in the benefit sheet. It must fit a one-line row at 390px; check it in e2e.
- The benefit sheet gets a **Mark enrolled** button (date defaults to today). Once marked:
  - the badge is hidden on the row and in the sheet;
  - the sheet shows `Enrolled Oct 18 · undo`.
- Applies to every benefit with `enrollment_required: true` (credits, perks, status), not just StubHub.

### 1.3 Re-enrollment
Some benefits need enrolling again after a while. The catalog says how long one enrollment lasts:
- `enrollment_lasts: "holding" | "period" | "calendar_year" | "rotating" | { months: n }`, default `holding`.
  - `holding`: enroll once.
  - `period`: enroll again every cycle period, e.g. every half for a semiannual credit.
  - `calendar_year`: enroll again every January, e.g. United Explorer's rideshare credit ("Yearly opt-in is required").
  - `rotating`: quarterly 5% activation, already tracked on the Rotating page. No enrollment badge or Re-enroll row.
  - `{ months: n }`: n months from the enrollment date, e.g. a 12-month activation.
- **Build-time audit:** check each of the 12 `enrollment_required` benefits in the catalog against its official terms and set `enrollment_lasts`, with provenance in `note`. It's unverified which of them need re-enrollment, so the default is never assumed to be right without checking.
- **When an enrollment lapses:**
  - the badge comes back as **Re-enroll**;
  - the sheet shows `Enrolled Oct 18, 2025 · lapsed Oct 18, 2026` and **Mark enrolled**;
  - Up next shows a `Re-enroll` row (title / card / benefit). It's raised `creditLeadDays` before the lapse date and stays until marked. It can be skipped and muted per holding, like rotating activation.
- **Data:** new Prisma model `BenefitEnrollment { id, holdingId, benefitId, enrolledOn }`. Keep the full history (no unique constraint); the latest one decides the state. Include it in import/export, with a schema version bump; older exports import with no enrollments.

### 1.4 Benefit end date
- The badge reads **Benefit ends Dec 31, 2027**, always with the full year.
- It's shown on the row and in the sheet whenever `ends_on` is set.
- **After `ends_on`:** the existing **Ended** state stays.

### 1.5 Period shown plainly
- The row sub-line becomes `SEMIANNUAL · JUL–DEC · EXPIRES DEC 31`. Within `creditLeadDays` it is urgent, as today.
- The sheet's **Expires** stat becomes two stats: **Period** (`Jul–Dec 2026`) and **Expires** (`Dec 31, 2026`).

## 2. Upcoming periods (greyed out)
### 2.1 The problem today
After StubHub's Jul–Dec $150 is used up, the owner can't use it again until Jan 1. If the use isn't logged, the sheet still offers **Log $150**, so a misclick is easy. Even once logged, nothing shows when the next period opens.

### 2.2 Behaviour
The app already uses the phone's local date and rolls over at midnight (`AppState.tsx`). That is the only time input needed.

For a quantified, period-based credit (not `per_use` or `none`):

| State | Row | Sheet |
|---|---|---|
| Remaining > 0 this period | as today | as today |
| **Used up this period**, and a next period exists while the benefit is active | greyed: `Stubhub` / `SEMIANNUAL · JAN–JUN 2027 · OPENS JAN 1` / `$150`, muted | Primary button disabled and reading **Opens Jan 1**; amount chips hidden; **This period** uses still listed and deletable |
| Used up, and the benefit ends this period (`ends_on` ≤ period end) | greyed: `… · USED · BENEFIT ENDS DEC 31` | Disabled **Used** |
| `starts_on` in the future (today's **Not started**) | greyed: `… · OPENS <starts_on>` | Disabled **Opens <date>** |

- It's generic: monthly (DoorDash → `OPENS NOV 1`), quarterly, semiannual, calendar and cardmember years all behave the same way.
- **Back-dating:** under **More options**, a past date may still be chosen. **Log** is enabled only when the period containing that date has an amount left. So the owner can log a missed use from an earlier period but can't log into a used-up one.
- **Sort order:** greyed rows go below the active ones (after inactive, before ended).
- The **Left** stat, ROI and Up next are unchanged: a used-up period already counts as $0 left.
- New domain helper `nextPeriod(cycle, period, anchor)` in `periods.ts`, plus `creditView(benefit, holding, usages, today)` returning `{ state: "open" | "used_upcoming" | "used_final" | "not_started" | "ended", shownPeriod, opensOn }`. Rows and sheets read only this.

## 3. Home screen: no 5/24 count on phones
- Remove the `N/24` pill from the phone Wallet title (`Wallet.tsx`, `data-testid="five24-pill"`). The title is just **Wallet**.
- The **5/24** bottom tab and page stay.
- The desktop top-bar status line (`3 CARDS · 2/24 · NEXT OFF …`, `Nav.tsx` `WalletStatus`) stays. It isn't visible on phones.
- Update `e2e/wallet.spec.ts`, which uses the pill.

## 4. Should I apply? (replaces "Considering a card?")
### 4.1 The problem today
The 5/24 page ends with **Considering a card?**, a dropdown of issuer *rules* (Chase 5/24, Sapphire Reserve bonus, Venture 48 months, …). The owner thinks in cards, not rules, so the section reads as noise.

### 4.2 Page
- **Route:** `/apply`, listed under **More** as **Should I apply?**.
- **5/24 page:** the old section is replaced by a single link row, **Should I apply? ›**. The page keeps only the count, the accounts and the timeline.
- **Card picker:** every catalog card, grouped by issuer. It includes held cards, since the owner may consider a second one or a re-application, and grows automatically with v6.2 stubs.
- **Verdict**, in plain words, for the chosen card:
  - **Approval:** `Likely approved` / `Likely denied — <rule>` / `Check manually`
  - **Welcome bonus:** `Eligible` / `Not eligible — <reason>` / `Check manually`
  - Where the evaluator can compute it, add when that changes, e.g. `Eligible from Mar 2028` (family window end) or `Under 5/24 from Jan 15, 2027` (next drop-off). Otherwise no date.
- **Under the verdict:** one row per applicable rule, showing outcome, reasons and the v5 provenance ⓘ. Footer: `Verify before applying · rules checked <date>`.
- **No rules apply:** `No issuer rules in the catalog for <card>. That doesn't mean there are none.`
- **No lifetime language (NLL):** an **Offer has no lifetime language** toggle, off by default. It shows only when the chosen card has a rule with an `nll_waiver`, e.g. the Amex "have or have had" family rule.
  - When on, those rules are listed as `Waived by NLL offer`, and the bonus verdict ignores them.
  - The waiver is community knowledge, not an issuer statement. A rule NLL can waive carries `nll_waiver: { source_type: community, note }`, where the note describes the data points behind it. The toggle's ⓘ reads `Community data points, not an Amex policy`.
  - The toggle isn't saved; it's a what-if for the offer in front of the owner.

### 4.3 Which rules apply to a card
- Rules gain an optional `applies_to: { families?: string[], account_types?: ("personal" | "business")[] }`.
- **Absent:** the rule applies to every catalog card from `rule.issuer`.
- **Present:** narrow to those families and account types.
- **Catalog update** at build time: set `applies_to` on the family-specific rules (Sapphire Reserve bonus, Venture 48, Delta Gold family). Leave Chase 5/24 and Discover new-cardmember issuer-wide unless their sources say otherwise.
- `catalog:check` validates that each `applies_to.families` entry matches a family used by at least one card.

## 5. Best card: portal vs. direct as separate rows
### 5.1 The problem today
`rankCards` keeps one rate per card, the highest. For Airfare it ranks CSR at 8x (Chase Travel only; direct is 4x) and Venture X at 5x (Capital One Travel only; direct is 2x). The booking condition sits only in the grey subtitle, so the list overstates what most purchases earn.

### 5.2 Behaviour
- `EarnRateSchema` gains optional `channel: "portal" | "direct" | "any"` (default `any`) and `portal_name` (e.g. `Chase Travel`), required when `channel` is `portal`.
- For each card and category, `rankCards` returns up to **two rows**:
  - **Portal row:** the best matching `portal` rate, labelled with a **Via Chase Travel** badge. Shown only if it is strictly higher than the off-portal rate. If it's equal or lower, the card gets a single row.
  - **Off-portal row:** the best matching non-portal rate, falling back to the card's "other" rate. Labelled **Booked direct** for airfare/hotels/travel, otherwise the rate's own label.
- Both rows are ranked in the same list by ¢/$, numbered as rows. A card can appear twice.
  - Airfare example: CSR via Chase Travel 8x · Venture X via Capital One Travel 5x · CSR booked direct 4x · Venture X 2x.
- Rotating rows are unchanged. The **activate first** hint attaches to the off-portal row.
- `RankedCard` gains `channel` and `portalName`. The row key becomes `holdingId:channel`.

### 5.3 Catalog audit
At build time, check every held card's `earn_rates` against its official source and tag `channel`/`portal_name`. Known portal rates today:
- CSR: Chase Travel 8x
- Venture X: Capital One Travel 10x hotels/cars, 5x flights
- Freedom Flex: its "Chase Travel purchases" line

Re-verify the others (Autograph, United Explorer, Delta Gold) rather than assuming they have none. Bump `last_verified` for anything touched.

## 6. Tests
- **Unit:**
  - `creditView` for each state: monthly, semiannual and cardmember-year rollovers; `ends_on` mid-period; `starts_on` in the future.
  - Back-date enablement.
  - `nextPeriod` across year boundaries.
  - Enrollment hides the badge.
  - Lapse for each `enrollment_lasts` kind (`holding` never lapses; `period` and `calendar_year` lapse at rollover; `{months}` lapses on the date; `rotating` has no badge), the Re-enroll Up next lead time, skip and mute.
  - `applies_to` matching (absent / families / account types).
  - The NLL toggle waives only rules with an `nll_waiver`.
  - Verdict summary and "eligible from" dates.
  - `rankCards` two-row output: portal beats direct (two rows), portal equal to direct (one row), rotating interplay.
- **Storage:** import/export round trip with `BenefitEnrollment`; an old export imports cleanly.
- **e2e (390px, both themes):**
  - The phone Wallet has no 5/24 pill.
  - Logging StubHub's remaining amount greys the row to `OPENS JAN 1` with the sheet button disabled.
  - **Mark enrolled** removes **Requires enrollment**.
  - The `/apply` verdict for the demo Venture X.
  - Best card Airfare shows two CSR rows.
  - No overflow; contrast passes.

## 7. Acceptance
1. A credit whose period is used up shows the next period greyed, with the date it opens, and can't be logged by mistake.
2. **Requires enrollment** disappears once marked enrolled and comes back as **Re-enroll** (with an Up next row) when a re-enrollment is due. The benefit's own end date always reads **Benefit ends …** and is never confused with this period's expiry.
3. The phone home screen has no `N/24` count.
4. Picking a card on **Should I apply?** gives a plain approval and bonus verdict with sources. The 5/24 page has no rule dropdown.
5. Best card lists portal and direct rates as separate rows for cards with portal-only rates.
6. typecheck, unit, e2e and `catalog:check` pass.
