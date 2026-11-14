# CC-Tracker — v8 Spec: Find a card

Builds on v6.2 (`SPEC-v6.2-catalog.md`: stub cards and `public_offer`), v7 **Should I apply?** (`SPEC-v7-phone-feedback.md` §4) and v6 (`SPEC-v6-welcome-bonus.md`). Same visual language: one-line rows and sheets. Card recommendations were out of scope in v1 (`SPEC.md` §9); this adds them.

> Privacy: the spend profile and criteria are user data (database only, never in git). Demo seed only in tests and screenshots.

## 1. Why, and what this is not
The owner's question is "which card should I get next?", for example: *I'm running low on points, personal cards only, best welcome bonus I can actually get.* Today the app can only answer "can I get **this** card?" (Should I apply?), one card at a time.

**Find a card** ranks every catalog card the owner doesn't hold by what it's worth to them, after removing the ones the issuer rules say they can't get.

It is not:
- **Advice from an AI.** The ranking is deterministic, in-app and unit-tested. No model runs at request time and nothing leaves the app (`SPEC.md` §3).
- **Affiliate content.** No links other than the card's `product_page` and offer source.
- **A full strategy tool.** Application order across issuers, business cards for 5/24 room, and transfer partners stay a conversation. §6 makes that hand-off easy.

## 2. Inputs

### 2.1 Spend profile (new, typed once)
- **Settings → Spending:** rough **monthly dollars per category**. One number field per `SPEND_CATEGORIES` entry; the common ones (`dining`, `groceries`, `gas`, `travel`, `online`, `other`) show first, the rest sit behind **More categories**. Blank means 0.
- Stored as `Settings.spendProfile`, JSON `{ [SpendCategory]: usdPerMonth }`, default `{}`. Included in import/export (schema version bump; older exports import with an empty profile).
- **Total monthly spend** is the sum. Never derived from statements; the page says `Rough numbers are fine`.
- Without a profile the page still works; it ranks on the bonus alone and shows one line: `Add your rough spending to see fit · Settings ›`.

### 2.2 Criteria (on the page)
| Control | Values | Default |
|---|---|---|
| **Card type** | Personal / Business / Both | Personal |
| **Goal** | Welcome bonus / Everyday value | Welcome bonus |
| **Points in** | Any, or one program from `programs.yaml`, or Cash back | Any |
| **Annual fee up to** | No limit / $0 / $100 / $250 / $550 | No limit |
| **Issuers** | multi-select, all on | all |

Criteria are remembered per profile (`Settings.findCardCriteria`, JSON) so the page reopens as it was left.

## 3. Candidates and eligibility
- **Candidates:** every catalog card (full or stub) with no **open** holding, not discontinued, passing the criteria.
- **Eligibility:** each candidate runs through the existing `checkApplication` (`rules.ts`), exactly as Should I apply? does, with the NLL toggle off.
  - `Likely approved` + bonus `Eligible` → ranked.
  - `Check manually` on either → ranked, with a `CHECK` badge.
  - `Likely denied` or bonus `Not eligible` → moved to a collapsed **Not right now** group, each with its reason and, where the evaluator has one, the date it changes (`Eligible from Mar 2028`).
- **No rules for the issuer:** ranked, with the v7 line `No issuer rules in the catalog`.
- **5/24 cost:** a ranked card that would count toward 5/24 shows `Takes you to 4/5` in its sheet (count from the existing 5/24 domain code).

## 4. Ranking (`src/lib/domain/findCard.ts`, unit-tested)
All values are dollars per card; every number in the sheet shows how it was made.

### 4.1 Parts
- **Bonus value:** `public_offer.bonus` × cents-per-point for the program (the owner's value from Points settings, else `default_cents_per_point`); face value for cash. Null when the card has no `public_offer`.
- **First-year fee:** `annual_fee`, or 0 when waived the first year.
- **Reachable:** `public_offer.min_spend ÷ (days ÷ 30)` against total monthly spend.
  - ≤ 100% of monthly spend → `Reachable`.
  - up to 150% → `Stretch`, e.g. `Needs $2,000/mo · you spend about $1,600`.
  - above → `Out of reach`.
  - No spend profile → not judged.
- **Everyday uplift (full cards only):** for each category, `monthly spend × 12 × max(0, candidate rate − best rate among open cards)`, both valued with the same cents-per-point, using `baseRate` from `bestCard.ts` (non-portal rates, rotating categories excluded). Stubs have no earn rates, so the uplift is null and the row says `Earn rates not researched yet`.
- **Elevated:** when at least three earlier offers for the card are known (v9 changelog), the current bonus is `Elevated` if it is above their median.

### 4.2 Order
- **Goal = Welcome bonus:** sort by `bonus value − first-year fee`, descending. `Stretch` cards sort after all `Reachable` ones; `Out of reach` cards go last. Cards with no `public_offer` are listed at the end as `No public offer on file`.
- **Goal = Everyday value:** sort by `everyday uplift − annual_fee` (ongoing fee, not first-year), descending. Cards with a null uplift are listed at the end.
- **Credits are not counted.** A $300 travel credit is worth $300 only if the owner would spend it anyway. The sheet lists a full card's credits with their total as information: `Credits listed: $550/yr · not counted`.
- **Valuation notice:** while any ranked program uses the 1¢ default, the page shows `Using 1¢ per point for Chase UR, Amex MR · set your values in Points ›`. With defaults, 60,000 points and $600 cash rank the same.

## 5. Page
- **Route:** `/find-card`, under **More** as **Find a card**. Should I apply? gets a link row **Not sure which card? Find a card ›**.
- **Row** (one line, v5): card name / `60K pts · $4,000 in 3 mo` / right side `≈ $505` (net first-year value) with a `REACHABLE`, `STRETCH`, `ELEVATED` or `CHECK` badge.
- **Sheet:**
  - the breakdown: bonus value, fee, net, reachability with the arithmetic, everyday uplift by category (top three), 5/24 cost;
  - the offer's `as_of` date and source behind ⓘ (stub facts carry the v5 **⚠ Unverified** badge until checked);
  - actions: **Should I apply?** (opens `/apply` on that card) and **Add card** (the v6 Welcome offer fieldset prefilled from `public_offer`).
- **Footer:** `Offers as of <newest as_of> · ranking uses public offers; yours may differ`.

## 6. Copy my situation
A **Copy my situation** button on the page copies plain text for pasting into a chat:
- open cards with open dates, 5/24 count and next drop-off;
- points balances and cents-per-point values;
- the spend profile and current criteria;
- the top five ranked cards with their numbers.

It goes to the clipboard only. Nothing is sent anywhere.

## 7. Tests
- Unit: bonus value with owner cpp, default cpp and cash; first-year fee waiver; reachability thresholds and the no-profile case; uplift against one and several open cards, including a category where the candidate is worse; both sort orders; stubs and missing offers placed last; elevated needs three prior offers.
- Storage: `spendProfile` and `findCardCriteria` on SQLite and local D1; import/export round trip.
- e2e (390px and desktop): set a spend profile, open Find a card, see ranked rows and the Not right now group, change Card type and Goal, open a sheet, follow **Should I apply?**; contrast passes in both themes.

## 8. Acceptance
1. With the demo seed, Find a card lists only cards with no open holding; ineligible cards appear under **Not right now** with a reason.
2. Changing **Card type** to Personal removes every business card from both groups.
3. A card whose minimum spend needs more than the profile's monthly total is flagged `Stretch` or `Out of reach` and ranks below every `Reachable` card.
4. Every dollar figure in a sheet can be reproduced from the numbers shown beside it.
5. With no spend profile and no `public_offer` data, the page renders, explains what is missing, and errors nowhere.
6. `npm run typecheck`, `npm test`, `npm run test:e2e` pass.

## 9. Open questions for the owner
1. Should **Not right now** also list cards you already hold whose bonus you could earn again later?
2. Reachability uses total spend. Some spend can't go on a card (rent, transfers); should the profile have a separate "can put on a new card" total?

## 10. As built (deviations, deliberate)
- **Offers are stale.** Every `public_offer` comes from the v6.2 import, dated 2026-06-08 (the dataset has not synced since). The footer and each sheet show that date; v9 is what keeps them current.
- **Elevated (§4.1)** is implemented and unit-tested (`isElevated`, `findCards(..., offerHistory)`), but no offer history exists until v9's changelog, so no card shows `ELEVATED` yet.
- **Uplift valuation (§4.1).** "Valued with the same cents-per-point" is read as: each rate is turned into cents per dollar with its own program's value (the owner's, else the default), exactly as Best card does, then compared.
- **5/24 line** reads `Takes you to 4/24 (Chase denies at 5)`, matching the app's `3/24` notation, instead of `4/5`.
- **Issuers (§2.2)** are stored as the ones turned off (`excludedIssuers`), so an issuer added to the catalog later is on by default.
- **A missing spend window.** An offer with a minimum spend but no number of days is judged over 90 days, and the sheet says so.
- **Valuation notice (§4.2)** names the programs still on the catalog's default value (which is below 1¢ for hotel programs since v6.2), not "1¢".
- **Badges.** A row shows one: `CHECK` wins over reach; `REACHABLE` / `STRETCH` / `OUT OF REACH` show only with a spend profile and the Welcome bonus goal.
- **Criteria** are saved on every change (their own request, which touches nothing else in Settings). The page keeps its own copy while open, so quick changes can't be overwritten by a slower save's reply.
- **Add card** from a sheet opens `/cards?card=<id>&offer=1` with the public offer already in the Welcome offer fields; **Should I apply?** opens `/apply?card=<id>`.
- **Discontinued cards** are not in the catalog at all (the v6.2 importer skips them), so there is nothing to filter.
- **Open questions (§9)** are not decided: held cards are never listed, and reachability uses total spend.
