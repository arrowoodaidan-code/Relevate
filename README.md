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

**A buyer never leaves this host to pay, and is never handed a payment path that cannot return them
to a page that loads.** A payment taken in a Stripe account we cannot see is money we cannot
reconcile; a payment whose success page is unreachable is worse.

### The three ways a plan can be offered — in priority order

1. **Stripe Payment Link** (`src/lib/payment-links.ts`). Created in our own connected account, so it
   needs no server route and works even while this host's `/api/*` layer is stale. The client
   appends `client_reference_id` (the signed-in user's id) and `prefilled_email`, so a purchase is
   still attributable when we reconcile. Paste a link per plan against its price lookup key
   (`PRODUCTS → Payment links` in Stripe), with `after_completion` → redirect to
   `https://<our public host>/app/subscription/success?plan=<price lookup key>`.
2. **The API path**, and only when `API_CHECKOUT_ENABLED = true` in that same module. It stays
   **false** because on the branded host today the published `/api/*` layer creates sessions whose
   `success_url` is an internal hostname (`ip-10-110-66-173.…`, measured 2026-09-23), so the buyer
   would be stranded. Flip it only after a session created on the live host has been read back from
   Stripe and its `success_url` is a public host that loads.
3. **Nothing.** A plan with neither of the above renders a disabled CTA labelled "Not available
   yet" with an honest note — the price stays visible because it is real, but no button promises a
   purchase that cannot complete. This is the current state of *all* plans until the Payment Links
   exist, and of the yearly cycle until yearly links do.

### The post-payment redirect itself

`src/lib/public-url.ts` resolves the base URL for `success_url`/`cancel_url` in this order: an
explicitly configured public base URL (`PUBLIC_APP_URL`/`APP_BASE_URL`/`SITE_BASE_URL`) → the host the
request arrived on (`x-forwarded-host`, else `Host`) → platform hostnames, only if they pass the
public-hostname test → nothing, in which case `create-checkout-session` throws *before* creating a
session. Internal names (IP literals, `localhost`, single-label, `.internal`/`.local`/`.svc`, and
IP-encoded machine names like `ip-10-110-83-102.…`) can never be written into a Stripe field.

### Why Payment Links exist (the live layer)

Publishing refreshes the **client** bundle but not the `/api/*` layer: after publishing `da51621`,
which contains the redirect fix, the live host still rejected `pro_annual` (8 of 8 requests,
"Must be one of: starter_monthly, pro, team"), still handed a **demo** account a payable session
(6 of 6 requests) and still wrote the internal host into new sessions. Every backend behind the
public host behaves that way — it is not a partial rollout. The Payment Link path is the money path
that does not depend on that layer.

### Rules this area must keep true

- The only navigation is to a Stripe URL this page obtained: no literal or cross-host URL is
  assigned to `window.location`.
- No hostname of another deployment may appear in `src/` as a destination (naming one in a comment
  that explains the history is fine).
- A plan with no working path gets a disabled CTA, never a button that can fail.
- No raw server diagnostics (HTTP codes, `Invalid priceLookupKey: …`) in anything a visitor reads;
  they go to the console.
- A demo account is refused a payable link client-side, because the live layer has no demo guard.
- `bun scripts/check-checkout-safety.ts` (47 checks; it executes the resolver and the availability
  rules) fails the build if any of the above regresses.

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
