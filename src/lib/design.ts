/**
 * Relevate — from-scratch design-editor layer model (business plan rev 35).
 * =========================================================================
 * The owner's strategic pivot: users build flyers / social posts on a blank
 * white canvas by adding TEXT, IMAGE and SHAPE layers and positioning them.
 * This module defines the SHARED DesignDoc / DesignLayer types that both the
 * editor (fullstack engineer, task 7ef10cca) and the server-side renderer
 * (task eb4522e6, this file's consumer) build against.
 *
 * CONTRACT NOTES
 *  - Coordinates and sizes are in ABSOLUTE pixels within the doc's own
 *    `width`×`height` canvas. The document carries its output size, so a doc
 *    authored at 1275×1650 is a flyer and one at 1080×1080 is a social post —
 *    this is what "render to both surfaces, sized to the editor's chosen
 *    output" means. Layers use the same pixel space as the canvas.
 *  - Z-order is ARRAY ORDER: later layers render ON TOP of earlier ones.
 *  - All fields are optional where a sensible default exists (documented on
 *    each). Angles are degrees clockwise-positive in editor style; the
 *    renderer passes them straight to Satori's rotate transform.
 *  - `imageData` is a base64 data URL (the existing validImage contract).
 *
 * The register of bundled font faces (name → real font file) is the CONTRACT
 * shared with the renderer — see src/lib/font-match.ts and the fonts array in
 * src/lib/render.ts. Do not rename a family without coordinating.
 */
export type DesignFontFamily =
  | "sans"
  | "serif"
  | "mono"
  | "display"
  | "script"
  | "condensed"
  | "calligraphy"
  | "handwriting"
  | "retro"
  | "script-allura"
  | "script-hand"
  | "condensed-alt";
/**
 * Registered weights (round 2 expansion, task 3f084d2b):
 *  400 (all); 700 (sans/serif/mono/display + handwriting/Amatic SC);
 *  900 (display/Playfair). Single-weight faces: script (Great Vibes),
 *  condensed (Bebas Neue), calligraphy (Sacramento), retro (Pacifico) — all 400.
 */
export type DesignFontWeight = 400 | 700 | 900;
export type DesignAlign = "left" | "center" | "right";
export type DesignObjectFit = "cover" | "contain";
export interface DesignRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface DesignLayerBase {
  id: string;
  type: string;
  rect: DesignRect;
  /** Clockwise degrees about the layer's center. Omitted = 0. */
  rotation?: number;
  /** 0..1 opacity. Omitted = 1. */
  opacity?: number;
}
export interface DesignTextLayer extends DesignLayerBase {
  type: "text";
  text: string;
  fontFamily?: DesignFontFamily; // default "sans"
  fontWeight?: DesignFontWeight; // default 400
  fontSize: number; // px
  color: string; // hex
  align?: DesignAlign; // default "left"
  letterSpacing?: number; // px
  lineHeight?: number; // multiplier, default 1.0
  uppercase?: boolean; // content transform (editor-style), default false
}
export interface DesignImageLayer extends DesignLayerBase {
  type: "image";
  imageData: string; // data URL
  objectFit?: DesignObjectFit; // default "cover"
}
export interface DesignShapeLayer extends DesignLayerBase {
  type: "shape";
  shape?: "rect" | "ellipse"; // default "rect"
  fill?: string; // hex; transparent when omitted
  stroke?: string; // hex outline color; none when omitted
  strokeWidth?: number; // px, default 0
  radius?: number; // corner radius (rect), default 0
}
export type DesignLayer = DesignTextLayer | DesignImageLayer | DesignShapeLayer;

export interface DesignDoc {
  width: number; // output canvas width in px (e.g. 1275 flyer / 1080 social)
  height: number;
  /** Canvas background color. Default white. */
  background?: string;
  /** Z-order = array order (last on top). */
  layers: DesignLayer[];
}

/** Map an editor family to the Satori-registered face (see font-match.ts). */
export const DESIGN_FAMILY_TO_REGISTRY: Record<DesignFontFamily, string> = {
  sans: "Relevate Sans",
  serif: "Relevate Serif",
  mono: "Relevate Mono",
  display: "Relevate Display",
  script: "Relevate Script",
  condensed: "Relevate Condensed",
  calligraphy: "Relevate Calligraphy",
  handwriting: "Relevate Handwriting",
  retro: "Relevate Retro",
  "script-allura": "Relevate Allura",
  "script-hand": "Relevate Hand Script",
  "condensed-alt": "Relevate Condensed Alt",
};

/* -----------------------------------------------------------------------
 * Editor helper API (task 7ef10cca — fullstack editor).
 * These are ADDITIVE factory/preset helpers on top of the shared contract
 * above. The renderer (task eb4522e6) only imports the types + the family
 * map, so these never collide with it.
 * --------------------------------------------------------------------- */

/** Canonical output presets the editor offers. */
export const DESIGN_PRESETS = {
  flyer: { id: "flyer", name: "Flyer (8.5×11)", width: 1275, height: 1650, label: "Flyer" },
  social: { id: "social", name: "Social (1:1)", width: 1080, height: 1080, label: "Social" },
  socialPortrait: { id: "socialPortrait", name: "Social (4:5)", width: 1080, height: 1350, label: "Story" },
} as const;
export type DesignPresetId = keyof typeof DESIGN_PRESETS;
/**
 * Font catalog for the custom builder — single source of truth shared by the
 * renderer (renders the registry face) and the editor/picker (offers the
 * family + a browser CSS stack for faithful live preview). Round 2 expansion
 * (task 3f084d2b) adds three distinct writing styles: calligraphy
 * (Sacramento), handwriting (Amatic SC) and retro (Pacifico).
 */
export interface DesignFontEntry {
  id: DesignFontFamily;
  /** Human-friendly label shown in the picker. */
  label: string;
  /** Category bucket for grouping in the picker (Style, Scripts/Calligraphy, etc.). */
  group: "Sans & Serif" | "Script & Calligraphy" | "Display & Decorative";
  /** Browser CSS stack for faithful live preview in the editor (first face maps to the rendered face). */
  css: string;
  /** Registered weights available for this face (enum 400/700/900). */
  weights: DesignFontWeight[];
}
export const DESIGN_FONT_CATALOG: DesignFontEntry[] = [
  { id: "sans", label: "Sans", group: "Sans & Serif", css: "'Inter','Segoe UI',system-ui,sans-serif", weights: [400, 700] },
  { id: "serif", label: "Serif", group: "Sans & Serif", css: "'Georgia','Times New Roman',serif", weights: [400, 700] },
  { id: "mono", label: "Mono", group: "Sans & Serif", css: "'SFMono-Regular',Menlo,monospace", weights: [400, 700] },
  { id: "display", label: "Display", group: "Display & Decorative", css: "'Playfair Display',Georgia,'Times New Roman',serif", weights: [400, 700, 900] },
  { id: "script", label: "Script", group: "Script & Calligraphy", css: "'Great Vibes','Segoe Script','Brush Script MT',cursive", weights: [400] },
  { id: "condensed", label: "Condensed", group: "Display & Decorative", css: "'Bebas Neue','Arial Narrow',Arial,sans-serif", weights: [400] },
  { id: "calligraphy", label: "Calligraphy", group: "Script & Calligraphy", css: "'Sacramento','Brush Script MT',cursive", weights: [400] },
  { id: "handwriting", label: "Handwriting", group: "Script & Calligraphy", css: "'Amatic SC','Segoe Print',cursive", weights: [400, 700] },
  { id: "retro", label: "Retro", group: "Display & Decorative", css: "'Pacifico','Brush Script MT',cursive", weights: [400] },
  { id: "script-allura", label: "Allura", group: "Script & Calligraphy", css: "'Allura','Great Vibes','Brush Script MT',cursive", weights: [400] },
  { id: "script-hand", label: "Handwritten", group: "Script & Calligraphy", css: "'Caveat','Segoe Print','Bradley Hand',cursive", weights: [400] },
  { id: "condensed-alt", label: "Oswald", group: "Display & Decorative", css: "'Oswald','Arial Narrow',Arial,sans-serif", weights: [400, 700] },
];
/** Quick lookup by family id. */
export function fontEntryFor(f: DesignFontFamily): DesignFontEntry {
  return DESIGN_FONT_CATALOG.find((e) => e.id === f) ?? DESIGN_FONT_CATALOG[0]!;
}

let __seq = 0;
export function uid(prefix = "layer"): string {
  __seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${__seq.toString(36)}`;
}

/** Create a blank white document for a preset. */
export function createBlankDesign(preset: DesignPresetId, _name?: string): DesignDoc {
  const p = DESIGN_PRESETS[preset];
  return { width: p.width, height: p.height, background: "#ffffff", layers: [] };
}

/** Deep-clone a design (undo/redo snapshots). */
export function cloneDesign(doc: DesignDoc): DesignDoc {
  return JSON.parse(JSON.stringify(doc)) as DesignDoc;
}

export function makeTextLayer(over: Partial<DesignTextLayer> = {}): DesignTextLayer {
  const { rect = { x: 100, y: 100, w: 400, h: 80 }, ...rest } = over;
  return {
    id: uid("text"),
    type: "text",
    rect,
    text: "Double-click to edit",
    fontFamily: "sans",
    fontWeight: 400,
    fontSize: 48,
    color: "#111827",
    align: "left",
    letterSpacing: 0,
    lineHeight: 1.2,
    uppercase: false,
    ...rest,
  };
}

export function makeImageLayer(over: Partial<DesignImageLayer> = {}): DesignImageLayer {
  const { rect = { x: 100, y: 100, w: 400, h: 300 }, ...rest } = over;
  return {
    id: uid("img"),
    type: "image",
    rect,
    imageData: "",
    objectFit: "cover",
    ...rest,
  };
}

export function makeShapeLayer(over: Partial<DesignShapeLayer> = {}): DesignShapeLayer {
  const { rect = { x: 100, y: 100, w: 300, h: 200 }, ...rest } = over;
  return {
    id: uid("shape"),
    type: "shape",
    rect,
    shape: "rect",
    fill: "#e5e7eb",
    stroke: "#111827",
    strokeWidth: 0,
    radius: 0,
    ...rest,
  };
}

export const DESIGN_BACKGROUNDS = [
  "#ffffff",
  "#0a1a0a",
  "#111827",
  "#f3f4f6",
  "#fef3c7",
  "#dcfce7",
  "#dbeafe",
  "#fce7f3",
  "#000000",
] as const;

/** Default text color for a given background (rough luminance). */
export function defaultTextColorFor(bg: string): string {
  const hex = bg.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#111827";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 150 ? "#111827" : "#ffffff";
}
