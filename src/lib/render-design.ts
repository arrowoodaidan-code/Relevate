/**
 * Relevate — DesignDoc layer renderer (business plan rev 35, task eb4522e6).
 * =========================================================================
 * Renders a from-scratch DesignDoc (absolute-px layers on a canvas) to a PNG
 * via the existing Satori + @resvg/resvg-js pipeline and the bundled Relevate
 * font set. This is the owner's strategic pivot: the editor builds OUR OWN
 * native layers and we render those directly — no uploaded-raster detection,
 * no erasure, no region replay.
 *
 * DESIGN CHOICES
 *  - Surface comes from the doc itself: a doc with width/height 1275×1650 is a
 *    flyer, 1080×1080 is social. This is "render to both surfaces, sized to
 *    the editor's chosen output."
 *  - Text never silently clips: each text layer is fitted via fitBlockToBox
 *    (the R4 exact-measure engine reused from branded-templates) so a
 *    user-chosen fontSize is used when it fits, otherwise it is shrunk to fit
 *    the box; when even the min size cannot fit, a trailing "…" is appended
 *    and truncated is reported.
 *  - Images respect object-fit cover/contain (no distortion) via
 *    background-size; shapes render fill/stroke/radius/ellipse.
 *  - Z-order = array order (later layers on top). Rotation applied via Satori
 *    transform (about the layer center).
 *
 * This module only imports from src/lib/design and the shared fit engine — it
 * leaves render.ts / render-templates.ts untouched (Design Engineer A owns the
 * native/template-replica path).
 */
import satori, { init as satoriInit } from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DesignDoc, DesignLayer, DesignFontWeight } from "./design";
import { DESIGN_FAMILY_TO_REGISTRY } from "./design";
import { fitBlockToBox } from "./branded-templates";

const BT_DIR = dirname(fileURLToPath(import.meta.url));

/** Family → weight → candidate font file paths (mirror branded-templates). */
const FONT_FILE: Record<string, Record<number, string[]>> = {
  "Relevate Sans": {
    400: [join(BT_DIR, "assets", "DejaVuSans.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    700: [join(BT_DIR, "assets", "DejaVuSans-Bold.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
  },
  "Relevate Serif": {
    400: [join(BT_DIR, "assets", "DejaVuSerif.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
    700: [join(BT_DIR, "assets", "DejaVuSerif-Bold.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"],
  },
  "Relevate Mono": {
    400: [join(BT_DIR, "assets", "DejaVuSansMono.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
    700: [join(BT_DIR, "assets", "DejaVuSansMono-Bold.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"],
  },
  "Relevate Display": {
    400: [join(BT_DIR, "assets", "PlayfairDisplay-Regular.ttf"), "/home/team/shared/design-assets/fonts/PlayfairDisplay-Regular.ttf"],
    700: [join(BT_DIR, "assets", "PlayfairDisplay-Bold.ttf"), "/home/team/shared/design-assets/fonts/PlayfairDisplay-Bold.ttf"],
    900: [join(BT_DIR, "assets", "PlayfairDisplay-Black.ttf"), "/home/team/shared/design-assets/fonts/PlayfairDisplay-Black.ttf"],
  },
  "Relevate Script": {
    400: [join(BT_DIR, "assets", "GreatVibes-Regular.ttf"), "/home/team/shared/design-assets/fonts/GreatVibes-Regular.ttf"],
  },
  "Relevate Condensed": {
    400: [join(BT_DIR, "assets", "BebasNeue-Regular.ttf"), "/home/team/shared/design-assets/fonts/BebasNeue-Regular.ttf"],
  },
  // Round 2 expansion (task 3f084d2b): three distinct writing styles /
  // calligraphies that the custom builder can offer.
  "Relevate Calligraphy": {
    400: [join(BT_DIR, "assets", "Sacramento-Regular.ttf"), "/home/team/shared/design-assets/fonts/Sacramento-Regular.ttf"],
  },
  "Relevate Handwriting": {
    400: [join(BT_DIR, "assets", "AmaticSC-Regular.ttf"), "/home/team/shared/design-assets/fonts/AmaticSC-Regular.ttf"],
    700: [join(BT_DIR, "assets", "AmaticSC-Bold.ttf"), "/home/team/shared/design-assets/fonts/AmaticSC-Bold.ttf"],
  },
  "Relevate Retro": {
    400: [join(BT_DIR, "assets", "Pacifico-Regular.ttf"), "/home/team/shared/design-assets/fonts/Pacifico-Regular.ttf"],
  },
  "Relevate Allura": {
    400: [join(BT_DIR, "assets", "Allura-Regular.ttf"), "/home/team/shared/design-assets/fonts/Allura-Regular.ttf"],
  },
  "Relevate Hand Script": {
    400: [join(BT_DIR, "assets", "Caveat-Regular.ttf"), "/home/team/shared/design-assets/fonts/Caveat-Regular.ttf"],
  },
  "Relevate Condensed Alt": {
    400: [join(BT_DIR, "assets", "Oswald-Regular.ttf"), "/home/team/shared/design-assets/fonts/Oswald-Regular.ttf"],
    700: [join(BT_DIR, "assets", "Oswald-Bold.ttf"), "/home/team/shared/design-assets/fonts/Oswald-Bold.ttf"],
  },
};
const FONT_LOAD_ORDER: Array<{ family: string; weight: number; path: string[] }> = [];
for (const [family, weights] of Object.entries(FONT_FILE))
  for (const [weight, path] of Object.entries(weights))
    FONT_LOAD_ORDER.push({ family, weight: Number(weight), path });

async function resolveFile(candidates: readonly string[]): Promise<Buffer> {
  let lastErr: unknown;
  for (const c of candidates) {
    try { return await readFile(c); } catch (err) { lastErr = err; }
  }
  throw new Error(`none of the font paths resolved (${candidates.join(", ")}): ${String(lastErr)}`);
}

/**
 * Ensure Satori's yoga wasm is initialized. Under a plain `bun run <script>`
 * satori's auto-init resolves a relative dist path that doesn't exist, so we
 * must point it at node_modules/satori/yoga.wasm explicitly. The bundled Vercel
 * build self-initializes; the try/catch makes that case a no-op.
 */
let satoriReady: Promise<void> | undefined;
function ensureSatoriReady(): Promise<void> {
  satoriReady ??= (async () => {
    const candidates = [
      fileURLToPath(new URL("../../node_modules/satori/yoga.wasm", import.meta.url)),
      "/home/team/shared/site/node_modules/satori/yoga.wasm",
    ];
    let wasm: Buffer | undefined;
    for (const c of candidates) {
      try { wasm = await readFile(c); break; } catch { /* try next */ }
    }
    if (!wasm) return; // Vercel bundle: satori auto-initializes.
    try {
      await satoriInit(() => wasm);
    } catch {
      // Vercel bundle path / already initialized.
    }
  })();
  return satoriReady;
}

let designFontsPromise: Promise<Array<{ name: string; data: ArrayBuffer; weight: number; style: "normal" }>> | undefined;
function loadDesignFonts() {
  designFontsPromise ??= Promise.all(
    FONT_LOAD_ORDER.map(async (f) => ({
      name: f.family,
      data: (await resolveFile(f.path)).buffer as ArrayBuffer,
      weight: f.weight,
      style: "normal" as const,
    })),
  );
  return designFontsPromise;
}

/** Resolve a family's registered weight to the nearest bundled face (400/700/900). */
function normalizedWeight(family: string, weight: DesignFontWeight | undefined): number {
  const available = FONT_FILE[family] ?? FONT_FILE["Relevate Sans"]!;
  const w = weight ?? 400;
  if (available[w]) return w;
  // Nearest registered weight (e.g. Script/Condensed only ship 400 → 700 falls back to 400).
  const keys = Object.keys(available).map(Number).sort((a, b) => a - b);
  return keys.reduce((best, k) => (Math.abs(k - w) < Math.abs(best - w) ? k : best), keys[0]);
}

/** Fit a text layer so it never silently clips: fitBlockToBox within the box. */
export function fitTextLayer(layer: Extract<DesignLayer, { type: "text" }>): {
  fontSize: number;
  lines: number;
  truncated: boolean;
} {
  const family = DESIGN_FAMILY_TO_REGISTRY[layer.fontFamily ?? "sans"];
  const weight = normalizedWeight(family, layer.fontWeight);
  const minSize = Math.max(8, Math.min(24, layer.fontSize * 0.5));
  const lineHeight = layer.lineHeight ?? 1.0;
  const ls = layer.letterSpacing ?? 0;
  return fitBlockToBox(layer.text, {
    width: Math.max(1, layer.rect.w),
    height: Math.max(1, layer.rect.h),
    fontFamily: family,
    weight,
    ls,
    minSize,
    lineHeight,
    maxSize: layer.fontSize,
  });
}

function truncateForDisplay(text: string, fitted: { fontSize: number; lines: number; truncated: boolean }): string {
  if (!fitted.truncated) return text;
  // Keep first N chars so it clearly ends with an ellipsis (best-effort; the
  // caller / editor shows the full unchanged text — only render truncates).
  const cap = Math.max(1, Math.floor((fitted.fontSize * fitted.lines * 1.6) / (fitted.fontSize || 1)));
  return text.length > cap ? `${text.slice(0, cap)}…` : `${text}…`;
}

function layerDiv(layer: DesignLayer): ReactNode {
  const base = { left: layer.rect.x, top: layer.rect.y, width: layer.rect.w, height: layer.rect.h };
  const transform = layer.rotation ? { transform: `rotate(${layer.rotation}deg)` } : {};
  const opacity = layer.opacity !== undefined && layer.opacity < 1 ? { opacity: layer.opacity } : {};
  if (layer.type === "text") {
    const layer2 = layer as Extract<DesignLayer, { type: "text" }>;
    const fitted = fitTextLayer(layer2);
    const family = DESIGN_FAMILY_TO_REGISTRY[layer2.fontFamily ?? "sans"];
    const weight = normalizedWeight(family, layer2.fontWeight);
    const display = truncateForDisplay(layer2.text, fitted);
    const upper = layer2.uppercase ? display.toUpperCase() : display;
    return h(
      "div",
      {
        key: layer2.id,
        style: {
          position: "absolute",
          ...base,
          ...transform,
          ...opacity,
          color: layer2.color,
          fontFamily: family,
          fontSize: fitted.fontSize,
          fontWeight: weight,
          ...(layer2.letterSpacing !== undefined && layer2.letterSpacing !== 0
            ? { letterSpacing: `${layer2.letterSpacing}px` }
            : {}),
          lineHeight: layer2.lineHeight ?? 1.0,
          textAlign: layer2.align ?? "left",
          whiteSpace: "pre-wrap",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
        },
      },
      upper,
    );
  }
  if (layer.type === "image") {
    const layer2 = layer as Extract<DesignLayer, { type: "image" }>;
    const fit = layer2.objectFit ?? "cover";
    // Render as an <img> with objectFit, NOT a background-image div. Satori's
    // background-size:cover does not scale to fill the box at full-res
    // (1275×1650): it composites only the upper portion. <img>+objectFit fills
    // the whole box at all resolutions (verified by probe test).
    return h("img", {
      key: layer2.id,
      src: layer2.imageData,
      style: {
        position: "absolute",
        ...base,
        ...transform,
        ...opacity,
        objectFit: fit,
      },
    });
  }
  // shape
  const layer2 = layer as Extract<DesignLayer, { type: "shape" }>;
  const isEllipse = (layer2.shape ?? "rect") === "ellipse";
  return h("div", {
    key: layer2.id,
    style: {
      position: "absolute",
      ...base,
      ...transform,
      ...opacity,
      backgroundColor: layer2.fill ?? "transparent",
      ...(layer2.stroke && layer2.strokeWidth ? { border: `${layer2.strokeWidth}px solid ${layer2.stroke}` } : {}),
      borderRadius: isEllipse ? "50%" : (layer2.radius ?? 0),
    },
  });
}

export interface RenderedDesignDoc {
  dataUrl: string;
  width: number;
  height: number;
}

/** Render a DesignDoc to a PNG data URL at its own canvas size. */
export async function renderDesignDoc(doc: DesignDoc): Promise<RenderedDesignDoc> {
  const width = Math.round(doc.width);
  const height = Math.round(doc.height);
  await ensureSatoriReady();
  const fonts = await loadDesignFonts();
  const root = h(
    "div",
    {
      style: {
        width, height,
        backgroundColor: doc.background ?? "#ffffff",
        position: "relative",
        overflow: "hidden",
        display: "flex",
      },
    },
    doc.layers.map((l) => layerDiv(l)),
  );
  const svg = await satori(root, { width, height, fonts: fonts as Parameters<typeof satori>[1]["fonts"] });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
  return { dataUrl: `data:image/png;base64,${Buffer.from(png).toString("base64")}`, width, height };
}
