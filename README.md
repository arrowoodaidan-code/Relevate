# Relevate site

Single repo for the Relevate marketing site/app (TanStack Start + Vite + Tailwind).
The live deploy source is the shared site tree, and the lead-run publish path is
the only way changes go live — see `WORKFLOW.md` for branching and PR rules.

## Pre-publish gate: `scripts/preflight.sh`

**When to run:** before any publish (`publish_site` / per-host deploy), from the
tree that is about to be published — and in your own clone before opening a PR
that touches `src/`. It takes a couple of minutes (typecheck + build).

```bash
bash scripts/preflight.sh
```

It fails loudly on the failure classes that have actually broken deploys:

1. **Dirty git tree** — refuses to run if `git status --porcelain` shows
   anything (modified, staged, or untracked). Uncommitted edits in the deploy
   tree get swept into other people's commits; this is exactly how the
   duplicate `EHO_LEGEND` / `REALTOR_MARK` declarations reached `main`
   on 2026-09-17.
2. **New TypeScript errors** — runs `bunx tsc --noEmit` and compares against
   the committed baseline `scripts/tsc-baseline.txt` (counts per file + error
   code). An error code appearing for the first time, or more often than
   baselined, fails the gate; known baseline noise does not. Duplicate-
   declaration errors (`TS2300` / `TS2323` / `TS2451`) are never baselined —
   they always fail.
3. **Duplicate top-level declarations in `src/`** — an esbuild parse scan
   (`scripts/check-duplicate-declarations.ts`) for the exact class the bundler
   rejects with *"symbol X has already been declared"*.
4. **Red build** — `bun run build` must exit 0.

On success it prints the branch and HEAD sha it validated, so the publish that
follows is traceable to an exact commit. If it fails, fix the reported items on
a clean tree and re-run — do not publish red.

### Updating the baseline

After an intentional refactor legitimately changes the set of pre-existing
errors, regenerate the baseline and review it in the same PR:

```bash
bash scripts/preflight.sh --update-baseline
```

Never hand-edit `scripts/tsc-baseline.txt`, and never use it to silence a NEW
error — new errors are the signal the gate exists to catch.

## Checkout: which host can take a payment, and how to change it

Relevate is deployed to two live hosts, and only one of them can take money today.

| Host | Can it charge? | Why |
| --- | --- | --- |
| `relevatelistingassistant.ctonew.app` (platform host — the branded domain) | **No** | `POST /api/create-checkout-session` answers `500 {"error":"STRIPE_SECRET_KEY is not configured"}`. Its server layer is also older than this repository: it rejects `starter_annual` / `pro_annual` / `team_annual` with `400 Invalid priceLookupKey … Must be one of: starter_monthly, pro, team`. |
| `site-gray-five-32.vercel.app` (product host — Vercel) | **Yes** | All six plan keys return live Stripe Checkout Sessions (`POST /api/create-checkout-session` → `200` → `https://checkout.stripe.com/…`). It has its own `STRIPE_SECRET_KEY`. |

### How a buyer completes a purchase today (no code change needed)
1. On `/pricing` — on either host — click **Subscribe** on the plan they want.
2. If that host can take a payment, checkout starts in place and they land on Stripe's page.
3. If it cannot, a confirm step names the destination host and states that nothing has been charged. **Continue** opens the product host with the same plan already selected, and checkout begins there.

Nothing leaves the page until the buyer clicks Continue, and no host ever moves them silently.

### How to make the branded domain charge directly
1. **Set `STRIPE_SECRET_KEY` for this site** (owner: Settings → Secrets). Saving a secret restarts
   the live site, which removes the `500`; the three monthly keys then start checkout in place on
   the branded domain.
2. **Have the platform host's server routes rebuilt from this repository.** They are older than the
   seeded baseline (they reject keys that have been in `src/lib/price-keys.ts` since the first
   commit), and publishing the site has not updated them — a publish swaps the client build, not
   that API layer. Until it is rebuilt, the annual keys keep answering `400` there and annual plans
   keep going through the handoff step.
3. **Decide where the money lands.** Sessions created by the Vercel host do not exist in the
   connected Stripe account (reading one back returns `resource_missing`), so that revenue cannot be
   seen or reconciled by this team. Pointing the branded domain at the connected account's key is
   what makes revenue land somewhere the business can see it.

### Rules this area must keep true
- No host may move a buyer to another hostname without naming the destination and getting a click
  first — `bun scripts/check-checkout-handoff.ts` fails the build if that regresses.
- Plan keys live only in `src/lib/price-keys.ts`; the checkout module carries no copy of them.
- Never claim the branded domain can take a payment while `STRIPE_SECRET_KEY` is unset there: the
  endpoint answers `500`.

## Analytics: intentionally off

Relevate ships **no third-party analytics connection**. No vendor script is injected into any page,
no analytics key is sent to the browser, and no event leaves the page. The published build used to
initialise a vendor with an empty key (a console warning on every page load); that loader is gone,
together with its dependency, its env vars and its key.

`src/lib/analytics.ts` is a documented **NO-OP**, kept so the ~20 call sites in the routes keep
compiling and keep marking where a first-party counter would go:

- `trackEvent(event, properties)` — does nothing.
- `identifyUser(userId, traits)` — does nothing.
- `isAnalyticsEnabled()` — always `false`.

`src/lib/product-checkout.ts` keeps its optional `onAnalytics` hook; it fires the no-op, not a
vendor call. Do not delete the call sites — they are the map of what would need to be counted.

**Honest consequence:** with no analytics source at all, the signup/activation funnel, trial→paid
conversion and churn numbers are **empty**. Nothing is measured today. When those KPIs are wanted
back, the path is counting off our own database inside the app (signups, generations, trials,
subscriptions) — not re-adding a browser analytics vendor.

### Rules this area must keep true
- No analytics vendor script, key or host may appear in `src/`, `package.json`, `bun.lock`,
  `package-lock.json`, a root `.env*` file or the built output in `dist/` —
  `bun scripts/check-no-vendor-analytics.ts` fails if one comes back (run it after
  `bun run build` to cover the built output).
- Every `<script>` rendered by `src/routes/__root.tsx` stays a `application/ld+json` metadata
  block; no inline third-party loader.
- The analytics module stays a NO-OP and its call sites stay in place.

## Secrets: never in a tracked file

A committed value is readable by anyone with repo access and it stays in git history forever, so
**real secrets never enter a tracked file**. The tree used to violate this: `.env.prod` was tracked
and carried a real `VERCEL_OIDC_TOKEN` (a 1066-character JWT) plus a live PostHog project key.
This is fixed as follows:

- `.env.prod` is **untracked** (`git rm --cached .env.prod`) and `.gitignore` keeps ignoring `.env*`.
  The file itself is untouched on disk here, and this change deletes nothing the build needs:
  nothing in the repository reads it (no `dotenv`, no `envDir`, no file read), and Vite's default
  env files are `.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local` — `.env.prod` is not one
  of them. Secrets reach the running app as environment variables (owner: Settings → Secrets).
- **What happens on the next `git pull`:** in a clone where `.env.prod` is still tracked and
  unmodified, git deletes it from the working copy, because the commit removes the path. Nothing
  reads it, so publishing is unaffected. To get a local copy again:
  `vercel env pull .env.prod` (it is ignored, so it will not come back into git).
- Real values live in the environment only. Placeholder-looking files are fine; a real value is not.

### Gate: `bun scripts/check-no-committed-secrets.ts`

Fails if any tracked file contains a secret-shaped value: Stripe live/test/restricted secret keys
and `whsec_` webhook secrets, OpenAI-style `sk-…`, a PostHog `phc_…` key, GitHub/Slack/AWS/Google
credentials, PEM private keys, any JWT, or any single opaque token-like run of 200+ characters. It
also fails if any `.env*` file is tracked (templates in an explicit allow-list excepted), and it
reports the env-shaped lines it classified as placeholders. A green run is backed by
positive/negative controls inside the gate: every pattern is exercised against a synthetic
real-looking sample (built at runtime so the gate does not flag itself) and placeholder text must
classify as safe — so the scan cannot pass by matching nothing.

Placeholder markers (`...`, `…`, `xxxx`, `your_`, `placeholder`, `example`, `change_me`, `redacted`,
`<...>`) mark a value as safe. Never append one to a real value.
