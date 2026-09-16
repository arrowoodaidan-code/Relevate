import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { TemplateRegion } from "~/lib/prompts";
import {
  DesignedRenderButton,
  DesignedOutputCard,
  DesignedDownloadButton,
  DesignedErrorBanner,
} from "./designed-output";

/**
 * Canva-style inline WYSIWYG editor for the designed-graphics pipeline
 * (template-replica now, and reused for branded output later).
 *
 * The live raster (uploaded template, or a rendered output) is the canvas. Every
 * text region is a transparent overlay sitting exactly where the lettering lives
 * — click it and type in place. Every image region is a clickable box — click it
 * to swap in an upload, an AI image, or a listing/agent photo. A selected region
 * gets a move handle + 8-way resize handles so the user can reposition and
 * resize any box, and an ADDITIVE toolbar ("+ Add text" / "+ Add image") lets the
 * user drop NEW elements onto the canvas — also movable, resizable, editable.
 *
 * Layout math: TemplateRegion x/y/w/h are normalized 0–1 fractions of the source
 * raster. We track the displayed canvas width in px (ResizeObserver) and scale
 * every region and matched font size by displayWidth/sourceWidth, so overlays sit
 * precisely over the artwork at any responsive size. Any geometry change is
 * reported back in normalized coordinates, and the parent merges detected +
 * added regions into the /api/render payload so edits (and additions) land in the
 * server-composited PNG.
 */

const FONT_STACK: Record<NonNullable<TemplateRegion["fontFamily"]>, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  "sans-serif": "Arial, Helvetica, sans-serif",
  script: "'Brush Script MT', 'Segoe Script', cursive",
  display: "Impact, 'Arial Black', sans-serif",
  condensed: "'Arial Narrow', 'Helvetica Neue Condensed', sans-serif",
  mono: "'Courier New', monospace",
};

const FONT_WEIGHT: Record<NonNullable<TemplateRegion["fontWeight"]>, number> = {
  light: 300,
  normal: 400,
  bold: 700,
};

/** Minimum box size (normalized) for moving/resizing. */
const MIN_N = 0.02;
/** Added-region id prefix — parent routes geometry/text/image edits by it. */
export const ADDED_PREFIX = "add-";
/**
 * SINGLE SOURCE OF TRUTH for the on-screen width of the editing canvas AND the
 * pre-editor reference preview (task 61243828, owner escalation "still not
 * coming out right"). The reference image shown BEFORE the editor and the
 * editing window MUST resolve to the same displayed width so the owner can
 * verify the region boxes align with the original content. Both the canvas
 * below and the reference panel above are constrained by THIS constant via
 * inline style (inline style avoids Tailwind's static-class purge, so the
 * contract can't silently break or drift to a different literal). If these two
 * ever need a different size, change this one number.
 */
export const EDITOR_CANVAS_MAX_WIDTH = 500;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export interface TemplateInlineEditorProps {
  /** The live canvas raster (template or rendered output). */
  baseImage: string;
  dimensions: { width: number; height: number } | null;
  /** Detected regions (template-replica) — geometry edits call onRegionGeometryChange. */
  regions: TemplateRegion[];
  regionText: Record<string, string>;
  regionImages: Record<string, string>;
  regionPrompts: Record<string, string>;
  /** Listing/agent photos the user can paste into an image region. */
  photoSources: string[];
  renderingRegionId: string | null;
  onTextChange: (id: string, value: string) => void;
  /** value null removes the replacement (keep template image). */
  onImageChange: (id: string, value: string | null) => void;
  onPromptChange: (id: string, value: string) => void;
  onImageUpload: (id: string, file?: File) => void;
  onGenerateImage: (id: string) => void;
  /** Move/resize of an existing (detected) region, in normalized coords. */
  onRegionGeometryChange: (
    id: string,
    geom: { x: number; y: number; w: number; h: number },
  ) => void;
  /** Report the current set of ADDED elements (regions + text + images) upward. */
  onAdditionsChange: (
    regions: TemplateRegion[],
    text: Record<string, string>,
    images: Record<string, string>,
  ) => void;
  contentType: "open-house-flyer" | "social-media";
  isRendering: boolean;
  renderedImage: string | null;
  renderError: string | null;
  onDismissRenderError: () => void;
  onRender: () => void;
  isGenerating: boolean;
  isRefining: boolean;
  showEditedHint: boolean;
  /** Badge label for the mode the editor is operating in. */
  modeLabel?: string;
}

export function TemplateInlineEditor({
  baseImage,
  dimensions,
  regions,
  regionText,
  regionImages,
  regionPrompts,
  photoSources,
  renderingRegionId,
  onTextChange,
  onImageChange,
  onPromptChange,
  onImageUpload,
  onGenerateImage,
  onRegionGeometryChange,
  onAdditionsChange,
  contentType,
  isRendering,
  renderedImage,
  renderError,
  onDismissRenderError,
  onRender,
  isGenerating,
  isRefining,
  showEditedHint,
  modeLabel = "Template mode",
}: TemplateInlineEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(0);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [imageModalId, setImageModalId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ADDED elements owned by the editor; reported upward on every change so the
  // parent can merge them into the render payload.
  const [addedRegions, setAddedRegions] = useState<TemplateRegion[]>([]);
  const [addedText, setAddedText] = useState<Record<string, string>>({});
  const [addedImages, setAddedImages] = useState<Record<string, string>>({});
  const addSeq = useRef(0);

  // Clear additions when the base canvas changes (a new template / render).
  useEffect(() => {
    setAddedRegions([]);
    setAddedText({});
    setAddedImages({});
    setSelectedId(null);
    setEditingTextId(null);
    setImageModalId(null);
  }, [baseImage]);

  const reportAdditions = (
    regionsList: TemplateRegion[],
    text: Record<string, string>,
    images: Record<string, string>,
  ) => {
    onAdditionsChange(regionsList, text, images);
  };
  useEffect(() => {
    reportAdditions(addedRegions, addedText, addedImages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addedRegions, addedText, addedImages]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidthPx(el.clientWidth));
    ro.observe(el);
    setWidthPx(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Coordinate basis hardening (task 2e31e46d, owner #1: "make sure regions are
  // analyzed in the exact size the image is and everything lines up properly").
  // The overlays + selection chrome are positioned at `region.x * widthPx` /
  // `region.y * dispH`, and those MUST be fractions of the raster that is
  // ACTUALLY on screen. If the parent's `dimensions` prop ever diverges from the
  // live base image (stale saved width/height, a re-encoded re-open, an
  // up/downscaled copy), the overlay basis drifts and boxes stop lining up with
  // the content — the exact recurring bug the owner sees. So we derive the
  // source aspect from the real `<img>` element once it has loaded, and fall
  // back to the `dimensions` prop only until then. This keeps the displayed
  // canvas aspect + overlay scaling in lockstep with the true pixels, at every
  // displayed size, on far edges, during re-opens, and under any DPR.
  const [liveDims, setLiveDims] = useState<{ width: number; height: number } | null>(null);
  const baseImgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setLiveDims(null);
    const el = baseImgRef.current;
    if (!el) return;
    const sync = () => el.naturalWidth && el.naturalHeight && setLiveDims({ width: el.naturalWidth, height: el.naturalHeight });
    if (el.complete) sync();
    else el.addEventListener("load", sync);
    return () => el.removeEventListener("load", sync);
    // re-sync whenever the base raster swaps
  }, [baseImage]);

  const effDims = liveDims ?? dimensions;
  const srcW = effDims?.width && effDims.width > 0 ? effDims.width : 1000;
  const srcH = effDims?.height && effDims.height > 0 ? effDims.height : 1000;
  const scale = widthPx > 0 ? widthPx / srcW : 0;
  const dispH = (srcH / srcW) * widthPx;
  const ready = scale > 0 && dispH > 0;

  const imageRegions = regions.filter((r) => r.kind === "image");
  const modalRegion = imageModalId
    ? [...regions, ...addedRegions].find((r) => r.id === imageModalId)
    : null;
  const selectedN = selectedId
    ? [...regions, ...addedRegions].find((r) => r.id === selectedId)
    : null;

  const readNorm = (e: { clientX: number; clientY: number }) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const isAdded = (id: string) => id.startsWith(ADDED_PREFIX);
  const updateGeom = (
    id: string,
    geom: { x: number; y: number; w: number; h: number },
  ) => {
    if (isAdded(id)) {
      setAddedRegions((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...geom } : r)),
      );
    } else {
      onRegionGeometryChange(id, geom);
    }
  };

  const startDrag = (
    e: ReactPointerEvent,
    id: string,
    kind: "move",
    getStart: () => { x: number; y: number; w: number; h: number },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const start = readNorm(e);
    const base = getStart();
    const onMove = (ev: PointerEvent) => {
      const cur = readNorm(ev);
      if (kind === "move") {
        const nx = clamp(base.x + (cur.x - start.x), 0, 1 - base.w);
        const ny = clamp(base.y + (cur.y - start.y), 0, 1 - base.h);
        updateGeom(id, { x: nx, y: ny, w: base.w, h: base.h });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const startResize = (
    e: ReactPointerEvent,
    id: string,
    dir: string,
    getStart: () => { x: number; y: number; w: number; h: number },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const start = readNorm(e);
    const base = getStart();
    const onMove = (ev: PointerEvent) => {
      const cur = readNorm(ev);
      const dx = cur.x - start.x;
      const dy = cur.y - start.y;
      let { x, y, w, h } = base;
      if (dir.includes("e")) w += dx;
      if (dir.includes("s")) h += dy;
      if (dir.includes("w")) {
        x += dx;
        w -= dx;
      }
      if (dir.includes("n")) {
        y += dy;
        h -= dy;
      }
      // Clamp against edges and min size.
      if (x < 0) {
        w += x;
        x = 0;
      }
      if (x + w > 1) w = 1 - x;
      if (y < 0) {
        h += y;
        y = 0;
      }
      if (y + h > 1) h = 1 - y;
      if (w < MIN_N) {
        if (dir.includes("w")) x -= MIN_N - w;
        x = clamp(x, 0, 1 - MIN_N);
        w = MIN_N;
      }
      if (h < MIN_N) {
        if (dir.includes("n")) y -= MIN_N - h;
        y = clamp(y, 0, 1 - MIN_N);
        h = MIN_N;
      }
      updateGeom(id, { x, y, w, h });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const addTextElement = () => {
    addSeq.current += 1;
    const id = `${ADDED_PREFIX}text-${addSeq.current}`;
    const region: TemplateRegion = {
      id,
      label: "other" as TemplateRegion["label"],
      kind: "text",
      x: 0.14,
      y: 0.2,
      w: 0.5,
      h: 0.12,
      textColor: "#ffffff",
      fontFamily: "sans-serif",
      fontWeight: "normal",
      align: "center",
      fontSizePx: Math.round(srcH * 0.05),
      // Added-element contract (e121b3fd): editor-ADDED regions are composited
      // pure draw-on-top (no erase/backing/inpaint) so the underlying template
      // stays byte-unchanged. Detected (non-added) regions omit this flag.
      additive: true,
    };
    setAddedRegions((prev) => [...prev, region]);
    setAddedText((prev) => ({ ...prev, [id]: "Your new text" }));
    setSelectedId(id);
    setEditingTextId(id);
  };

  const addImageElement = () => {
    addSeq.current += 1;
    const id = `${ADDED_PREFIX}img-${addSeq.current}`;
    const region: TemplateRegion = {
      id,
      label: "photo",
      kind: "image",
      x: 0.18,
      y: 0.15,
      w: 0.3,
      h: 0.25,
      // Added-element contract (e121b3fd): draw-on-top, NO opaque backing rect
      // behind the image — the underlying template pixels stay byte-unchanged.
      additive: true,
    };
    setAddedRegions((prev) => [...prev, region]);
    setSelectedId(id);
    setImageModalId(id);
  };

  const handleTextChange = (id: string, value: string) => {
    if (isAdded(id)) setAddedText((prev) => ({ ...prev, [id]: value }));
    else onTextChange(id, value);
  };

  const handleImageChange = (id: string, value: string | null) => {
    if (isAdded(id)) {
      setAddedImages((prev) => {
        if (value == null) {
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: value };
      });
    } else {
      onImageChange(id, value);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-amber-100">
            Edit your design in place
          </h3>
          <p className="mt-1 text-xs text-emerald-300/50">
            Click any text box and type right where it sits. Click an image box
            to replace that photo. Select a box to move or resize it, or add new
            text and image elements below. Everything else stays exactly as
            shown.
          </p>
        </div>
        <span className="rounded-full border border-amber-700/30 px-2 py-0.5 text-[10px] font-medium text-amber-300/80">
          {modeLabel}
        </span>
      </div>

      {/* REFERENCE — the original template BEFORE any edits, rendered at EXACTLY
          the same on-screen size/aspect as the editing canvas below (owner #1
          ask, tasks e850b526/61243828). Both are constrained by
          EDITOR_CANVAS_MAX_WIDTH and the SAME srcW:srcH aspect, so "the image
          shown before the editor" and "the editing window" are pixel-identical
          in size and the region boxes can be verified to align with the
          original content. This stays the pristine original; edits only appear
          on the canvas below. No crop and no stretch: object-fill against an
          aspect box whose ratio equals the intrinsic raster (baseImage IS the
          tracked raster) renders it undistorted. */}
      <div className="mx-auto w-full" style={{ maxWidth: EDITOR_CANVAS_MAX_WIDTH }}>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-emerald-300/50">
            Original template (reference)
          </span>
          <span className="text-[10px] text-emerald-300/40">same size as the canvas below</span>
        </div>
        <div
          className="relative w-full select-none overflow-hidden rounded-lg border border-emerald-800/30 bg-black/20"
          style={{ aspectRatio: `${srcW} / ${srcH}` }}
        >
          <img
            src={baseImage}
            alt="Original template reference"
            draggable={false}
            className="absolute inset-0 h-full w-full object-fill"
          />
        </div>
        <p className="mt-1 text-[10px] leading-tight text-emerald-300/40">
          Original template lettering has been erased from this base (background
          and photos kept intact), so you can add your own text boxes freely. The
          canvas below is the same text-cleared image at the same size, with
          replaceable photo boxes drawn on top so you can confirm every box
          matches the content behind it.
        </p>
      </div>

      {/* Live canvas — the base raster with inline overlays + selection chrome.
          Width is bound to the SAME EDITOR_CANVAS_MAX_WIDTH constant as the
          reference panel above (and the reference/rendered output card), so the
          pre-editor reference, the editing window, and the composed output are
          pixel-identical in width — the owner's #1 alignment requirement
          (tasks e850b526, 61243828). If the canvas filled the whole column
          (w-full, unbounded) while the reference card capped at 500px, the same
          design appeared at two sizes and "didn't line up". A single shared
          constraint keeps them identical at any viewport and can never drift. */}
      <div
        ref={canvasRef}
        className="relative mx-auto w-full select-none overflow-hidden rounded-lg border border-emerald-800/40 bg-black/30 shadow-inner"
        style={{ aspectRatio: `${srcW} / ${srcH}`, maxWidth: EDITOR_CANVAS_MAX_WIDTH }}
        onClick={() => {
          if (editingTextId) setEditingTextId(null);
        }}
      >
        <img
          ref={baseImgRef}
          src={baseImage}
          alt="Design canvas"
          draggable={false}
          className="absolute inset-0 h-full w-full object-fill"
        />
        {ready && (
          <>
            {regions.map((region) =>
              region.kind === "text"
                ? renderTextOverlay(region)
                : renderImageOverlay(region),
            )}
            {addedRegions.map((region) =>
              region.kind === "text"
                ? renderTextOverlay(region)
                : renderImageOverlay(region),
            )}
            {selectedN && renderSelectionChrome(selectedN)}
          </>
        )}
      </div>

      {/* Additive toolbar. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-emerald-300/50">
          Add
        </span>
        <button
          type="button"
          onClick={addTextElement}
          className="rounded-lg border border-emerald-600/40 bg-emerald-900/20 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-800/40"
        >
          + Text
        </button>
        <button
          type="button"
          onClick={addImageElement}
          className="rounded-lg border border-emerald-600/40 bg-emerald-900/20 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-800/40"
        >
          + Image
        </button>
        {addedRegions.length > 0 && (
          <span className="text-[11px] text-emerald-300/40">
            {addedRegions.length} added element
            {addedRegions.length === 1 ? "" : "s"} — drag to move, drag the
            corner handles to resize.
          </span>
        )}
      </div>

      {/* Image-region picker modal (upload / AI / listing photos). */}
      {modalRegion && renderImageModal(modalRegion)}

      {/* Render + download (composes the final PNG server-side). */}
      <div className="border-t border-emerald-800/20 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <DesignedRenderButton
            loading={isRendering}
            hasRendered={Boolean(renderedImage)}
            onClick={onRender}
            disabled={isGenerating || isRefining}
            label={
              contentType === "open-house-flyer"
                ? "Render designed flyer"
                : "Render social post"
            }
            reRenderLabel="Re-render"
            loadingLabel={
              contentType === "open-house-flyer"
                ? "Rendering flyer…"
                : "Rendering post…"
            }
          />
          <span className="text-xs text-emerald-300/40">
            {contentType === "open-house-flyer"
              ? "Compose your edited and added elements onto the design as a print-ready graphic."
              : "Compose your edited and added elements onto the design as a share-ready graphic."}
          </span>
        </div>
        {showEditedHint && (
          <p className="mt-2 text-xs text-amber-300/70">
            You've edited the text — click "Re-render" to update the design.
          </p>
        )}
        <DesignedErrorBanner
          message={renderError}
          onDismiss={onDismissRenderError}
          className="mt-3"
        />
        <div className="mt-3">
          <DesignedOutputCard
            imageUrl={renderedImage}
            loading={isRendering}
            title={
              contentType === "open-house-flyer"
                ? "Composited Flyer"
                : "Composited Social Post"
            }
            alt={
              contentType === "open-house-flyer"
                ? "Composited open house flyer"
                : "Composited social post"
            }
            emptyLabel="Render to compose your edits onto the design and preview it here."
            footer={
              renderedImage ? (
                <DesignedDownloadButton
                  imageUrl={renderedImage}
                  filename={
                    contentType === "open-house-flyer"
                      ? "relevate-flyer.png"
                      : "relevate-social.png"
                  }
                >
                  Download PNG
                </DesignedDownloadButton>
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );

  function renderTextOverlay(region: TemplateRegion) {
    const x = region.x * widthPx;
    const y = region.y * dispH;
    const w = Math.max(region.w * widthPx, 24);
    const h = Math.max(region.h * dispH, 16);
    const fontSize = Math.max(
      6,
      Math.round(
        (region.fontSizePx ?? Math.max(8, region.h * srcH * 0.6)) * scale,
      ),
    );
    const family = FONT_STACK[region.fontFamily ?? "sans-serif"];
    const weight = FONT_WEIGHT[region.fontWeight ?? "normal"];
    const active = editingTextId === region.id;
    const selected = selectedId === region.id;
    const textTf =
      region.textTransform === "uppercase" ||
      region.textTransform === "small-caps"
        ? "uppercase"
        : "none";
    const textStyle: CSSProperties = {
      fontFamily: family,
      fontWeight: weight,
      fontSize,
      lineHeight: 1.1,
      color: region.textColor || "#ffffff",
      textAlign: region.align || "left",
      textTransform: textTf,
      letterSpacing:
        typeof region.letterSpacingPx === "number"
          ? `${Math.round(region.letterSpacingPx * scale)}px`
          : undefined,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
    };

    return (
      <div
        key={region.id}
        className={`absolute box-border overflow-hidden ${
          selected
            ? "cursor-text border-2 border-solid border-amber-400 bg-black/10"
            : "cursor-move border border-dashed border-transparent transition-colors hover:border-emerald-300/70 hover:bg-white/5"
        }`}
        style={{ left: x, top: y, width: w, height: h }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedId(region.id);
          setEditingTextId(region.id);
        }}
      >
        {active ? (
          <textarea
            autoFocus
            value={
              isAdded(region.id)
                ? (addedText[region.id] ?? "")
                : (regionText[region.id] ?? "")
            }
            onChange={(e) => handleTextChange(region.id, e.target.value)}
            onBlur={() => setEditingTextId(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditingTextId(null);
            }}
            className="h-full w-full resize-none overflow-hidden bg-transparent p-0 outline-none"
            style={{ ...textStyle, height: "100%", width: "100%" }}
          />
        ) : (
          // WYSIWYG text placement (Design Engineer, task 61243828 + parallel
          // audit 6f5f83a2): the compositor renders region text VERTICALLY
          // CENTERED and box-fitted (render-templates.ts justifyContent:center),
          // but this editor previously rendered it TOP-aligned at the detected
          // size — so a tall region box (padded bound > lettering, the common
          // case) showed words pinned to the top in the editor, then they
          // "dropped" to center on Re-render. Mirror the compositor's centering
          // here so the editor's settled view matches the composited output;
          // only the transient focused textarea stays top-aligned (standard
          // editing UX). Horizontal alignment still honors region.align.
          <div
            className="flex h-full w-full flex-col items-stretch justify-center overflow-hidden"
            style={textStyle}
          >
            <div style={{ width: "100%", textAlign: region.align || "left" }}>
              {isAdded(region.id)
                ? (addedText[region.id] ?? "")
                : (regionText[region.id] ?? "")}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderImageOverlay(region: TemplateRegion) {
    const x = region.x * widthPx;
    const y = region.y * dispH;
    const w = Math.max(region.w * widthPx, 24);
    const h = Math.max(region.h * dispH, 16);
    const selected = selectedId === region.id;
    const replaced = Boolean(
      isAdded(region.id) ? addedImages[region.id] : regionImages[region.id],
    );
    const src = isAdded(region.id)
      ? addedImages[region.id]
      : regionImages[region.id];
    return (
      <button
        key={region.id}
        type="button"
        className={`absolute box-border overflow-hidden text-center ${
          selected
            ? "cursor-pointer border-2 border-solid border-amber-400"
            : replaced
              ? "cursor-pointer border border-dashed border-transparent transition-colors hover:border-emerald-300/80"
              : "cursor-pointer border border-dashed border-emerald-200/50 bg-black/30 transition-colors hover:border-emerald-300/90 hover:bg-black/40"
        }`}
        style={{ left: x, top: y, width: w, height: h }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedId(region.id);
          setImageModalId(region.id);
        }}
        title={`Replace ${region.label} image`}
      >
        {replaced ? (
          <img
            src={src}
            alt={`${region.label} image`}
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium leading-tight text-white/90">
            <span aria-hidden>📷</span>
            <span>{region.label}</span>
          </span>
        )}
      </button>
    );
  }

  /** Move + 8-way resize handles for the currently selected region. */
  function renderSelectionChrome(region: TemplateRegion) {
    const x = region.x * widthPx;
    const y = region.y * dispH;
    const w = Math.max(region.w * widthPx, 24);
    const h = Math.max(region.h * dispH, 16);
    const getStart = () => ({
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h,
    });
    const handleC =
      "pointer-events-auto absolute block h-2 w-2 rounded-sm border border-amber-200/80 bg-amber-500";

    return (
      <div
        className="pointer-events-none absolute z-10"
        style={{ left: x, top: y, width: w, height: h }}
      >
        {/* Move handle (grab bar above the box). */}
        <div
          onPointerDown={(e) => startDrag(e, region.id, "move", getStart)}
          className="pointer-events-auto absolute -bottom-7 left-1/2 flex -translate-x-1/2 cursor-grab items-center gap-1 rounded border border-emerald-500/60 bg-[#0a1a0a] px-2 py-1 text-[10px] font-semibold text-emerald-200 shadow"
          title="Drag to move"
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 8h16M4 16h16"
            />
          </svg>
          Move
        </div>

        {/* Corner + edge resize handles. */}
        {(
          [
            [
              "nw",
              "top-0 left-0 -translate-x-1/2 -translate-y-1/2",
              "nw-resize",
            ],
            [
              "n",
              "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
              "n-resize",
            ],
            [
              "ne",
              "top-0 right-0 translate-x-1/2 -translate-y-1/2",
              "ne-resize",
            ],
            [
              "e",
              "top-1/2 right-0 translate-x-1/2 -translate-y-1/2",
              "e-resize",
            ],
            [
              "se",
              "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
              "se-resize",
            ],
            [
              "s",
              "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
              "s-resize",
            ],
            [
              "sw",
              "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
              "sw-resize",
            ],
            [
              "w",
              "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2",
              "w-resize",
            ],
          ] as const
        ).map(([dir, pos, cursor]) => (
          <div
            key={dir}
            onPointerDown={(e) => startResize(e, region.id, dir, getStart)}
            className={`${handleC} ${pos} ${cursor}`}
          />
        ))}
      </div>
    );
  }

  function renderImageModal(region: TemplateRegion) {
    const busy = renderingRegionId === region.id;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        onClick={() => setImageModalId(null)}
        role="dialog"
        aria-modal="true"
        aria-label={`Replace ${region.label} image`}
      >
        <div
          className="w-full max-w-md rounded-xl border border-emerald-700/40 bg-[#081308] p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-emerald-100">
              {isAdded(region.id) ? "Set" : "Replace"} {region.label} image
            </h4>
            <button
              type="button"
              onClick={() => setImageModalId(null)}
              className="rounded border border-emerald-700/40 px-2 py-0.5 text-xs text-emerald-300/80 hover:bg-emerald-900/30"
            >
              Close
            </button>
          </div>

          {/* Image source picker. */}
          <div className="mt-3">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-900/20 px-3 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-800/40">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              Upload an image
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  onImageUpload(region.id, e.target.files?.[0]);
                  setImageModalId(null);
                }}
              />
            </label>
          </div>

          {/* AI-generate from a prompt. */}
          <div className="mt-3 flex gap-2">
            <input
              value={regionPrompts[region.id] ?? ""}
              onChange={(e) => onPromptChange(region.id, e.target.value)}
              placeholder="Prompt an image, e.g. modern white kitchen"
              className="min-w-0 flex-1 rounded-lg border border-emerald-800/40 bg-[#071307] px-3 py-2 text-xs text-emerald-100 placeholder-emerald-600/50 outline-none focus-ring-forest"
            />
            <button
              type="button"
              disabled={!regionPrompts[region.id]?.trim() || busy}
              onClick={() => onGenerateImage(region.id)}
              className="rounded-lg wood-button px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate"}
            </button>
          </div>

          {/* Paste from listing / agent photos. */}
          {photoSources.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-300/50">
                Or use one of your photos
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {photoSources.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      handleImageChange(region.id, s);
                      setImageModalId(null);
                    }}
                    className="overflow-hidden rounded-md border border-emerald-700/40 hover:border-emerald-400/80"
                    title="Use this photo"
                  >
                    <img
                      src={s}
                      alt="Pick this photo"
                      className="h-12 w-12 object-cover"
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {imageRegions.length > 1 && (
            <p className="mt-3 text-[11px] text-emerald-300/40">
              Each image box is replaced independently.
            </p>
          )}
        </div>
      </div>
    );
  }
}
