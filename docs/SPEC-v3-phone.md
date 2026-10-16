# CC-Tracker — v3 Spec: iPhone access via Cloudflare

Builds on v1 (`docs/SPEC.md`). Goal: use CC-Tracker from the owner's iPhone (and laptop) anywhere, with the Mac off. One shared hosted database — no device sync.

> Same privacy rule as v1: no personal data in the repo. Secrets (Cloudflare token, account ID) live only in GitHub Actions secrets / Cloudflare, never in code.

## 1. Decisions (made by owner)

| Topic | Decision |
|---|---|
| Host | **Cloudflare Workers**, running Next.js via the **OpenNext Cloudflare adapter** (`@opennextjs/cloudflare`) |
| Database | **Cloudflare D1** (SQLite-based). Prisma via its D1 driver adapter, unless it proves unworkable — then pick the closest supported option and document why |
| Login | **Cloudflare Access** in front of the whole app (single allowed email, configured by the owner in the dashboard). **No auth code in the app.** |
| Deploys | **GitHub Actions**: every push to `main` → build → apply D1 migrations → deploy. PRs: build + test only |
| Phone | **PWA**: installable via Safari "Add to Home Screen" |
| Reminders | Still in-app only (no push in v3) |

## 2. Requirements

### 2.1 Cloudflare runtime
- App runs on Workers via OpenNext; all pages and server actions work.
- `wrangler.jsonc` (or `.toml`) with the D1 binding; no secrets committed. Account ID comes from CI env/secrets.
- Choose the URL: default `*.workers.dev`. Verify (from Cloudflare docs) that Cloudflare Access can protect it; if not, document the minimal alternative (e.g. a route on a custom domain) for the owner.

### 2.2 Database
- D1 schema + migrations equivalent to the v1 Prisma schema; user data and catalog tables unchanged in meaning.
- Catalog loads into D1 automatically (on deploy or on first request, idempotent by content hash — same rule as v1: never touches user data).
- **Local dev keeps working** (`npm run dev`), either against local SQLite as today or wrangler's local D1 — document which.
- Export/Import (Settings) works on the hosted app — this is how the owner moves data from the Mac.

### 2.3 CI/CD — `.github/workflows/`
- On PR: install, typecheck, `npm test`, build.
- On push to `main`: same, then apply D1 migrations and deploy.
- Uses GitHub secrets **`CLOUDFLARE_API_TOKEN`** and **`CLOUDFLARE_ACCOUNT_ID`** (the owner sets these). Document the minimum token permissions needed.

### 2.4 PWA / iPhone
- Web app manifest (name, short name "CC-Tracker", theme colors for light/dark, `display: standalone`), icons incl. Apple touch icon (simple generated icon — no brand logos).
- iOS meta tags; safe-area insets respected; looks right at 375–430px wide.
- **Updates reach the phone**: after a deploy, the installed app shows the new version on next open (no stale cache). If a service worker is used, it must not serve stale HTML/data; prefer network-first for pages.
- Works behind Cloudflare Access (login session in Safari carries into the home-screen app or the re-login flow is documented).

### 2.5 Docs — `docs/DEPLOY.md`
Step-by-step for the owner:
1. Create API token (exact permissions) and find account ID; add both as GitHub secrets.
2. First deploy (create D1 database — scripted if possible).
3. Set up Cloudflare Access: Zero Trust → Access → application for the app URL → policy "allow email = owner's email" → one-time PIN login.
4. Move data: Mac app → Settings → Export JSON → hosted app → Settings → Import (merge).
5. iPhone: open URL in Safari → log in → Share → Add to Home Screen.
6. Troubleshooting (Access loop, stale PWA, migrations).

## 3. Out of scope
Push notifications, multi-user/P2, v2 update routine and third-party hotel/restaurant data (separate work), custom domain purchase.

## 4. Acceptance criteria
- `npm test` and typecheck pass; new tests for anything non-trivial added (e.g. catalog load on D1, migrations apply cleanly).
- CI workflow passes on the PR (build + test). Deploy job is wired but may only run after the owner adds secrets.
- Local `npm run dev` still works; v1 features unchanged.
- PWA manifest validates; Apple touch icon present; Lighthouse "installable" (or equivalent check) passes.
- `docs/DEPLOY.md` complete; README links to it.
- No secrets or personal data committed.
