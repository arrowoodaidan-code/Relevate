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

## Checkout: where a buyer pays, and where they land afterwards

Relevate publishes on the branded domain (`relevatelistingassistant.ctonew.app`), and the same
codebase can also be deployed to a Vercel host. **Only the host the buyer is already on takes the
money.** No CTA moves a buyer to another hostname to pay: a payment taken on a deployment this team
cannot see is money we cannot reconcile, which is worse than no payment at all.

### Post-payment redirect — fixed 2026-09-23 (P0)

A live session created on the branded domain came back with `success_url`/`cancel_url` on
`ip-10-110-103-223.us-west-2.prod.aws.beamlit.net` — an internal hostname with no public DNS record
— because the endpoint preferred `process.env.VERCEL_URL`. A paying customer would have been sent to
a page that cannot load. Resolution now lives in `src/lib/public-url.ts`, in this order:

1. an explicitly configured public base URL — `PUBLIC_APP_URL`, `APP_BASE_URL` or `SITE_BASE_URL`;
2. the host the request itself arrived on (`x-forwarded-host`, else `Host`) — the session is created
   on the host the buyer is using, so the two always agree;
3. platform hostnames (`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`), **only** if they pass the
   public-hostname test;
4. otherwise **nothing**: `create-checkout-session` throws *before* creating a session, so no money
   is taken and no customer is stranded on a dead page.

Internal hostnames are rejected: IP literals, `localhost`, single-label names,
`.internal`/`.local`/`.svc`, and IP-encoded machine names such as `ip-10-110-103-223.…`. Setting
`PUBLIC_APP_URL` to the site's public address makes resolution deterministic and is the recommended
configuration.

### When a host cannot start a payment

The CTA asks the host the buyer is on. On failure **nothing navigates and nothing is charged**: an
in-place notice states the reason and — when an *annual* key is the problem (the branded host's
server layer is older than this repository and rejects `starter_annual`/`pro_annual`/`team_annual`
with HTTP 400) — offers a one-click retry on the same host with the monthly equivalent. The buyer is
never sent to another host to pay.

### Rules this area must keep true

- The only navigation is to the Stripe URL this host returned: no assignment of a literal or
  cross-host URL to `window.location`.
- No hostname of another deployment may appear in `src/` as a destination (naming one in a comment
  that explains the history is fine).
- Every generated `success_url`/`cancel_url` must be a public hostname. `bun scripts/check-checkout-safety.ts`
  (36 checks; the resolver itself is executed, not pattern-matched) fails the build if that regresses.
- Never claim a host can take a payment while `STRIPE_SECRET_KEY` is unset there.

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
