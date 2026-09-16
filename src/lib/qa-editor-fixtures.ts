import type { TemplateRegion } from "~/lib/prompts";

/**
 * QA fixtures for the inline-editor harness (/qa-editor).
 *
 * The base raster + region set are the real multi-object template that the
 * analyzer produced per-object regions for (see
 * /home/team/shared/render-samples/analyze-template-objects/). Bundling them as
 * a fixture makes the manipulation + additive flows testable against /api/render
 * with ZERO vision/AI cost and determinism (no gpt-4o in the loop).
 */

/** Public URL of the bundled fixture raster (copied to site/public/qa/). */
export const QA_MULTIOBJECT_SRC = "/qa/multi-object-template.png";

/** Native pixel dimensions of the fixture raster (1080 x 1350 = flyer ratio). */
export const QA_MULTIOBJECT_WIDTH = 1080;
export const QA_MULTIOBJECT_HEIGHT = 1350;

/** A convenience solid-color 1x1 PNG (data URL) usable as an image replacement. */
export const QA_SOLID_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/**
 * The per-object regions returned by the analyzer for the fixture template.
 * These are DETECTED regions (no `additive` flag) — the template-replica path
 * erases/backs them so original lettering never ghosts through.
 */
export const QA_MULTIOBJECT_REGIONS: TemplateRegion[] = [
  { id: "photo-1", label: "photo", kind: "image", x: 0, y: 0, w: 1, h: 0.5 },
  { id: "logo-1", label: "logo", kind: "image", x: 0.02, y: 0.02, w: 0.15, h: 0.15 },
  {
    id: "headline-1",
    label: "headline",
    kind: "text",
    x: 0.1,
    y: 0.52,
    w: 0.8,
    h: 0.1,
    textColor: "#1b3715",
    fontFamily: "sans-serif",
    fontWeight: "bold",
    italic: false,
    letterSpacingPx: 0,
    textTransform: "none",
    fontSizePx: 48,
    align: "center",
  },
  {
    id: "subheadline-1",
    label: "subheadline",
    kind: "text",
    x: 0.1,
    y: 0.62,
    w: 0.8,
    h: 0.05,
    textColor: "#1b3715",
    fontFamily: "serif",
    fontWeight: "normal",
    italic: false,
    letterSpacingPx: 0,
    textTransform: "none",
    fontSizePx: 24,
    align: "center",
  },
  {
    id: "body-1",
    label: "body",
    kind: "text",
    x: 0.1,
    y: 0.68,
    w: 0.8,
    h: 0.1,
    textColor: "#1b3715",
    fontFamily: "serif",
    fontWeight: "normal",
    italic: false,
    letterSpacingPx: 0,
    textTransform: "none",
    fontSizePx: 20,
    align: "center",
  },
  {
    id: "cta-1",
    label: "cta",
    kind: "text",
    x: 0.1,
    y: 0.8,
    w: 0.8,
    h: 0.05,
    textColor: "#a67c00",
    fontFamily: "sans-serif",
    fontWeight: "bold",
    italic: false,
    letterSpacingPx: 0,
    textTransform: "none",
    fontSizePx: 24,
    align: "left",
  },
  { id: "headshot-1", label: "headshot", kind: "image", x: 0.05, y: 0.85, w: 0.1, h: 0.1 },
  { id: "mascot-1", label: "mascot", kind: "image", x: 0.85, y: 0.85, w: 0.1, h: 0.1 },
];

/** Default text for the fixture's text regions (what /api/render composites). */
export const QA_MULTIOBJECT_TEXT: Record<string, string> = {
  "headline-1": "2847 Willow Creek Lane",
  "subheadline-1": "4 Bed  ·  3 Bath  ·  2,850 Sq Ft",
  "body-1": "Move-in ready with beautiful natural light throughout.",
  "cta-1": "Open House Sat 12–3  ·  (864) 555-0134",
};

/** Listing/agent photos offered by the editor picker (paste into an image box). */
export const QA_PHOTO_SOURCES: string[] = [
  QA_SOLID_PNG,
  QA_SOLID_PNG,
];
