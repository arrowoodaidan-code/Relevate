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
