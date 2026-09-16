import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/**
 * NativeInlineEditor — editable-after-render for the NATIVE branded templates
 * (flyer 1275×1650 / social 1080×1080). Spec: consultant's
 * native-template-editability-review.md §5 (task 73c8b21c); build task
 * 9b472149.
 *
 * The rendered native flyer/social is a flat PNG with only a Download button.
 * This component layers transparent, scaled hit-targets over the *editable*
 * R5 text slots (rects mirrored from getR5Slots() in branded-templates.ts —
 * pre-calibrated canvas-px rects per format; see SLOT_RECTS below). Clicking a
 * region opens a small inline editor bound to the mapped NativeDoc field; Save
 * commits the edit upward (onCommit, which also re-runs handleRender) to
 * refresh the raster.
 *
 * COORDINATE MAPPING (the spec's #1 risk): slot rects are in canvas px
 * (1275×1650 / 1080×1080) but the preview is CSS-scaled to the same
 * EDITOR_CANVAS_MAX_WIDTH-style cap used by TemplateInlineEditor. We track the
 * displayed width with ResizeObserver and scale every hit-target by
 * displayWidth / canvasWidth, anchored to a container whose aspect equals the
 * rendered canvas — so clicks land exactly on the visible text.
 *
 * Derived / read-only slots are EXCLUDED from the overlay: the badge
 * (JUST LISTED / OPEN HOUSE / FOR SALE → `ribbon`), the RELEVATE watermark,
 * and relevate.ai. Fact chips (keyFacts) edit the STRUCTURED beds/baths/sqft
 * fields so listingFacts + the chip stay consistent, not display-only strings.
 */

/** Same shared max preview width the inline editor and reference use. */
export const NATIVE_CANVAS_MAX_WIDTH = 500;

/** Which client field a slot binding maps to (the handleRender payload). */
export type NativeField =
  | "title" // details.address → address/priceAddress slot
  | "price" // details.price → priceBand/priceAddress slot
  | "beds" // details.bedrooms → keyFacts
  | "baths" // details.bathrooms → keyFacts
  | "sqft" // details.sqft → keyFacts
  | "body" // generatedContent → body slot (+ social hashtag row)
  | "agentName" // agentName → footer/agentBand
  | "agentPhone"; // agentPhone → footer/agentBand

/** Partial set of field edits committed back to the source form + render. */
export type NativeEditorValue = Partial<Record<NativeField, string>>;

interface SlotEditor {
  /** getR5Slots() slot id this editor targets. */
  slot: string;
  label: string;
  fields: { key: NativeField; label: string; multiline?: boolean }[];
}

/** Editable slot → field mapping per format (spec §5.3). */
const SLOT_EDITORS: Record<"flyer" | "social", SlotEditor[]> = {
  flyer: [
    {
      slot: "address",
      label: "Address",
      fields: [{ key: "title", label: "Address" }],
    },
    {
      slot: "priceBand",
      label: "Price",
      fields: [{ key: "price", label: "Price" }],
    },
    {
      slot: "keyFacts",
      label: "Key facts",
      fields: [
        { key: "beds", label: "Beds" },
        { key: "baths", label: "Baths" },
        { key: "sqft", label: "Sq Ft" },
      ],
    },
    {
      slot: "body",
      label: "Description",
      fields: [{ key: "body", label: "Description", multiline: true }],
    },
    {
      slot: "footer",
      label: "Agent",
      fields: [
        { key: "agentName", label: "Agent name" },
        { key: "agentPhone", label: "Phone" },
      ],
    },
  ],
  social: [
    {
      slot: "priceAddress",
      label: "Price & address",
      fields: [
        { key: "title", label: "Address" },
        { key: "price", label: "Price" },
      ],
    },
    {
      slot: "keyFacts",
      label: "Key facts",
      fields: [
        { key: "beds", label: "Beds" },
        { key: "baths", label: "Baths" },
        { key: "sqft", label: "Sq Ft" },
      ],
    },
    {
      slot: "body",
      label: "Description",
      fields: [{ key: "body", label: "Description", multiline: true }],
    },
    {
      slot: "agentBand",
      label: "Agent",
      fields: [
        { key: "agentName", label: "Agent name" },
        { key: "agentPhone", label: "Phone" },
      ],
    },
  ],
};

/** Canvas dimensions of each native output format (matches the renderer). */
const CANVAS_DIMS: Record<"flyer" | "social", { w: number; h: number }> = {
  flyer: { w: 1275, h: 1650 },
  social: { w: 1080, h: 1080 },
};

/**
 * R5 slot rects (canvas px) for the editable text regions — the same values
 * getR5Slots() returns from src/lib/branded-templates.ts (calibrated per format
 * and gate-tested). Copy kept here so the client bundle never pulls in
 * branded-templates.ts, which has server-only node:fs/path/url imports that
 * break the Vite browser build. If getR5Slots() ever changes, update this to
 * match.
 */
const SLOT_RECTS: Record<"flyer" | "social", Record<string, { x: number; y: number; w: number; h: number }>> = {
  flyer: {
    address: { x: 90, y: 486, w: 1095, h: 150 },
    priceBand: { x: 90, y: 336, w: 1095, h: 136 },
    keyFacts: { x: 90, y: 685, w: 1095, h: 94 },
    body: { x: 90, y: 787, w: 1095, h: 652 },
    footer: { x: 90, y: 1452, w: 1095, h: 160 },
  },
  social: {
    priceAddress: { x: 56, y: 288, w: 968, h: 406 },
    keyFacts: { x: 56, y: 600, w: 968, h: 96 },
    body: { x: 56, y: 710, w: 968, h: 178 },
    agentBand: { x: 56, y: 945, w: 968, h: 82 },
  },
};

export interface NativeInlineEditorProps {
  /** Data/blob URL of the rendered native PNG. */
  imageDataUrl?: string | null;
  /** @deprecated use imageDataUrl */
  imageUrl?: string | null;
  /** Render in flight (show placeholder, hide overlays). */
  loading?: boolean;
  /** Output format — selects both slot geometry and field mapping. */
  format: "flyer" | "social";
  title?: string;
  alt?: string;
  emptyLabel?: string;
  /** Extra content in the card footer (e.g. the download button). */
  footer?: ReactNode;
  /** Current field values to prefill the inline editors. */
  values: NativeEditorValue;
  /**
   * Commit edited field values upward. The parent is responsible for BOTH
   * keeping the source-form state in sync AND re-running handleRender with
   * those same values as fieldOverrides (so the raster refresh is not subject
   * to React's async setState timing). Passed the edited (non-empty) changes.
   */
  onCommit: (changes: NativeEditorValue) => void;
  className?: string;
}

export function NativeInlineEditor({
  imageDataUrl,
  imageUrl,
  loading = false,
  format,
  title = "Designed Output",
  alt = "Rendered design preview",
  emptyLabel = "Render a designed flyer to preview it here.",
  footer,
  values,
  onCommit,
  className,
}: NativeInlineEditorProps) {
  const src = imageDataUrl ?? imageUrl ?? null;
  const canvas = CANVAS_DIMS[format];
  const slots = SLOT_RECTS[format];

  // Displayed-width tracking (same pattern as TemplateInlineEditor).
  // NOTE: the holder div only exists once there is a raster (the empty/loading
  // states don't render it), so this effect MUST re-run when src arrives — a
  // mount-only [] empty deps left the hit-target scale stuck at 0 in the
  // standard generate→render flow (task e2055b1b). Guard on src and add it to
  // the deps so the observer attaches only after the image (and holder) exist.
  const holderRef = useRef<HTMLDivElement>(null);
  const [widthPx, setWidthPx] = useState(0);
  useEffect(() => {
    if (!src) return;
    const el = holderRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidthPx(el.clientWidth));
    ro.observe(el);
    setWidthPx(el.clientWidth);
    return () => ro.disconnect();
  }, [src]);

  const scale = widthPx > 0 ? widthPx / canvas.w : 0;
  const dispH = canvas.h * scale;
  const ready = scale > 0 && dispH > 0 && Boolean(src) && !loading;

  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const activeEditor = activeSlot
    ? SLOT_EDITORS[format].find((e) => e.slot === activeSlot)
    : null;

  const openEditor = (slot: string) => {
    const editor = SLOT_EDITORS[format].find((e) => e.slot === slot);
    if (!editor) return;
    const init: Record<string, string> = {};
    for (const f of editor.fields) init[f.key] = values[f.key] ?? "";
    setDraft(init);
    setActiveSlot(slot);
  };

  const closeEditor = () => {
    setActiveSlot(null);
    setDraft({});
  };

  const saveEditor = () => {
    if (!activeEditor) return;
    const changes: NativeEditorValue = {};
    for (const f of activeEditor.fields) {
      if (draft[f.key] !== (values[f.key] ?? "")) changes[f.key] = draft[f.key] ?? "";
    }
    closeEditor();
    // Parent commits the source-form state AND re-renders with these same
    // values as fieldOverrides, so the raster refresh reflects the edit
    // immediately (independent of React's async setState).
    if (Object.keys(changes).length > 0) onCommit(changes);
  };

  const rect = (slotId: string) => slots[slotId];

  return (
    <div
      className={cn(
        "rounded-xl border border-[#5c3d2e]/40 bg-[#0a1a0a]/70 p-5 shadow-sm",
        "shadow-[0_0_24px_rgba(92,61,46,0.12)] transition-all duration-300",
        "hover:border-[#8a5a3b]/50 hover:shadow-[0_0_32px_rgba(92,61,46,0.22)]",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-emerald-100">{title}</h3>
        {src && !loading && (
          <span className="badge-shimmer rounded-full bg-amber-900/40 px-2.5 py-0.5 text-[10px] font-medium text-amber-300/80">
            PNG · click text to edit
          </span>
        )}
      </div>

      <div className="relative overflow-hidden rounded-lg border border-amber-900/30 bg-[#050f05]/70">
        {loading ? (
          <div
            className="relative flex aspect-[4/5] w-full max-w-[500px] items-center justify-center"
            role="status"
            aria-label="Rendering designed output"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#12260f] via-[#0a1a0a] to-[#1a2e15]" />
            <div
              className="absolute inset-0 animate-pulse-soft opacity-60"
              style={{
                background:
                  "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 55%, transparent 70%)",
                backgroundSize: "250% 100%",
              }}
            />
            <div className="relative flex flex-col items-center gap-3 text-center">
              <div className="wood-button pointer-events-none h-10 w-10 rounded-full p-2.5 opacity-80">
                <svg className="h-full w-full animate-spin text-amber-100" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
                </svg>
              </div>
              <p className="text-xs font-medium text-emerald-200/70">Rendering designed flyer…</p>
            </div>
          </div>
        ) : src ? (
          <div className="p-3">
            <div
              ref={holderRef}
              className="relative mx-auto w-full select-none overflow-hidden rounded-md shadow-lg shadow-black/40 ring-1 ring-amber-900/20"
              style={{ aspectRatio: `${canvas.w} / ${canvas.h}`, maxWidth: NATIVE_CANVAS_MAX_WIDTH }}
            >
              <img
                src={src}
                alt={alt}
                draggable={false}
                className="absolute inset-0 h-full w-full object-fill"
                loading="lazy"
              />
              {ready && (
                <>
                  {SLOT_EDITORS[format].map((editor) => {
                    const r = rect(editor.slot);
                    if (!r) return null;
                    const isActive = activeSlot === editor.slot;
                    return (
                      <button
                        key={editor.slot}
                        type="button"
                        title={`Edit ${editor.label}`}
                        onClick={() => openEditor(editor.slot)}
                        className={cn(
                          "absolute box-border cursor-pointer rounded-sm border transition-colors",
                          isActive
                            ? "z-10 border-2 border-solid border-amber-400 bg-black/10"
                            : "border border-dashed border-transparent hover:border-amber-300/70 hover:bg-white/5",
                        )}
                        style={{
                          left: r.x * scale,
                          top: r.y * scale,
                          width: r.w * scale,
                          height: r.h * scale,
                        }}
                      >
                        {!isActive && (
                          <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/50 px-1 py-0.5 text-[9px] font-semibold text-amber-200 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100 focus:opacity-100">
                            ✎ {editor.label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            <p className="mt-1.5 text-center text-[10px] text-emerald-300/40">
              Click a highlighted region to edit its text in place, then re-render.
            </p>
          </div>
        ) : (
          <div className="flex aspect-[4/5] w-full max-w-[500px] items-center justify-center p-8 text-center">
            <div className="flex flex-col items-center gap-2 text-emerald-200/40">
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" />
                <circle cx="9" cy="9" r="2" stroke="currentColor" />
                <path d="m21 15-3.5-3.5L9 20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-xs">{emptyLabel}</p>
            </div>
          </div>
        )}
      </div>

      {/* Inline editor panel (appears below the image when a region is active). */}
      {activeEditor && !loading && (
        <div className="mt-3 animate-fade-in-up rounded-lg border border-amber-700/40 bg-[#0d1f0d]/80 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
              Edit {activeEditor.label}
            </span>
            <span className="text-[10px] text-emerald-300/40">saves &amp; re-renders</span>
          </div>
          <div className="space-y-2">
            {activeEditor.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-emerald-300/60">
                  {f.label}
                </span>
                {f.multiline ? (
                  <textarea
                    value={draft[f.key] ?? ""}
                    onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
                    rows={4}
                    className="w-full resize-y rounded-md border border-emerald-800/40 bg-[#071307] px-2.5 py-1.5 text-xs text-emerald-100 outline-none focus-ring-forest"
                  />
                ) : (
                  <input
                    value={draft[f.key] ?? ""}
                    onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full rounded-md border border-emerald-800/40 bg-[#071307] px-2.5 py-1.5 text-xs text-emerald-100 outline-none focus-ring-forest"
                  />
                )}
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={saveEditor}
              className="wood-button rounded-lg px-3.5 py-1.5 text-xs font-semibold text-emerald-100"
            >
              Save &amp; re-render
            </button>
            <button
              type="button"
              onClick={closeEditor}
              className="rounded-lg border border-emerald-800/40 px-3 py-1.5 text-xs text-emerald-300/70 hover:bg-emerald-900/20"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!activeEditor && footer && <div className="mt-3">{footer}</div>}
      {activeEditor && footer && (
        <div className="mt-2 opacity-60">{footer}</div>
      )}
    </div>
  );
}
