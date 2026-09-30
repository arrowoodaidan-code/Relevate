/**
 * WYSIWYG text-fit gate (task c25031b9 — consultant P2 in
 * /home/team/shared/design-editor/consultant-pivot-review.md).
 *
 * THE BUG CLASS THIS GUARDS: the DesignDoc renderer shrink-fits every text
 * layer (fitTextLayer → fitBlockToBox, opentype ×1.04) and ends overflowing
 * text in "…" when even the minimum size cannot fit, while the editor canvas
 * is plain DOM in browser fonts. A user could see fine text in the editor and
 * a "Some…" PNG (or a smaller size) after export. The fix keeps the renderer
 * authoritative and surfaces its verdict in the editor via POST /api/design-fit.
 *
 * This gate asserts, fully offline (no server, no network):
 *  1. analyzeDesignTextFit IS the renderer's own fit engine (per-layer parity
 *     with fitTextLayer — same fonts, same measure, same floor), including
 *     uppercase/letterSpacing/lineHeight layers.
 *  2. Fit outcomes behave: fits → no shrink/truncation; oversized → shrunk;
 *     hopeless → truncated at the documented minSize floor.
 *  3. Non-text layers are ignored; ids echo in doc order; degenerate layers
 *     (fontSize 0) do not throw.
 *  4. stripDocForFit strips images (the payload must stay tiny) and the pure
 *     UI mapping (severity + messages) reads correctly.
 *  5. WIRING: /api/design-fit is mounted in BOTH serve.ts and vercel-entry.ts
 *     with analyzeDesignTextFit imported, and the editor POSTs to it;
 *     design-fit.ts stays client-safe (no node/satori/resvg imports).
 *
 *  6. task c2a8c6ab — a TRUNCATED layer keeps the text that actually fits: the
 *     painted string is the fit engine's own kept lines (+ terminal ellipsis),
 *     never a "lines * 1.6" character-collapse ("C…", "Charming…").
 *
 * Run: bun scripts/test-design-fit-wysiwyg.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  makeImageLayer,
  makeShapeLayer,
  makeTextLayer,
  type DesignDoc,
} from "../src/lib/design";
import { analyzeDesignTextFit, designExportText, fitTextLayer } from "../src/lib/render-design";
import {
  designFitSeverity,
  fitWarningMessage,
  fitWarningsForDoc,
  stripDocForFit,
  type DesignTextFitInfo,
} from "../src/lib/design-fit";

let failures = 0;
let passes = 0;
const ok = (m: string) => { passes++; console.log(`  [PASS] ${m}`); };
const fail = (m: string) => { failures++; console.error(`  [FAIL] ${m}`); };
function assert(cond: boolean, m: string) { cond ? ok(m) : fail(m); }
const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // repo root (this file lives in scripts/)

/** The documented minSize floor of fitTextLayer (must stay in sync). */
const expectedMinSize = (fontSize: number) => Math.max(8, Math.min(24, fontSize * 0.5));

console.log("test-design-fit-wysiwyg: renderer-truth fit analysis for the editor");

// ---------------------------------------------------------------------------
// Fixture doc: one layer per behavior branch (all "sans" → bundled DejaVu,
// present in src/lib/assets and the system fallback, so the gate is offline).
// ---------------------------------------------------------------------------
const LONG = "Charming three bedroom craftsman home in the historic district";
const doc: DesignDoc = {
  width: 1275,
  height: 1650,
  background: "#ffffff",
  layers: [
    makeTextLayer({ id: "fits", text: "Open House", rect: { x: 100, y: 100, w: 520, h: 90 }, fontSize: 48 }),
    makeTextLayer({
      id: "shrunk",
      text: "Beautiful four bedroom home with modern kitchen",
      rect: { x: 100, y: 300, w: 300, h: 120 },
      fontSize: 60,
    }),
    makeTextLayer({ id: "truncated", text: LONG, rect: { x: 100, y: 500, w: 110, h: 28 }, fontSize: 48, lineHeight: 1 }),
    makeTextLayer({
      id: "styled",
      text: "Price Reduced",
      rect: { x: 100, y: 600, w: 500, h: 60 },
      fontSize: 36,
      uppercase: true,
      letterSpacing: 2,
      lineHeight: 1.2,
      fontWeight: 700,
    }),
    makeImageLayer({ id: "img", rect: { x: 700, y: 100, w: 400, h: 300 }, imageData: "data:image/png;base64,AAAA" }),
    makeShapeLayer({ id: "shape", rect: { x: 700, y: 500, w: 200, h: 100 } }),
  ],
};

// 1. Non-text layers are ignored; ids echo in doc (text-layer) order.
const infos = analyzeDesignTextFit(doc);
const byId = new Map(infos.map((i) => [i.id, i]));
assert(infos.length === 4, `analysis covers exactly the 4 text layers (got ${infos.length})`);
assert(
  JSON.stringify(infos.map((i) => i.id)) === JSON.stringify(["fits", "shrunk", "truncated", "styled"]),
  "ids echo in doc order: " + infos.map((i) => i.id).join(","),
);

// 2. Behavior branches.
const fits = byId.get("fits")!;
assert(!!fits && fits.truncated === false, "short text in a roomy box is not truncated");
assert(fits.requestedFontSize === 48, "requested fontSize echoes the layer");
// The contract engine's binary search converges to maxSize from below and
// floors to 0.5px steps, so a layer that FITS at its chosen size may report up
// to 0.5px under it (e.g. 47.5 vs 48 — invisible on canvas, severity "ok").
assert(
  fits.fittedFontSize >= fits.requestedFontSize - 0.5,
  `roomy box keeps the chosen size within engine granularity (got ${fits.fittedFontSize})`,
);

const shrunk = byId.get("shrunk")!;
assert(!!shrunk && shrunk.truncated === false, "mid-oversize text is not truncated (minSize still fits)");
assert(shrunk.fittedFontSize < shrunk.requestedFontSize, `oversize text is shrunk (${shrunk.requestedFontSize} -> ${shrunk.fittedFontSize})`);

const trunc = byId.get("truncated")!;
assert(!!trunc && trunc.truncated === true, "hopeless text reports truncated=true");
assert(
  trunc.fittedFontSize === expectedMinSize(48),
  `truncated layer sits exactly at the minSize floor ${expectedMinSize(48)} (got ${trunc.fittedFontSize})`,
);
assert(trunc.fittedFontSize < trunc.requestedFontSize, "truncated layer also shrunk below the request");

// 3. PARITY: the analysis is the renderer's own engine — same verdict per layer.
let parity = true;
for (const layer of doc.layers) {
  if (layer.type !== "text") continue;
  const fitted = fitTextLayer(layer);
  const info = byId.get(layer.id)!;
  if (
    !info ||
    info.fittedFontSize !== fitted.fontSize ||
    info.lines !== fitted.lines ||
    info.truncated !== fitted.truncated
  ) {
    parity = false;
    fail(`parity broken for ${layer.id}: analyze=${JSON.stringify(info)} fitTextLayer=${JSON.stringify(fitted)}`);
  }
}
if (parity) ok("analyzeDesignTextFit === fitTextLayer for every text layer (incl. uppercase/letterSpacing/weight)");

// 4. Degenerate layer does not throw and still reports.
const degenerate: DesignDoc = {
  width: 400,
  height: 400,
  layers: [makeTextLayer({ id: "deg", text: "x", rect: { x: 0, y: 0, w: 50, h: 10 }, fontSize: 0 })],
};
let degInfo: DesignTextFitInfo[] | undefined;
try {
  degInfo = analyzeDesignTextFit(degenerate);
} catch (e) {
  fail(`degenerate layer threw: ${String(e)}`);
}
if (degInfo) {
  assert(degInfo.length === 1 && degInfo[0]!.id === "deg", "degenerate layer reported, not thrown");
}

// 5. stripDocForFit: tiny payload, no images/shapes leak into the POST body.
const stripped = stripDocForFit(doc);
assert(stripped.layers.length === 4, `payload keeps only text layers (got ${stripped.layers.length})`);
assert(stripped.width === 1275 && stripped.height === 1650, "payload preserves canvas size");
const payloadJson = JSON.stringify({ doc: stripped });
assert(!payloadJson.includes("imageData") && payloadJson.length < 2000, `payload carries no imageData (len ${payloadJson.length})`);
assert(!payloadJson.includes("AAAA"), "payload carries no image bytes");

// 6. Pure UI mapping: severity + messages.
assert(designFitSeverity(fits) === "ok", "severity ok for a fitting layer");
assert(designFitSeverity(shrunk) === "shrunk", "severity shrunk for a fitted-smaller layer");
assert(designFitSeverity(trunc) === "truncated", "severity truncated for a clipped layer");
const truncMsg = fitWarningMessage(doc.layers[2] as Parameters<typeof fitWarningMessage>[0], trunc);
assert(truncMsg.includes("CUT OFF") && truncMsg.includes("…"), "truncation warning says CUT OFF with ellipsis");
assert(truncMsg.includes("Charming three bed…"), "truncation warning carries a recognizable layer label");
const shrunkMsg = fitWarningMessage(doc.layers[1] as Parameters<typeof fitWarningMessage>[0], shrunk);
assert(
  shrunkMsg.includes(`${Math.round(shrunk.fittedFontSize)}px`) && shrunkMsg.includes(`${Math.round(shrunk.requestedFontSize)}px`),
  "shrink warning carries both sizes",
);
assert(fitWarningMessage(doc.layers[0] as Parameters<typeof fitWarningMessage>[0], fits) === "", "fitting layer produces no warning");
// Sub-pixel drops are invisible — the fit engine's binary search lands on 0.5px
// steps, so 47.5-vs-48 must NOT raise a badge.
assert(
  designFitSeverity({ id: "x", requestedFontSize: 48, fittedFontSize: 47.5, lines: 2, truncated: false, exportText: "" }) === "ok",
  "sub-pixel shrink (47.5 vs 48) stays ok — no badge noise",
);

const fitRecord: Record<string, DesignTextFitInfo> = Object.fromEntries(infos.map((i) => [i.id, i]));
const warnings = fitWarningsForDoc(doc.layers, fitRecord);
assert(warnings.length === 2, `warnings list exactly the 2 affected layers (got ${warnings.length})`);
assert(
  JSON.stringify(warnings.map((w) => w.id)) === JSON.stringify(["shrunk", "truncated"]),
  "warnings follow doc layer order",
);
assert(fitWarningsForDoc(doc.layers, {}).length === 0, "no analysis yet -> no warnings (no false alarms)");

// 7. WIRING: the endpoint exists in BOTH server entries and the editor calls it.
const serve = readFileSync(join(ROOT, "serve.ts"), "utf8");
const vercel = readFileSync(join(ROOT, "vercel-entry.ts"), "utf8");
const editorSrc = readFileSync(join(ROOT, "src/components/DesignCanvasEditor.tsx"), "utf8");
for (const [name, src] of [["serve.ts", serve], ["vercel-entry.ts", vercel]] as const) {
  assert(src.includes('"/api/design-fit"') && src.includes("POST"), `${name} mounts POST /api/design-fit`);
  assert(src.includes("analyzeDesignTextFit"), `${name} imports and calls analyzeDesignTextFit (renderer-truth engine)`);
  assert(src.includes("Authentication required"), `${name} /api/design-fit requires auth like every render path`);
}
assert(editorSrc.includes('"/api/design-fit"'), "editor POSTs to /api/design-fit");
assert(editorSrc.includes("stripDocForFit") && editorSrc.includes("fitWarningsForDoc"), "editor uses the shared client-safe fit module");
// Client-safety: the module the browser bundles must not drag the render
// pipeline in. Comments mention those names on purpose — strip comments
// before scanning so the gate tests CODE, not prose.
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const fitLibCode = stripComments(readFileSync(join(ROOT, "src/lib/design-fit.ts"), "utf8"));
for (const banned of ["node:", "satori", "resvg", "readFileSync"]) {
  assert(!fitLibCode.includes(banned), `design-fit.ts stays client-safe (no "${banned}" in code)`);
}

// 8. exportText — the canvas shows the export's EXACT string (task c25031b9 round 2).
const shrunkLayer = doc.layers[1] as Parameters<typeof fitWarningMessage>[0];
assert(shrunk.exportText === shrunkLayer.text, "shrunk layer paints the FULL text, just smaller");
const truncLayer = doc.layers[2] as Parameters<typeof fitWarningMessage>[0];
assert(
  trunc.exportText.endsWith("…") && trunc.exportText.length < truncLayer.text.length,
  `truncated layer paints an ellipsized cut: ${JSON.stringify(trunc.exportText)}`,
);
assert(
  trunc.exportText === designExportText(truncLayer, fitTextLayer(truncLayer)),
  "exportText === the renderer's own painted string (parity)",
);
const styledInfo = byId.get("styled")!;
const styledLayer = doc.layers[3] as Parameters<typeof fitWarningMessage>[0];
assert(
  styledLayer.uppercase === true && styledInfo.exportText === styledLayer.text.toUpperCase(),
  `uppercase applied in exportText (${JSON.stringify(styledInfo.exportText)})`,
);
assert(editorSrc.includes("exportText"), "canvas renders the export's string at the export's size");

// 9. task c2a8c6ab — a TRUNCATED layer keeps the text that actually FITS.
// The pre-fix cap `floor(lines * 1.6)` (its fontSize factor cancelled out)
// painted ~1 character per 1.6 lines: a 5-line box painted "Charming…", a
// 1-line box painted "C…". The fix paints the fit engine's OWN kept lines,
// last one ellipsized within the box. These checks fail BY NAME if the
// collapse ever returns.
const oldCap = (lines: number) => Math.max(1, Math.floor(lines * 1.6)); // pre-fix budget, same semantics
const COLLAPSE = (id: string, lines: number, painted: number) =>
  `TRUNCATION COLLAPSE (task c2a8c6ab) on ${id}: ${lines} fitted line(s) painted as only ${painted} characters — the "lines * 1.6" cap is back`;

// 9a. Multi-line truncated caption: roomy width, shallow height — several
//     wrapped lines fit and the engine keeps exactly those.
const CAPTION9 =
  "Charming three bedroom craftsman with a wraparound porch, rebuilt kitchen, " +
  "sunny breakfast nook, and a fenced backyard garden that glows on summer " +
  "evenings. Two-car garage, new roof, walk to the Saturday market and the " +
  "blue-ribbon elementary school. Open house Saturday 1 to 4.";
const multiDoc: DesignDoc = {
  width: 1275,
  height: 1650,
  background: "#ffffff",
  layers: [
    makeTextLayer({ id: "caption9", text: CAPTION9, rect: { x: 90, y: 120, w: 420, h: 150 }, fontSize: 44, lineHeight: 1.3 }),
    makeTextLayer({ id: "upper9", text: CAPTION9, rect: { x: 90, y: 380, w: 420, h: 150 }, fontSize: 44, lineHeight: 1.3, uppercase: true }),
  ],
};
const multiById = new Map(analyzeDesignTextFit(multiDoc).map((i) => [i.id, i]));
const cap9 = multiById.get("caption9")!;
assert(!!cap9 && cap9.truncated && cap9.lines >= 3, `caption box truncates across MULTIPLE fitted lines (got lines=${cap9?.lines})`);
const fitted9 = fitTextLayer(multiDoc.layers[0] as Parameters<typeof fitTextLayer>[0]);
const kept9 = fitted9.keptLines ?? [];
assert(
  fitted9.truncated && kept9.length === cap9.lines && kept9.length >= 3,
  `fitBlockToBox surfaces its own kept wrap for the truncated layer (${kept9.length} of ${cap9.lines} lines)`,
);
assert(
  cap9.exportText.length >= Math.ceil(0.8 * kept9.join("\n").length),
  `painted string keeps a substantial share of what fits (${cap9.exportText.length} of ${kept9.join("\n").length} chars)`,
);
assert(
  cap9.exportText.length > oldCap(cap9.lines) + 1,
  COLLAPSE(cap9.id, cap9.lines, cap9.exportText.length),
);
assert(
  cap9.exportText.split("\n").length === cap9.lines,
  `painted string carries exactly the ${cap9.lines} fitted lines`,
);
assert(
  kept9.length > 1 && cap9.exportText.startsWith(kept9[0]!),
  "painted string starts with the engine's own first fitted line",
);
assert(
  cap9.exportText.indexOf("…") === cap9.exportText.length - 1,
  "the ellipsis appears only at the end (it signals more text existed)",
);
const upper9 = multiById.get("upper9")!;
assert(
  !!upper9 && upper9.exportText === cap9.exportText.toUpperCase(),
  `uppercase composes over the joined truncated lines (${JSON.stringify(upper9?.exportText.slice(0, 24))}…)`,
);
assert(
  upper9.exportText === designExportText(multiDoc.layers[1] as Parameters<typeof designExportText>[0], fitTextLayer(multiDoc.layers[1] as Parameters<typeof fitTextLayer>[0])),
  "uppercase truncated layer: analyzeDesignTextFit === designExportText (WYSIWYG parity holds)",
);

// 9b. One-line box (the existing truncated fixture): the old code painted
//     exactly "C…" — 2 characters for a full wrapped line that fits.
assert(
  trunc.exportText.length > oldCap(trunc.lines) + 1,
  COLLAPSE(trunc.id, trunc.lines, trunc.exportText.length),
);
assert(
  trunc.exportText === fitTextLayer(truncLayer).keptLines?.join("\n"),
  `1-line truncated paint === the engine's kept line (+ ellipsis): ${JSON.stringify(trunc.exportText)}`,
);

// 9c. Defensive fallback: a truncated verdict WITHOUT a kept wrap (fit engine
//     could not produce one — degenerate geometry) paints the bare ellipsis,
//     never a pretended fragment of text.
const degLayer = makeTextLayer({ id: "deg9", text: "Anything", rect: { x: 0, y: 0, w: 10, h: 10 }, fontSize: 12 });
assert(
  designExportText(degLayer, { fontSize: 0, lines: 0, truncated: true }) === "…",
  "truncated verdict without keptLines paints the bare ellipsis (no pretended fragment)",
);

console.log(`\n${failures === 0 ? "ALL PASS" : "FAILURES"}: ${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
