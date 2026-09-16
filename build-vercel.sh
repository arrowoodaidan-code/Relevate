#!/usr/bin/env bash
# Produce a Vercel Build Output API bundle (.vercel/output) for this site, then
# deploy it with:  bunx vercel deploy --prebuilt
#
# Why Build Output API instead of Vercel's Vite/framework detection:
#  - TanStack Start emits a host-agnostic fetch handler (dist/server/server.js)
#    that dynamic-imports its own ./assets chunks and externalizes node deps.
#    Letting Vercel trace/detect that is fragile.
#  - Bundling it into one self-contained file (deps + dynamic chunks inlined) in a
#    single render.func removes all tracing/detection risk. vercel-entry.ts adapts
#    the Node (req,res) launcher to the web fetch handler.
set -euo pipefail
cd "$(dirname "$0")"
umask 002

echo "[1/3] vite build (light — safe under the sandbox memory cap)"
bun run build

echo "[2/3] assemble .vercel/output (Build Output API v3)"
rm -rf .vercel/output
mkdir -p .vercel/output/functions/render.func
cp -R dist/client .vercel/output/static
rm -f .vercel/output/static/index.html   # SSR owns "/", not a static shell

echo "[3/3] bundle SSR handler + deps into the render function"
# --outdir (not --outfile): satori/@resvg/resvg-js emit multiple files (the entry
# plus two native .node binaries), which a single --outfile cannot hold. Bun names
# the entry vercel-entry.js when --outdir is used — .vc-config.json must match.
bun build vercel-entry.ts --target node \
  --outdir .vercel/output/functions/render.func
# Rename the emitted entry to .mjs: the Vercel Node runtime loads .js as CommonJS
# (no package.json with "type":"module" ships in the function dir), which would
# crash on the bundle's ESM import statements. .mjs is always treated as ESM.
mv .vercel/output/functions/render.func/vercel-entry.js \
   .vercel/output/functions/render.func/vercel-entry.mjs

# Ship renderer assets (backgrounds, header bands, and matching font weights)
# next to the entry so src/lib/render.ts can resolve them bundle-relative on Vercel.
mkdir -p .vercel/output/functions/render.func/assets
cp /home/team/shared/design-assets/flyer-background.png \
   /home/team/shared/design-assets/social-background.png \
   /home/team/shared/design-assets/flyer-header-band.png \
   /home/team/shared/design-assets/social-header-band.png \
   .vercel/output/functions/render.func/assets/
cp /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
   /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf \
   /usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf \
   /usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf \
   /usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf \
   /usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf \
   .vercel/output/functions/render.func/assets/
# Round 2 font variety (Aug 13): OFL faces — Playfair Display (elegant display
# serif, 400/700/900), Great Vibes (calligraphic script), Bebas Neue (condensed).
# Registry names in src/lib/render.ts: Relevate Display / Relevate Script /
# Relevate Condensed — the contract for font-match.ts and geometry work.
cp /home/team/shared/design-assets/fonts/PlayfairDisplay-Regular.ttf \
   /home/team/shared/design-assets/fonts/PlayfairDisplay-Bold.ttf \
   /home/team/shared/design-assets/fonts/PlayfairDisplay-Black.ttf \
   /home/team/shared/design-assets/fonts/GreatVibes-Regular.ttf \
   /home/team/shared/design-assets/fonts/BebasNeue-Regular.ttf \
   .vercel/output/functions/render.func/assets/
# Round 3 font expansion (Aug 29, task 3f084d2b): Sacramento (formal
# calligraphic script), Amatic SC (hand-painted display, 400/700),
# Pacifico (retro script). Registry: Relevate Calligraphy / Relevate
# Handwriting / Relevate Retro — consumed by render-design.ts (custom builder).
cp /home/team/shared/design-assets/fonts/Sacramento-Regular.ttf \
   /home/team/shared/design-assets/fonts/AmaticSC-Regular.ttf \
   /home/team/shared/design-assets/fonts/AmaticSC-Bold.ttf \
   /home/team/shared/design-assets/fonts/Pacifico-Regular.ttf \
   /home/team/shared/design-assets/fonts/Allura-Regular.ttf \
   /home/team/shared/design-assets/fonts/Caveat-Regular.ttf \
   /home/team/shared/design-assets/fonts/Oswald-Regular.ttf \
   /home/team/shared/design-assets/fonts/Oswald-Bold.ttf \
   .vercel/output/functions/render.func/assets/

cat > .vercel/output/functions/render.func/.vc-config.json <<'JSON'
{ "runtime": "nodejs22.x", "handler": "vercel-entry.mjs", "launcherType": "Nodejs", "supportsResponseStreaming": true, "maxDuration": 60 }
JSON
cat > .vercel/output/config.json <<'JSON'
{ "version": 3, "routes": [ { "handle": "filesystem" }, { "src": "/(.*)", "dest": "/render" } ] }
JSON

echo "done -> .vercel/output ready for: bunx vercel deploy --prebuilt"
