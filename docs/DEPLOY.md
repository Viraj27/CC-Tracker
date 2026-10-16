# Deploying CC-Tracker to Cloudflare (v3)

This puts CC-Tracker on **Cloudflare Workers** with a **D1** database, behind **Cloudflare Access** so only you can sign in. Once it's set up, every push to `main` deploys automatically. You can then use the app from your iPhone as a home-screen app, with the Mac switched off.

Spec: [`SPEC-v3-phone.md`](SPEC-v3-phone.md).

> **Privacy:** nothing account-specific goes in the repo. The API token and account ID live only in GitHub Actions secrets. CI looks up the D1 database id at deploy time and writes it into its own temporary copy of `wrangler.jsonc`, so the id is never committed. Your email address is entered only in the Cloudflare dashboard.

## How it fits together

| Piece | Where |
|---|---|
| App | Next.js on Workers via the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare). Config: `wrangler.jsonc`, `open-next.config.ts` |
| URL | `https://cc-tracker.<your-subdomain>.workers.dev` (Worker name `cc-tracker`) |
| Database | D1 database `cc-tracker`, binding `DB`. Prisma talks to it through `@prisma/adapter-d1` |
| Schema | `prisma/migrations/*/migration.sql`. Wrangler applies these same files to D1 (`migrations_pattern` in `wrangler.jsonc`), so there is one migration history |
| Catalog | Bundled into the Worker at build time (`src/generated/catalog.json`). On the first request after a deploy, it's loaded into D1 if its content hash changed. That load only touches the `Catalog*` tables, never your data |
| Login | Cloudflare Access in front of the whole Worker. The app has no login code |
| CI/CD | `.github/workflows/ci.yml`. PRs run typecheck, tests and build. Pushes to `main` do the same, then find/create D1, apply migrations and deploy |

## 1. API token, account ID and GitHub secrets

### Create the API token

1. Cloudflare dashboard → **Manage account → Account API tokens** (or **My Profile → API Tokens**) → **Create Token** → **Create Custom Token**.
2. Name it, for example `cc-tracker GitHub Actions`.
3. Under **Permissions**, add exactly these two rows:

   | Scope | Permission | Access | Used for |
   |---|---|---|---|
   | Account | **Workers Scripts** | **Edit** | `wrangler deploy` (upload the Worker, enable its workers.dev route) |
   | Account | **D1** | **Edit** | `wrangler d1 list/create`, `wrangler d1 migrations apply --remote` |

4. **Account Resources:** *Include → your account* (only that one account).
5. You don't need any zone resources, because the app uses workers.dev and no custom domain. Client IP filtering and TTL are optional.
6. **Create Token** and copy the value. Cloudflare only shows it once.

> These two permissions cover every API call the deploy job makes (it sets `CLOUDFLARE_ACCOUNT_ID`, so wrangler doesn't need to list your accounts). If a deploy fails with an authentication error (code `10000`) on a step these don't cover, edit the token and add **Account → Account Settings → Read**. Cloudflare's broader alternative is the **Edit Cloudflare Workers** template plus **Account → D1 → Edit**.

### Find your account ID

Dashboard → **Workers & Pages** → **Account details** → copy **Account ID**. Or press `Ctrl/Cmd+K` anywhere in the dashboard and run *Copy account ID*.

### Add both as GitHub secrets

GitHub → the repository → **Settings → Secrets and variables → Actions → New repository secret**:

- `CLOUDFLARE_API_TOKEN`: the token above
- `CLOUDFLARE_ACCOUNT_ID`: the account ID

Until both secrets exist, the deploy job on `main` is skipped with a warning. Tests and build still run.

## 2. First deploy

1. **One-time: make sure the account has a workers.dev subdomain.** Open **Workers & Pages** in the dashboard once. If it asks you to pick a subdomain, choose one (it's part of the app URL). CI can't answer that prompt.
2. Merge the v3 PR into `main` (or push to `main`, or run the workflow manually: **Actions → CI → Run workflow** on `main`).
3. The **Deploy to Cloudflare** job:
   1. `npm run cf:build`: builds Next.js and the Worker bundle.
   2. `npm run cf:d1:ensure` ([`scripts/cf-d1-ensure.mjs`](../scripts/cf-d1-ensure.mjs)): finds the D1 database `cc-tracker`, or **creates it on the first deploy**, and writes its id into the runner's copy of `wrangler.jsonc`.
   3. `npm run cf:migrate:remote`: `wrangler d1 migrations apply cc-tracker --remote`. Applies any migrations D1 hasn't seen yet, tracked in its `d1_migrations` table.
   4. `npm run cf:deploy`: `opennextjs-cloudflare deploy`.
4. The job log prints the URL, `https://cc-tracker.<subdomain>.workers.dev`. **Set up Access (next step) before you put any data in.** Until then the URL is public and the database is empty.

To deploy from your own machine instead (optional): `npx wrangler login`, then run `npm run cf:d1:ensure` with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` set, then `npm run cf:migrate:remote && npm run cf:deploy`. Don't commit the `wrangler.jsonc` change the ensure script makes.

## 3. Cloudflare Access (login)

Cloudflare Access can protect a Worker's `workers.dev` URL directly ([Workers → Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)), so you don't need a custom domain. On the Free plan, Zero Trust covers up to 50 users, and you only need one.

1. **Enable Zero Trust** if you haven't: dashboard → **Zero Trust**. Pick a *team name* (your login page will be `<team>.cloudflareaccess.com`) and the **Free** plan.
2. **Add one-time PIN login.** **Zero Trust → Integrations → Identity providers → Add new identity provider → One-time PIN**. New organizations only have "log in with Cloudflare" by default.
3. **Protect the Worker:** **Workers & Pages → cc-tracker → Access** tab → **Protect this Worker behind Access** → **All traffic**. For the authentication policy, pick **Cloudflare account** (temporary) → **Apply Access**.
   This protects the workers.dev URL and any preview/version URLs of the Worker.
4. **Restrict it to your email:** **Zero Trust → Access controls → Applications** → open the application that step 3 created (it covers the `cc-tracker` Worker) → **Policies**:
   - Edit the policy (or add one): **Action: Allow**, **Include → Emails → *your email address***. Remove the temporary "Cloudflare account" rule so this is the only Allow rule.
   - **Login methods:** enable **One-time PIN**. You can also turn on *Instant Auth* so the PIN screen opens directly.
   - **Session duration:** something comfortable for a phone, for example **1 month** (allowed range: immediate to one month). You'll need to enter a PIN this often.
5. Test it in a private window. Opening the URL should show the Cloudflare Access page. Enter your email, then the 6-digit code from `noreply@notify.cloudflare.com` (valid 10 minutes), and the app opens.

Equivalent alternative: create a **self-hosted** application for the hostname `cc-tracker.<subdomain>.workers.dev` under **Zero Trust → Access controls → Applications** with the same policy. Hostname-based apps take precedence over Worker-level Access.

## 4. Move your data from the Mac

1. On the Mac: `npm run dev` → **Settings → Export / import → Export JSON**. Keep the file private: don't commit it, and delete it when you're done.
2. On the hosted app (after logging in): **Settings → Export / import →** choose **Merge** → pick the file.
   - The import is validated first. It's written as **one atomic batch**, so it either fully succeeds or changes nothing. Merge is idempotent, so re-running it is safe.
   - Use **Replace** only to wipe the hosted data and load the file instead.
3. Check the Wallet, 5/24 and payments look the same as on the Mac.

From then on, the hosted app is the one copy of your data. There is no sync back to the Mac. The local app keeps working as a separate local copy.

## 5. iPhone

1. Open the app URL in **Safari** and log in (email → PIN).
2. **Share → Add to Home Screen → Add.** The icon and the name "CC-Tracker" come from the app.
3. Open it from the home screen. It runs full screen as its own app.

**Login inside the home-screen app:** iOS gives home-screen apps their own cookie storage. When you add the app, iOS copies Safari's cookies into it once. So if you logged in first, it usually opens already signed in. After the Access session expires, the home-screen app shows the Access login page itself. Enter your email and the PIN from the Mail app, and it continues. (The one-time cookie copy is described in Apple's WWDC23 "What's new in web apps" session. It isn't in Apple's written docs, so treat it as best effort.)

**Updates:** every deploy is live the next time you open the app. Pages are rendered per request and sent with `Cache-Control: no-store`. JS/CSS files are content-hashed. There is deliberately **no service worker**, so nothing can serve stale pages or data. Fully closing and reopening the app (swipe it away in the app switcher) always loads the latest version. The app needs a connection; there is no offline mode.

## 6. Troubleshooting

**Access login loop (PIN accepted, but you land on the login page again)**
- Make sure the policy includes *your exact email* and is an **Allow** action, and that **One-time PIN** is enabled for the application.
- In the home-screen app: delete it, log in again in Safari, then **Add to Home Screen** again (this re-copies the cookie). Also check that Settings → Safari → *Block All Cookies* is off.
- If both a hostname-based app and Worker-level Access exist, the hostname one wins. Make sure that's the one with your policy, or delete one of them.

**A save fails with an error after the app was open a long time**
The Access session probably expired. Close and reopen the app (swipe it away in the app switcher), log in, and save again. Nothing partial is written: each save is a single request.

**App looks out of date after a deploy**
Swipe the app away in the app switcher and reopen it. If it's still old, check the deploy job succeeded in GitHub Actions. If it is, the URL already serves the new version, because there is no service worker or HTML cache.

**Manifest or icon missing when adding to the home screen**
The manifest is requested with credentials (`crossorigin="use-credentials"`), so it passes Access once you're logged in. Log in in Safari first, *then* use Add to Home Screen. If iOS still shows a generic icon, add a second, hostname-based Access application for `cc-tracker.<subdomain>.workers.dev/manifest.webmanifest` and `/icons/*` with a **Bypass → Everyone** policy. These files contain no personal data.

**Deploy job: `wrangler d1 migrations apply` failed**
- Read the SQL error in the log. Migrations are plain SQLite run by D1. A migration that fails is not recorded as applied, and the job stops before deploying the new code, so the old version keeps running. Fix the migration and push again.
- To see the state: `npx wrangler d1 migrations list cc-tracker --remote` (with the token/account env vars, or after `wrangler login`).
- Adding a migration: change `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>` locally (this creates `prisma/migrations/<timestamp>_<change>/migration.sql` and updates your local SQLite), commit, and push. CI applies the same file to D1. Avoid SQL that D1 rejects. If Prisma emits `PRAGMA foreign_keys` for a table rebuild, use `PRAGMA defer_foreign_keys = true` instead (see [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)).

**Deploy job: "You need to register a workers.dev subdomain"**
Do step 2.1 once in the dashboard, then re-run the job.

**Deploy job: authentication error / 403**
Check the token's permissions (step 1) and that `CLOUDFLARE_ACCOUNT_ID` is the account the token is scoped to.

**Catalog changes don't appear**
The catalog is bundled at build time, so a change needs a deploy (push to `main`). It's loaded into D1 on the first request after the deploy.

## Local development (unchanged from v1)

- `npm run dev` uses **local SQLite** (`prisma/cc-tracker.db`) under Node, exactly as in v1. You don't need a Cloudflare account, wrangler login or network.
- `npm run preview` builds the Worker and runs it locally in the real Workers runtime (workerd) against a **local D1** in `.wrangler/state/` (gitignored), after applying the migrations to it. Open http://localhost:8787. Useful before pushing changes that might behave differently on Workers. To run the Playwright smoke tests against it: `E2E_BASE_URL=http://localhost:8787 npm run test:e2e`.
- `npm test` runs the storage tests against both local SQLite and a local D1 (`wrangler d1 migrations apply --local` plus Prisma's D1 adapter). This needs no Cloudflare account.

## Limits worth knowing (Workers Free plan)

- **Worker size:** 3 MiB gzipped on Free. The CI build log prints the size (about 2.1 MiB at v3).
- **D1 queries per request:** 50 on Free. A page view uses 14 (measured against a local D1); a save uses about 16. Import and catalog load use one atomic D1 `batch()` each, so the size of an import file doesn't matter.
- **D1 storage:** 500 MB per database on Free, far more than this app needs. D1 Time Travel lets you restore the database to any point in the last 7 days (Free).
