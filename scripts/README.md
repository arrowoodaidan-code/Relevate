# Renderer verification scripts (pre-promote gate)

Standard pre-promote sequence (run in repo order; all must pass before SE deploys):

```bash
cd /home/team/shared/site

# 1. Renderer invariant gates (fast, deterministic, offline)
bun scripts/render-regression.ts      # 33/33 — historic render byte/branch invariants
bun scripts/style-fidelity-gate.ts    # 53/53 — region style/geometry fidelity
bun scripts/r5-gate.ts                # 192/192 — R5 branded layout invariants (B1–E layers)
bun scripts/vision-readability-gate.ts # Vision gate (below) — human-level readability audit

# 2. Static + build
bunx tsc --noEmit                     # must stay at baseline (0 NEW errors)
bun run build                         # exit 0
bun scripts/check-no-vendor-analytics.ts  # 15/15 — no third-party analytics connection (run AFTER the build so dist/ is covered)
bun scripts/check-no-committed-secrets.ts   # no secret in any tracked file (env files are local only)
bun scripts/check-checkout-safety.ts       # 36/36 — public redirect URLs + no cross-host routing

# 3. Deploy + post-deploy verification
bash build-vercel.sh && bunx vercel deploy --prebuilt --prod --yes   # SE only
```

## vision-readability-gate.ts (owner directive Aug 14)

Renders a bounded representative set (~12 images) through the SAME production
pipeline (`/api/render` → `renderMarketingPng`) and has the best available
vision model (gpt-4o primary, gpt-4.1-mini fallback — never gpt-4o-mini: small
models confabulate defects on this content) judge each native-res PNG against a
strict readability rubric (clipping, overlap, contrast, placeholders,
distortion, overflow) with anti-confabulation framing + verbatim transcription.
For template-replica graphics the gate ALSO checks two rubric items
deterministically (edge-ink + region contrast) so a model's provably-false
edge-clip claim records as PASS with the pixel evidence. Certifies the Aug 14
social fix: generated captions' hashtags render once in the styled tag row, not
duplicated inside the prose body (branded-templates.ts `stripTrailingHashtagBlock`).
**Template fidelity pathway (owner req #2):** every template-replica case also
writes its SYNTHESIZED BEFORE raster (`<slug>-source.png`), runs a second
two-image gpt-4o call (before + output) under a strict fidelity rubric
(typography look, same-region geometry, colors, layout, no shift/stretch/clip,
non-editable base layer composited untouched), and measures the base layer
deterministically (non-editable pixel diff ≈ 0). Report has separate Readability
and Fidelity sections; fidelity FAIL beats readability. R5 branded renders have
no before image → readability only.

- **Run:** `bun scripts/vision-readability-gate.ts` (needs OPENAI_API_KEY; ~$0.15–$0.40/run)
- **Exit:** 0 = no strict FAIL · 1 = any strict FAIL (blocks promote). `LIMIT` =
  documented known limitation (two: ultra-small 300×388 template upscaled to the
  800px floor, and the WebP→PNG guard case whose source is the dark
  forest-background.webp design asset — both fixture-inherent, not regressions),
  reported but non-blocking.
- **Stability requirement (Aug 19):** run the gate TWICE before promote and
  require both runs to agree with **0 strict FAIL** (actual result: 11 PASS /
  1 LIMIT / 0 FAIL). gpt-4o can flip PASS/FAIL on borderline images, so two
  consecutive identical runs guard a future promote against model noise.
- **Backlog (not built):** generalize the branded-case deterministic-refute
  hardening into per-case pluggable refute thresholds, so the webp/small
  fixture classes carry per-region refute bars instead of knownLimit.
- **Output:** rendered PNGs + `report.{json,md}` in
  `/home/team/shared/render-samples/vision-gate/`

Includes: all 4 R5 layouts (medium), the owner's exact Flyer-Hero no-price case
(101 WEST M APT 1019 / Retreat of Clemson / Leo Matis Meza), long-body stress
cases, and template-replica cases (dark flyer, small 300×388, WebP-source,
social). If it FAILs, fix the defect in the renderer, re-run the whole sequence
above, and commit the new report.