# CC-Tracker — v4 Spec: "Wallet" redesign

A visual and navigation redesign. **No feature may be lost** (see §5 parity checklist). Data model, catalog, domain logic, D1/Cloudflare deploy and PWA behaviour stay as they are unless a change is required by the UI.

> Same privacy rule as v1: no personal data in the repo. Demo/test data must be obviously fake.

## 1. Why
The owner rejected the v1 "grid of boxed cards" dashboard. Of ten explored directions, the owner chose **Wallet**: the app is organised around a stack of physical-looking cards; selecting a card brings it to the front and shows everything about it beside (desktop) or below (phone) the stack.

## 2. Visual language (tokens)

| Token | Value |
|---|---|
| Ground (light) | `#E7E5E0` warm grey; text `#15171C`; muted `#616369`; hairline `#D3D1CB` |
| Ground (dark) | Derive an equivalent dark theme (system `prefers-color-scheme`); keep contrast ≥ 4.5:1 |
| Urgent | `#B4371B` (text), used sparingly for expiring/overdue items |
| Primary button | pill, `#15171C` bg, `#F4F3EF` text, min height 40–44px |
| Type | **Hanken Grotesk** (UI, 400/500/600/700) + **Space Mono** (all numbers, dates, IDs, small caps labels; tabular-nums) via `next/font/google` |
| Numbers/dates | Space Mono, uppercase short dates (`31 OCT`, `16 NOV`) |
| Radius | physical cards 16px; buttons pill; no boxed "card" containers for content sections — use hairline-separated lists, generous whitespace |
| Avoid | card grids, left-border cards, gradient washes, emoji, Inter/Roboto/Arial |

**Physical card component** (`WalletCard`):
- Aspect ratio 1.586 (ISO ID-1), radius 16px, solid fill from the card's catalog colour (add `color`/`ink` per catalog card if not present — generic colours only, **no issuer logos or trademarked art**), subtle inset highlight + soft drop shadow.
- Top row: card name (700) + state chip (mono, e.g. `SELECTED`, `FEE IN 30D`, `PAST DUE`). Bottom row: issuer (mono caps) + annual fee (mono, large).
- In the stack: the selected card shows full height; the others are collapsed strips (~62px visible) overlapping like Apple Wallet. Clicking/tapping a strip selects it (animated, respects `prefers-reduced-motion`). Keyboard: real `<button>`s, arrow keys move selection, `aria-pressed` on the selected card.
- Stack order: selected card first, then by urgency (soonest fee / expiring credit / payment), then by fee size.

## 3. Information architecture

### 3.1 Home = Wallet (`/`)
Desktop (≥ 1024px): two columns — **left** the card stack (≈380px), **right** the selected card's detail. Above both, a slim **"Up next" strip**: the dashboard's Needs-attention items as a horizontally scrollable row of compact items (date in mono, title, card, amount, one action), sorted by urgency — this replaces the old dashboard section. Also show the **5/24 count** and next drop-off in the header line (mono, e.g. `7 CARDS · 3/24 · SAT 17 OCT`).

Phone (< 1024px): header → Up next strip → stack (collapsed strips + selected card) → detail below. Bottom tab bar (safe-area aware): **Wallet · Up next · 5/24 · More** (More → Payments, Rotating, Best card, Points, Settings, Add card).

Selection is reflected in the URL (`/?card=<holdingId>` or `/cards/<id>` rendering the same Wallet view with that card selected) so deep links and Back work.

### 3.2 Selected-card detail (right pane / below on phone)
Must contain **everything currently on `/cards/[id]`**, restyled as hairline-separated sections with mono numbers, in this order:
1. Meta line (mono caps): issuer · opened date · payment due day. Card name as a large heading. One-sentence **headline** generated from the card's state (e.g. "Fee posts in 30 days. Use the $250 of card-year credits first.") — derived, not stored.
2. Key figures row: Annual fee (amount + posting date/status), Unused credits this period, Leaves 5/24 (date or "counted out"), ROI this AF year (realized vs fee).
3. **Credits, soonest first** — each row: name, cycle/period, expiry date (urgent colour when within lead time), remaining amount, **Log** pill opening the existing log-use flow (amount defaulting to remaining, note, date). Partial use and history must still work.
4. **Perks** (bags, club passes…) with log-use and value overrides as today.
5. **Other benefits** (spend-threshold benefits etc.).
6. **Protections & insurance** — key terms (coverage, conditions, how to claim) and provenance.
7. **Earn rates**.
8. **Downgrade / product-change options** (with Community curated badge).
9. **Annual fee history** (add AF event form).
10. **Lifecycle log** (retention calls, product changes, closures; add-event form).
11. **Edit card** (holding fields) and provenance (`Source · checked <date>`, Unverified / Community curated badges) everywhere a fact is shown.

Long sections may collapse (disclosure) but must be reachable without leaving the Wallet.

### 3.3 Other screens (keep, restyle to the Wallet language)
- **Up next** (`/up-next` or the phone tab): the full Needs-attention list (same items/logic as today's dashboard) with actions.
- **5/24 & eligibility** (`/eligibility`): counted cards + drop-off dates, count-going-forward timeline, "Considering a card?" rule checker, provenance.
- **Payments** (`/payments`): per card/month due dates, mark paid, past-due highlighting.
- **Rotating 5%** (`/rotating`): current + next quarter categories, activation state.
- **Best card** (`/best-card`): category → ranked open cards.
- **Points** (`/points`): balances, update a balance, estimated total.
- **Settings** (`/settings`): lead times, perk value overrides, cents per point, export/import (merge/replace).
- **Add card / Get started**: adding a holding (catalog or custom), empty-state onboarding when no cards exist.

## 4. Non-goals
No data-model changes beyond optional catalog `color`/`ink` per card. No new features. No service worker. Hosting/CI unchanged.

## 5. Feature parity checklist (all must work after v4)
- [ ] 5/24 count, counted list, drop-off dates, forward timeline
- [ ] Issuer rule checker ("Considering a card?") with provenance
- [ ] Needs attention: AF within lead time, expiring credits, payments due/past due, rotating activation, unverified facts affecting actions
- [ ] Per-card: overview, ROI this AF year, credits with period/expiry/remaining, log use (partial, note, date), usage history
- [ ] Perks with default/overridden values; other benefits; protections with key terms; earn rates; downgrade options
- [ ] AF history (add event), lifecycle log (retention call / product change / closure)
- [ ] Add card, edit card (all holding fields), custom (non-catalog) cards, closed/product-changed cards
- [ ] Payments: mark paid, past due
- [ ] Rotating: current/next quarter, activation toggle
- [ ] Best card ranking incl. activated 5% quarter
- [ ] Points: manual balances, cents-per-point valuation, total
- [ ] Settings: lead times, perk overrides, cpp; export JSON; import merge/replace
- [ ] Provenance on every fact: source link, checked date, ⚠ Unverified, Community curated
- [ ] Light + dark themes; mobile-first (375–430px, no horizontal page scroll); PWA manifest/icons/safe areas unchanged
- [ ] Works on local SQLite (`npm run dev`) and on Workers + D1 (`npm run preview`)

## 6. Acceptance criteria
- Every box in §5 checked; existing unit tests pass; **existing Playwright e2e tests updated to the new UI and passing** (dev and workerd builds), plus new e2e: select a card in the stack (click + keyboard), log a partial credit from the Wallet detail, Up next item action, phone layout at 390px with bottom tabs and no horizontal scroll.
- Typecheck and CI green.
- Screenshots (light + dark, desktop + 390px) attached to the PR description or committed under `docs/screenshots/` using the demo seed only.
- README updated (screens overview).
