/**
 * Relevate — WYSIWYG text-fit contract for the from-scratch design editor
 * (task c25031b9, consultant P2 in design-editor/consultant-pivot-review.md).
 * =========================================================================
 * THE GAP: the DesignDoc renderer (render-design.ts) shrink-fits every text
 * layer with the real bundled fonts (fitTextLayer → fitBlockToBox, opentype
 * measure) and, when even the minimum size cannot fit the box, truncates with
 * a trailing "…". The editor canvas is plain DOM in the browser's fonts: a
 * layer can look fine (or clip wordlessly) on screen while the exported PNG
 * shows something different — text silently elided, or rendered smaller than
 * shown.
 *
 * THE FIX (decision recorded on the task): the renderer keeps its behavior —
 * a fixed print/social surface must never overflow its box, so the renderer
 * stays the single source of truth — and the EDITOR surfaces that truth: a
 * small server endpoint (/api/design-fit, both serve.ts and vercel-entry.ts)
 * runs the renderer's own fitTextLayer per text layer, and the editor shows a
 * warning badge + message per affected layer ("reduce the font size / widen
 * the box"). No fit logic is duplicated client-side: this module is
 * CLIENT-SAFE on purpose (no node:fs / satori / resvg imports — the browser
 * bundle must never pull the render pipeline) and carries only the shared
 * result type, the tiny payload helper, and pure UI mapping.
 */

import type { DesignDoc, DesignLayer, DesignTextLayer } from "./design";

/** Per-text-layer result of the renderer's own fit engine. */
export interface DesignTextFitInfo {
  /** Layer id (echoed so the client can join by id). */
  id: string;
  /** The fontSize the user chose in the editor. */
  requestedFontSize: number;
  /** The fontSize the renderer will actually paint (≤ requested). */
  fittedFontSize: number;
  /** Wrapped line count at the fitted size. */
  lines: number;
  /** True when even the fit floor could not hold the copy — the export ends in "…". */
  truncated: boolean;
}

export type DesignFitSeverity = "ok" | "shrunk" | "truncated";

/**
 * Classify a fit result: truncation dominates; otherwise a size drop is
 * "shrunk". The fit engine's binary search lands on 0.5px steps, so a sub-pixel
 * drop (e.g. 47.5 vs a chosen 48) is invisible on the canvas — tolerate 0.5px
 * before calling it "shrunk" to keep the badges noise-free.
 */
export function designFitSeverity(info: DesignTextFitInfo): DesignFitSeverity {
  if (info.truncated) return "truncated";
  if (info.fittedFontSize < info.requestedFontSize - 0.5) return "shrunk";
  return "ok";
}

/** Short label for a layer in warning copy (mirrors the editor's layer label). */
function layerLabel(layer: DesignTextLayer): string {
  const t = (layer.text ?? "").replace(/\s+/g, " ").trim();
  return t ? (t.length > 18 ? `${t.slice(0, 18)}…` : t) : "Text";
}

/**
 * Human warning copy for one text layer. Empty string when the export will
 * match what the editor shows (severity "ok"). Advisory, never a verdict.
 */
export function fitWarningMessage(layer: DesignTextLayer, info: DesignTextFitInfo): string {
  const sev = designFitSeverity(info);
  const label = layerLabel(layer);
  if (sev === "truncated") {
    return `“${label}” will be CUT OFF (…) in the exported image — even at ${Math.round(info.fittedFontSize)}px this text cannot fit its box. Shorten the text or enlarge the box.`;
  }
  if (sev === "shrunk") {
    return `“${label}” will render at ${Math.round(info.fittedFontSize)}px, not the ${Math.round(info.requestedFontSize)}px shown, so it fits its box.`;
  }
  return "";
}

/**
 * Client payload builder: the analysis only needs TEXT layers, so strip image
 * layers (base64 data URLs can be megabytes) before POSTing. The result is a
 * valid DesignDoc-shaped object (width/height/layers preserved) so the server
 * can reuse the render-design route's validation.
 */
export function stripDocForFit(doc: DesignDoc): DesignDoc {
  return {
    width: doc.width,
    height: doc.height,
    background: doc.background,
    layers: doc.layers.filter((l): l is DesignTextLayer => l.type === "text"),
  };
}

/** Collect per-layer warnings for the editor UI (server results joined by id). */
export function fitWarningsForDoc(layers: DesignLayer[], fitById: Record<string, DesignTextFitInfo>): Array<{ id: string; message: string }> {
  const out: Array<{ id: string; message: string }> = [];
  for (const l of layers) {
    if (l.type !== "text") continue;
    const info = fitById[l.id];
    if (!info) continue;
    const message = fitWarningMessage(l as DesignTextLayer, info);
    if (message) out.push({ id: l.id, message });
  }
  return out;
}
