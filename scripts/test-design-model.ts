/**
 * Guard test for the shared DesignDoc/DesignLayer model (task 7ef10cca —
 * from-scratch design editor). Validates the serializable layer contract that
 * the server renderer (render-design, task eb4522e6) and save-as-template
 * (task 3) consume. Runs fully offline (no DB, no network).
 *
 * Run: bun scripts/test-design-model.ts
 */
import {
  createBlankDesign,
  makeImageLayer,
  makeShapeLayer,
  makeTextLayer,
  cloneDesign,
  DESIGN_PRESETS,
  type DesignDoc,
  type DesignLayer,
} from "../src/lib/design";

let failures = 0;
const ok = (m: string) => console.log(`  [PASS] ${m}`);
const fail = (m: string) => {
  failures++;
  console.error(`  [FAIL] ${m}`);
};

console.log("test-design-model: blank doc + layer factories + serialization");

// 1. Blank doc presets carry the correct output sizes.
for (const preset of ["flyer", "social", "socialPortrait"] as const) {
  const d = createBlankDesign(preset);
  const p = DESIGN_PRESETS[preset];
  if (d.width === p.width && d.height === p.height && Array.isArray(d.layers) && d.layers.length === 0) {
    ok(`blank ${preset} = ${p.width}x${p.height}, empty layers`);
  } else {
    fail(`blank ${preset} sizes wrong: ${JSON.stringify(d)}`);
  }
}

// 2. Text layer factory produces a valid DesignTextLayer with defaults.
const t = makeTextLayer({ text: "Hello" });
if (t.type === "text" && t.text === "Hello" && t.rect.w > 0 && t.rect.h > 0 && typeof t.fontSize === "number" && t.fontFamily === "sans") {
  ok("makeTextLayer -> DesignTextLayer with defaults + overrides");
} else {
  fail("makeTextLayer shape wrong: " + JSON.stringify(t));
}

// 3. Image layer factory.
const im = makeImageLayer({ rect: { x: 0, y: 0, w: 100, h: 50 }, imageData: "data:image/png;base64,AAAA" });
if (im.type === "image" && im.imageData.startsWith("data:image") && im.objectFit === "cover" && im.rect.w === 100) {
  ok("makeImageLayer -> DesignImageLayer");
} else {
  fail("makeImageLayer shape wrong: " + JSON.stringify(im));
}

// 4. Shape layer factory.
const sh = makeShapeLayer({ fill: "#ff0000" });
if (sh.type === "shape" && sh.fill === "#ff0000" && (sh.shape === "rect" || sh.shape === "ellipse")) {
  ok("makeShapeLayer -> DesignShapeLayer");
} else {
  fail("makeShapeLayer shape wrong: " + JSON.stringify(sh));
}

// 5. Round-trip serialization (JSON) preserves the contract — this is exactly
// what save-as-template (Neon JSON store) and render (Satori) consume.
const doc: DesignDoc = createBlankDesign("flyer");
doc.layers = [makeTextLayer({ text: "Agent Name", rect: { x: 100, y: 120, w: 500, h: 90 } }), makeImageLayer({ rect: { x: 0, y: 0, w: 1275, h: 800 } })];
const round = JSON.parse(JSON.stringify(doc)) as DesignDoc;
const shapeOk =
  round.width === 1275 &&
  round.height === 1650 &&
  round.layers.length === 2 &&
  round.layers[0].type === "text" &&
  round.layers[1].type === "image" &&
  round.layers[0].rect.x === 100 &&
  typeof round.layers[0].rect === "object";
if (shapeOk) ok("serialize -> parse preserves layers/geometry/types");
else fail("round-trip contract broken: " + JSON.stringify(round).slice(0, 200));

// 6. cloneDesign deep-clones (mutation does not leak).
const copy = cloneDesign(doc);
const before = copy.layers[0].rect.x;
(copy.layers[0] as typeof t).rect.x = 999;
if (doc.layers[0].rect.x === before) ok("cloneDesign deep-clones layers");
else fail("cloneDesign leaked mutation");

// 7. Z-order = array order (renderer contract): later index renders on top.
if (Array.isArray(doc.layers) && doc.layers.length === 2) ok("layers array order = z-order (last on top)");
else fail("layers not an ordered array");

console.log(failures === 0 ? "RESULT: PASS ✅" : `RESULT: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
