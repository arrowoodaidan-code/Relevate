import { useEffect, useRef, useState } from "react";
import { ComplianceChecklistPanel } from "~/components/ComplianceChecklistPanel";
import { formatForDimensions } from "~/lib/advertising-rules";
import {
  DESIGN_BACKGROUNDS,
  DESIGN_FONT_CATALOG,
  fontEntryFor,
  makeImageLayer,
  makeShapeLayer,
  makeTextLayer,
  type DesignDoc,
  type DesignFontFamily,
  type DesignLayer,
  type DesignRect,
  type DesignTextLayer,
} from "~/lib/design";

/**
 * From-scratch Canva-style design editor (strategic pivot — blank white canvas,
 * no auto-detection, no raster erasure).
 *
 * Self-contained + memory-light: pure DOM absolute positioning + pointer
 * events. Produces a DesignDoc in the SHARED contract (see ~/lib/design.ts,
 * jointly owned with the server renderer task eb4522e6) and reports it upward
 * via onChange. Z-order = array order; geometry is absolute design px; rotation
 * is degrees clockwise about center.
 *
 * Props:
 *   doc      — the working DesignDoc (controlled).
 *   onChange — (next) => void on any committed change.
 */
interface Props {
  doc: DesignDoc;
  onChange: (next: DesignDoc) => void;
  className?: string;
}

const CANVAS_MAX_WIDTH = 560;
const HANDLES = [
  { id: "nw", cx: 0, cy: 0, cur: "nwse-resize" },
  { id: "ne", cx: 1, cy: 0, cur: "nesw-resize" },
  { id: "se", cx: 1, cy: 1, cur: "nwse-resize" },
  { id: "sw", cx: 0, cy: 1, cur: "nesw-resize" },
  { id: "n", cx: 0.5, cy: 0, cur: "ns-resize" },
  { id: "e", cx: 1, cy: 0.5, cur: "ew-resize" },
  { id: "s", cx: 0.5, cy: 1, cur: "ns-resize" },
  { id: "w", cx: 0.5, cy: 0, cur: "ew-resize" },
] as const;

const FONT_WEIGHTS: DesignTextLayer["fontWeight"][] = [400, 700, 900];
const OBJECT_FITS: ("cover" | "contain")[] = ["cover", "contain"];
const ALIGNS: DesignTextLayer["align"][] = ["left", "center", "right"];

/**
 * Font-faithful picker (task 44f145fd). The catalog of families is the SINGLE
 * SOURCE OF TRUTH shared with the renderer — `DESIGN_FONT_CATALOG` in
 * ~/lib/design.ts — which carries, per family: the contract id, a friendly
 * label, a group bucket, a browser CSS stack for faithful live preview, and the
 * registered weights. We render the picker straight off that catalog so every
 * family (sans/serif/mono/display/script/condensed + calligraphy/handwriting/
 * retro/script-allura/script-hand/condensed-alt) shows up and previews in its
 * own face, and only ever emits the contract family id into the DesignDoc.
 */
type DesignFontCatalogGroup = (typeof DESIGN_FONT_CATALOG)[number]["group"];
const FONT_GROUPS: DesignFontCatalogGroup[] = [
  "Sans & Serif",
  "Script & Calligraphy",
  "Display & Decorative",
];

export function DesignCanvasEditor({ doc, onChange, className }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<"select" | "text" | "image" | "shape">("select");
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [projected, setProjected] = useState<DesignDoc | null>(null);
  const dragRef = useRef<null | {
    mode: "move" | "resize" | "rotate";
    startX: number;
    startY: number;
    orig: DesignRect & { rot: number };
    handle?: (typeof HANDLES)[number];
  }>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const projectedRef = useRef<DesignDoc | null>(null);
  projectedRef.current = projected;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const scale = Math.min(1, CANVAS_MAX_WIDTH / doc.width);
  const previewW = doc.width * scale;
  const previewH = doc.height * scale;

  function commit(next: DesignDoc) {
    if (selectedId && !next.layers.some((l) => l.id === selectedId)) setSelectedId(null);
    setPast((p) => [...p.slice(-49), JSON.stringify(doc)]);
    setFuture([]);
    setProjected(null);
    onChange(next);
  }

  function undo() {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [JSON.stringify(doc), ...f]);
    setProjected(null);
    onChange(JSON.parse(prev) as DesignDoc);
  }
  function redo() {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, JSON.stringify(doc)]);
    setProjected(null);
    onChange(JSON.parse(next) as DesignDoc);
  }

  const selected = selectedId ? doc.layers.find((l) => l.id === selectedId) ?? null : null;

  function toDesignCoords(e: { clientX: number; clientY: number }) {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  }

  function patchLayer(id: string, patch: Partial<DesignLayer>): DesignDoc {
    return {
      ...docRef.current,
      layers: docRef.current.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as DesignLayer) : l)),
    };
  }

  // ----- Pointer handlers -----
  function startDrag(
    e: React.PointerEvent,
    layer: DesignLayer,
    mode: "move" | "resize" | "rotate",
    handle?: (typeof HANDLES)[number],
  ) {
    if (tool !== "select" && mode !== "move") setTool("select");
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(layer.id);
    const p = toDesignCoords(e);
    dragRef.current = {
      mode,
      handle,
      startX: p.x,
      startY: p.y,
      orig: { x: layer.rect.x, y: layer.rect.y, w: layer.rect.w, h: layer.rect.h, rot: layer.rotation ?? 0 },
    };
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const layer = docRef.current.layers.find((l) => l.id === selectedIdRef.current);
      if (!layer) return;
      const p = toDesignCoords(e);
      const dx = p.x - d.startX;
      const dy = p.y - d.startY;
      let patch: Partial<DesignLayer> | null = null;

      if (d.mode === "move") {
        patch = { rect: { ...layer.rect, x: d.orig.x + dx, y: d.orig.y + dy } };
      } else if (d.mode === "resize") {
        const h = d.handle!;
        let x = d.orig.x;
        let y = d.orig.y;
        let w = d.orig.w;
        let ht = d.orig.h;
        if (h.cx === 1) w = d.orig.w + dx;
        if (h.cx === 0) {
          w = d.orig.w - dx;
          x = d.orig.x + dx;
        }
        if (h.cy === 1) ht = d.orig.h + dy;
        if (h.cy === 0) {
          ht = d.orig.h - dy;
          y = d.orig.y + dy;
        }
        if (w > 8 && ht > 8) patch = { rect: { x, y, w, h: ht } };
      } else if (d.mode === "rotate") {
        const cx = layer.rect.x + layer.rect.w / 2;
        const cy = layer.rect.y + layer.rect.h / 2;
        const ang = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
        patch = { rotation: Math.round(ang / 5) * 5 };
      }

      if (patch) setProjected(patchLayer(layer.id, patch));
    }
    function onUp() {
      const projectedNow = projectedRef.current;
      dragRef.current = null;
      if (projectedNow) {
        setPast((p) => [...p.slice(-49), JSON.stringify(docRef.current)]);
        onChange(projectedNow);
        setFuture([]);
        setProjected(null);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onChange]);

  function addLayer1(layer: DesignLayer) {
    commit({ ...doc, layers: [...doc.layers, layer] });
    setSelectedId(layer.id);
  }
  function deleteSelected() {
    if (!selectedId) return;
    commit({ ...doc, layers: doc.layers.filter((l) => l.id !== selectedId) });
  }
  function duplicateSelected() {
    if (!selectedId) return;
    const layer = doc.layers.find((l) => l.id === selectedId);
    if (!layer) return;
    const copy = JSON.parse(JSON.stringify(layer)) as DesignLayer;
    copy.id = "dup-" + Math.random().toString(36).slice(2, 8);
    copy.rect = { ...copy.rect, x: copy.rect.x + 24, y: copy.rect.y + 24 };
    commit({ ...doc, layers: [...doc.layers, copy] });
    setSelectedId(copy.id);
  }
  function bringForward(step: 1 | -1 | "front" | "back") {
    if (!selectedId) return;
    const idx = doc.layers.findIndex((l) => l.id === selectedId);
    if (idx < 0) return;
    const layers = [...doc.layers];
    const [item] = layers.splice(idx, 1);
    let target = idx;
    if (step === "front") target = layers.length;
    else if (step === "back") target = 0;
    else target = Math.min(Math.max(idx + step, 0), layers.length);
    layers.splice(target, 0, item);
    commit({ ...doc, layers });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      addLayer1(
        makeImageLayer({
          rect: { x: Math.round(doc.width * 0.1), y: Math.round(doc.height * 0.1), w: Math.round(doc.width * 0.6), h: Math.round(doc.height * 0.4) },
          imageData: src,
        }),
      );
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const tb = "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ";

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/60 p-2">
        <button type="button" onClick={() => setTool("select")} className={tb + (tool === "select" ? "bg-emerald-700/60 text-white" : "text-emerald-200/70 hover:bg-emerald-900/40")}>Select</button>
        <button type="button" onClick={() => { addLayer1(makeTextLayer({ rect: { x: 80, y: 80, w: 420, h: 90 } })); }} className={tb + (tool === "text" ? "bg-emerald-700/60 text-white" : "text-emerald-200/70 hover:bg-emerald-900/40")}>+ Text</button>
        <button type="button" onClick={() => fileRef.current?.click()} className={tb + "text-emerald-200/70 hover:bg-emerald-900/40"}>+ Image</button>
        <button type="button" onClick={() => addLayer1(makeShapeLayer({ rect: { x: 120, y: 120, w: 300, h: 200 } }))} className={tb + "text-emerald-200/70 hover:bg-emerald-900/40"}>+ Shape</button>
        <div className="mx-1 h-5 w-px bg-emerald-800/40" />
        <button type="button" onClick={undo} disabled={past.length === 0} className={tb + "text-emerald-200/70 hover:bg-emerald-900/40"}>↩ Undo</button>
        <button type="button" onClick={redo} disabled={future.length === 0} className={tb + "text-emerald-200/70 hover:bg-emerald-900/40"}>↪ Redo</button>
        <button type="button" onClick={duplicateSelected} disabled={!selected} className={tb + "text-emerald-200/70 hover:bg-emerald-900/40"}>⧉ Duplicate</button>
        <button type="button" onClick={deleteSelected} disabled={!selected} className={tb + "text-red-300/80 hover:bg-red-900/30"}>✕ Delete</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>

      {/* Layer order */}
      {selected && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/40 px-2 py-1.5 text-xs text-emerald-200/70">
          <span className="mr-1 text-emerald-300/50">Order:</span>
          <button type="button" onClick={() => bringForward("front")} className="rounded px-1.5 py-0.5 hover:bg-emerald-900/40">⏫ Front</button>
          <button type="button" onClick={() => bringForward(1)} className="rounded px-1.5 py-0.5 hover:bg-emerald-900/40">▲ Up</button>
          <button type="button" onClick={() => bringForward(-1)} className="rounded px-1.5 py-0.5 hover:bg-emerald-900/40">▼ Down</button>
          <button type="button" onClick={() => bringForward("back")} className="rounded px-1.5 py-0.5 hover:bg-emerald-900/40">⏬ Back</button>
        </div>
      )}

      {/* Advertising-compliance checklist (task 420406e2) — sits directly above
          the canvas so the agent can read it while designing. Content is driven
          entirely by ~/lib/advertising-rules.ts (verbatim research data); it
          never renders a pass/fail or "compliant" verdict. */}
      <ComplianceChecklistPanel format={formatForDimensions(doc.width, doc.height)} />

      {/* Canvas */}
      <div
        className="relative self-start overflow-hidden rounded-md border border-emerald-800/40 shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
        style={{ width: previewW, height: previewH, backgroundColor: doc.background ?? "#ffffff" }}
        onPointerDown={() => { setTool("select"); setSelectedId(null); }}
      >
        <div ref={canvasRef} style={{ width: doc.width, height: doc.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {(projected ?? doc).layers.map((layer) => (
            <LayerView
              key={layer.id}
              layer={layer}
              selected={selectedId === layer.id}
              selectable={tool === "select"}
              onLayerDown={(e) => startDrag(e, layer, "move")}
              onHandleDown={(e, h) => startDrag(e, layer, "resize", h)}
              onRotateDown={(e) => startDrag(e, layer, "rotate")}
            />
          ))}
        </div>
      </div>
      <p className="text-xs text-emerald-300/40">
        {doc.width}×{doc.height} px · {doc.layers.length} layer{doc.layers.length === 1 ? "" : "s"} · click to select, drag to move,
        corner handles to resize, ● to rotate.
      </p>

      {/* Properties */}
      {selected && (
        <PropertiesPanel
          layer={selected}
          onPatch={(patch) => commit(patchLayer(selected.id, patch))}
          onBackground={(bg) => commit({ ...doc, background: bg })}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function LayerView({
  layer,
  selected,
  selectable,
  onLayerDown,
  onHandleDown,
  onRotateDown,
}: {
  layer: DesignLayer;
  selected: boolean;
  selectable: boolean;
  onLayerDown: (e: React.PointerEvent) => void;
  onHandleDown: (e: React.PointerEvent, h: (typeof HANDLES)[number]) => void;
  onRotateDown: (e: React.PointerEvent) => void;
}) {
  const r = layer.rect;
  const base: React.CSSProperties = {
    position: "absolute",
    left: r.x,
    top: r.y,
    width: r.w,
    height: r.h,
    transform: `rotate(${layer.rotation ?? 0}deg)`,
    transformOrigin: "center",
    opacity: layer.opacity ?? 1,
    cursor: selectable ? "move" : "default",
    userSelect: "none",
  };

  let inner: React.ReactNode = null;
  if (layer.type === "text") {
    inner = (
      <div
        style={{
          width: "100%",
          height: "100%",
          color: layer.color,
          fontFamily: cssFamily(layer.fontFamily ?? "sans"),
          fontSize: layer.fontSize,
          fontWeight: layer.fontWeight ?? 400,
          lineHeight: layer.lineHeight ?? 1,
          letterSpacing: layer.letterSpacing ?? 0,
          textAlign: layer.align ?? "left",
          textTransform: layer.uppercase ? "uppercase" : "none",
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          boxSizing: "border-box",
          border: "1px dashed rgba(127,127,127,0.35)",
        }}
      >
        {layer.text || " "}
      </div>
    );
  } else if (layer.type === "image") {
    inner = layer.imageData ? (
      <img
        src={layer.imageData}
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: layer.objectFit ?? "cover", pointerEvents: "none" }}
      />
    ) : (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#11182722", color: "#6b7280", fontSize: 12 }}>Image</div>
    );
  } else {
    inner = (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: layer.fill ?? "transparent",
          border: layer.stroke && layer.strokeWidth ? `${layer.strokeWidth}px solid ${layer.stroke}` : "none",
          borderRadius: layer.radius ? layer.radius : 0,
          boxSizing: "border-box",
        }}
      />
    );
  }

  return (
    <div style={base} onPointerDown={(e) => { if (selectable) onLayerDown(e); else e.stopPropagation(); }}>
      {inner}
      {selected && selectable && (
        <>
          {HANDLES.map((h) => (
            <div
              key={h.id}
              onPointerDown={(e) => onHandleDown(e, h)}
              style={{
                position: "absolute", width: 10, height: 10,
                left: `calc(${h.cx * 100}% - 5px)`, top: `calc(${h.cy * 100}% - 5px)`,
                background: "#10b981", border: "1px solid #065f46", borderRadius: 2, cursor: h.cur, zIndex: 5,
              }}
            />
          ))}
          <div
            onPointerDown={(e) => onRotateDown(e)}
            style={{ position: "absolute", left: "50%", top: -24, width: 14, height: 14, transform: "translateX(-50%)", borderRadius: "50%", background: "#f59e0b", border: "1px solid #92400e", cursor: "grab", zIndex: 5 }}
          />
          <div style={{ position: "absolute", left: "calc(50% - 1px)", top: -20, width: 2, height: 20, background: "#f59e0b", opacity: 0.6 }} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function PropertiesPanel({
  layer,
  onPatch,
  onBackground,
}: {
  layer: DesignLayer;
  onPatch: (patch: Partial<DesignLayer>) => void;
  onBackground: (bg: string) => void;
}) {
  const num = (label: string, v: number, set: (n: number) => void, min = 0, max = 10000, step = 1) => (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] text-emerald-300/60">
      <span>{label}</span>
      <input type="number" value={Number.isFinite(v) ? Math.round(v) : 0} min={min} max={max} step={step}
        onChange={(e) => set(Number(e.target.value) || 0)}
        className="w-full rounded border border-emerald-800/40 bg-[#050f05]/70 px-2 py-1 text-xs text-emerald-100 outline-none focus:border-emerald-500" />
    </label>
  );
  const col = (label: string, v: string, set: (c: string) => void) => (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] text-emerald-300/60">
      <span>{label}</span>
      <input type="color" value={v || "#000000"} onChange={(e) => set(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded border border-emerald-800/40 bg-transparent" />
    </label>
  );

  return (
    <div className="rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/60 p-3">
      <div className="mb-2 text-xs text-emerald-200/80"><span className="font-semibold">{label(layer)}</span> <span className="text-emerald-300/40">· {layer.type}</span></div>

      {layer.type === "text" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[11px] text-emerald-300/60">
            <span>Text</span>
            <textarea value={layer.text} rows={3} onChange={(e) => onPatch({ text: e.target.value })}
              className="w-full resize-y rounded border border-emerald-800/40 bg-[#050f05]/70 px-2 py-1.5 text-xs text-emerald-100 outline-none focus:border-emerald-500" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-emerald-300/60">
            <span>Font family</span>
            <FontPicker
              value={layer.fontFamily ?? "sans"}
              onChange={(family) => onPatch({ fontFamily: family })}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-emerald-300/60">
            <span>Font weight</span>
            <select value={layer.fontWeight ?? 400} onChange={(e) => onPatch({ fontWeight: Number(e.target.value) as DesignTextLayer["fontWeight"] })}
              className="rounded border border-emerald-800/40 bg-[#050f05]/70 px-2 py-1.5 text-xs text-emerald-100 outline-none">
              {FONT_WEIGHTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-emerald-300/60">
            <span>Align</span>
            <select value={layer.align ?? "left"} onChange={(e) => onPatch({ align: e.target.value as DesignTextLayer["align"] })}
              className="rounded border border-emerald-800/40 bg-[#050f05]/70 px-2 py-1.5 text-xs text-emerald-100 outline-none">
              {ALIGNS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {num("Font size", layer.fontSize, (n) => onPatch({ fontSize: n }), 6, 600)}
            {num("Letter spacing", layer.letterSpacing ?? 0, (n) => onPatch({ letterSpacing: n }), -50, 200)}
            {num("Line height", layer.lineHeight ?? 1, (n) => onPatch({ lineHeight: n }), 0.5, 4, 0.1)}
          </div>
          <div className="flex flex-wrap gap-3">{col("Text color", layer.color, (c) => onPatch({ color: c }))}</div>
          <label className="flex items-center gap-1.5 text-[11px] text-emerald-300/60">
            <input type="checkbox" checked={!!layer.uppercase} onChange={(e) => onPatch({ uppercase: e.target.checked })} /> Uppercase
          </label>
        </div>
      )}

      {layer.type === "image" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[11px] text-emerald-300/60">
            <span>Fit (crop)</span>
            <select value={layer.objectFit ?? "cover"} onChange={(e) => onPatch({ objectFit: e.target.value as "cover" | "contain" })}
              className="rounded border border-emerald-800/40 bg-[#050f05]/70 px-2 py-1.5 text-xs text-emerald-100 outline-none">
              {OBJECT_FITS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <ReplaceImage onPick={(data) => onPatch({ imageData: data })} />
        </div>
      )}

      {layer.type === "shape" && (
        <div className="grid grid-cols-2 gap-2">
          {col("Fill", layer.fill ?? "transparent", (c) => onPatch({ fill: c }))}
          {col("Stroke", layer.stroke ?? "#000000", (c) => onPatch({ stroke: c }))}
          {num("Stroke width", layer.strokeWidth ?? 0, (n) => onPatch({ strokeWidth: n }), 0, 100)}
          {num("Radius", layer.radius ?? 0, (n) => onPatch({ radius: n }), 0, 500)}
        </div>
      )}

      <div className="mt-3 border-t border-emerald-800/20 pt-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300/50">Canvas</div>
        <div className="flex flex-wrap gap-1.5">
          {DESIGN_BACKGROUNDS.map((b) => (
            <button key={b} type="button" title={b} onClick={() => onBackground(b)} style={{ background: b }}
              className="h-6 w-6 rounded border border-emerald-800/40" />
          ))}
        </div>
      </div>
    </div>
  );

  function label(l: DesignLayer): string {
    if (l.type === "text") return l.text?.slice(0, 12) || "Text";
    if (l.type === "image") return "Image";
    return "Shape";
  }
}

function cssFamily(f?: DesignFontFamily): string {
  return fontEntryFor(f ?? "sans").css;
}

/** Font-faithful picker (task 44f145fd): grouped by style, previews in the real
 *  face, wired to the renderer's family contract (DESIGN_FONT_CATALOG). Replaces
 *  the bare <select> so the builder reads like a real font menu. */
function FontPicker({
  value,
  onChange,
}: {
  value: DesignFontFamily;
  onChange: (f: DesignFontFamily) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = fontEntryFor(value);

  // Close when clicking outside the picker.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger: shows the current selection rendered in its own face. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded border border-emerald-800/40 bg-[#050f05]/70 px-2 py-1.5 text-xs text-emerald-100 outline-none hover:border-emerald-600/50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 overflow-hidden">
          <span
            className="block h-4 w-6 shrink-0 rounded border border-emerald-800/40 bg-emerald-950/40 text-center leading-4 text-emerald-200"
            style={{ fontFamily: current.css, fontSize: 13, lineHeight: "16px" }}
          >
            Aa
          </span>
          <span className="truncate" style={{ fontFamily: current.css }}>{current.label}</span>
        </span>
        <span className="ml-1 shrink-0 text-emerald-400/70">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-emerald-700/40 bg-[#07150a] p-2 shadow-xl shadow-black/50"
        >
          {FONT_GROUPS.map((group) => {
            const items = DESIGN_FONT_CATALOG.filter((e) => e.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="mb-1">
                <div className="px-1.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/50">
                  {group}
                </div>
                {items.map((entry) => {
                  const active = entry.id === value;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => { onChange(entry.id); setOpen(false); }}
                      className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-emerald-800/30 ${active ? "bg-emerald-700/40" : ""}`}
                    >
                      <span
                        className="block h-5 w-7 shrink-0 rounded border border-emerald-800/50 bg-emerald-950/40 text-center text-emerald-200"
                        style={{ fontFamily: entry.css, fontSize: 13, lineHeight: "20px" }}
                      >
                        Aa
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-emerald-100" style={{ fontFamily: entry.css }}>
                          {entry.label}
                        </span>
                        <span className="block truncate text-[10px] text-emerald-300/50">
                          {entry.weights.join("/")} · {entry.group}
                        </span>
                      </span>
                      {active && <span className="shrink-0 text-emerald-400">✓</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReplaceImage({ onPick }: { onPick: (data: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()}
        className="rounded border border-emerald-700/40 bg-emerald-900/30 px-2.5 py-1 text-xs text-emerald-200/90 hover:bg-emerald-800/40">Upload…</button>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => onPick(String(r.result));
          r.readAsDataURL(f);
          e.target.value = "";
        }} />
    </>
  );
}
