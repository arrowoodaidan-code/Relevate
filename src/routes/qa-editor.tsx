import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { TemplateInlineEditor, ADDED_PREFIX } from "~/components/TemplateInlineEditor";
import type { TemplateRegion } from "~/lib/prompts";
import {
  assertImageFillsContainer,
  assertNoWidthDrift,
  assertReferenceMatchesCanvas,
  type AlignmentMeasurement,
  type AlignmentResult,
} from "~/lib/editor-alignment-check";
import {
  QA_MULTIOBJECT_SRC,
  QA_MULTIOBJECT_WIDTH,
  QA_MULTIOBJECT_HEIGHT,
  QA_MULTIOBJECT_REGIONS,
  QA_MULTIOBJECT_TEXT,
  QA_PHOTO_SOURCES,
  QA_SOLID_PNG,
} from "~/lib/qa-editor-fixtures";

/**
 * QA EDITOR HARNESS  (route: /qa-editor)  — fullstack-engineer (task 7526e19e)
 *
 * A non-deployable local regression harness that exercises the inline editor's
 * MANIPULATION flow (move/resize detected regions) and ADDITIVE flow (+Text /
 * +Image boxes) end-to-end against /api/render, so renderer or editor regressions
 * are caught fast. It is a SEPARATE route that imports the existing
 * TemplateInlineEditor component (read-only) — it does NOT modify TemplateInlineEditor.tsx
 * or app.tsx (FE-owned), avoiding any file conflicts.
 *
 * Two behavior modes (mirroring the current reviewed app.tsx SAFETY GUARD + A's
 * landed additive:true support):
 *   - "detected-only" (DEFAULT / parity): rendered regions = detected template
 *     regions only. Editor-added boxes stay OUT of the render payload (they remain
 *     editor-only overlays). This is exactly what the production /app does today.
 *   - "include additive (draw-on-top)": added boxes ARE sent, each tagged
 *     `additive: true` so the compositor draws them ON TOP without erasing the
 *     underlying template pixels (render.ts honors additive via the
 *     `replaceable = regions.filter(r => !r.additive)` path, commit e121b3fd).
 *
 * Run "Run QA checks" for the self-test panel; or just drag/resize/type/add in
 * the editor and hit "Render designed flyer" for a visual check.
 */

type EditorContentType = "open-house-flyer" | "social-media";

// ---- Pure helpers (unit-testable without React) ---------------------------

/** Detected-only parity: added regions are excluded entirely from render. */
export function buildRenderRegions(
  detected: TemplateRegion[],
  added: TemplateRegion[],
  includeAdditive: boolean,
): TemplateRegion[] {
  if (!includeAdditive) return detected;
  return [...detected, ...added.map((r) => ({ ...r, additive: true }))];
}

export function applyRegionGeometry(
  regions: TemplateRegion[],
  id: string,
  geom: { x: number; y: number; w: number; h: number },
): TemplateRegion[] {
  return regions.map((r) => (r.id === id ? { ...r, ...geom } : r));
}

function collectReplaced(
  regions: TemplateRegion[],
  kind: "text" | "image",
  detectedMap: Record<string, string>,
  addedMap: Record<string, string>,
  includeAdditive: boolean,
): Record<string, string> {
  const out: Record<string, string> = {};
  const ids = new Set(regions.filter((r) => r.kind === kind).map((r) => r.id));
  for (const [id, v] of Object.entries(detectedMap)) if (ids.has(id) && v) out[id] = v;
  if (includeAdditive) {
    for (const [id, v] of Object.entries(addedMap)) if (ids.has(id) && v) out[id] = v;
  }
  return out;
}

export interface RenderPayloadInput {
  contentType: EditorContentType;
  templateImage: string;
  regions: TemplateRegion[];
  regionText: Record<string, string>;
  regionImages: Record<string, string>;
  addedText: Record<string, string>;
  addedImages: Record<string, string>;
  includeAdditive: boolean;
  templateWidth?: number;
  templateHeight?: number;
  title?: string;
  body?: string;
}

export function buildRenderPayload(input: RenderPayloadInput): Record<string, unknown> {
  const regions = buildRenderRegions(input.regions, [], input.includeAdditive);
  // NOTE: caller passes editor-added regions inside `regions` when it wants them
  // (buildRenderRegions already tags them additive:true); here we just ensure the
  // returned payload only carries detected OR additive-tagged regions.
  const text = collectReplaced(regions, "text", input.regionText, input.addedText, input.includeAdditive);
  const images = collectReplaced(regions, "image", input.regionImages, input.addedImages, input.includeAdditive);
  const payload: Record<string, unknown> = {
    type: input.contentType === "social-media" ? "social" : "flyer",
    title: input.title || "QA Multi-Object Template",
    body: input.body || "QA harness render — manipulation + additive regression check.",
    templateImage: input.templateImage,
    templateRegions: regions,
    regionText: text,
    ...(Object.keys(images).length > 0 ? { regionImages: images } : {}),
    ...(input.templateWidth ? { templateWidth: input.templateWidth } : {}),
    ...(input.templateHeight ? { templateHeight: input.templateHeight } : {}),
  };
  return payload;
}

// ---- Route ----------------------------------------------------------------

export const Route = createFileRoute("/qa-editor")({
  component: QaEditorHarness,
});

interface QaResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

function QaEditorHarness() {
  const navigate = useNavigate();

  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<{ email?: string } | null>(null);

  // Editor + render state.
  const [templateImage, setTemplateImage] = useState<string | null>(null);
  const [templateDimensions, setTemplateDimensions] = useState<{ width: number; height: number } | null>(null);
  const [templateRegions, setTemplateRegions] = useState<TemplateRegion[]>([]);
  const [regionText, setRegionText] = useState<Record<string, string>>({});
  const [regionImages, setRegionImages] = useState<Record<string, string>>({});
  const [regionPrompts, setRegionPrompts] = useState<Record<string, string>>({});
  const [addedRegions, setAddedRegions] = useState<TemplateRegion[]>([]);
  const [addedText, setAddedText] = useState<Record<string, string>>({});
  const [addedImages, setAddedImages] = useState<Record<string, string>>({});

  const [contentType, setContentType] = useState<EditorContentType>("open-house-flyer");
  const [includeAdditive, setIncludeAdditive] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderedImage, setRenderedImage] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [qaRunning, setQaRunning] = useState(false);
  const [qaResults, setQaResults] = useState<QaResult[] | null>(null);
  const [loadMessage, setLoadMessage] = useState<string>("");

  // Ref to the wrapper that owns the mounted TemplateInlineEditor, used by the
  // deterministic in-DOM alignment checks (QA-6/QA-7).
  const editorWrapRef = useRef<HTMLDivElement>(null);

  /** Measure the mounted editor's canvas container + reference <img> (no vision). */
  const measureEditor = useCallback((): AlignmentMeasurement | null => {
    const wrap = editorWrapRef.current;
    if (!wrap) return null;
    const img = wrap.querySelector<HTMLImageElement>('img[alt="Design canvas"]');
    const canvas = img?.parentElement;
    if (!img || !canvas) return null;
    const cw = canvas.clientWidth;
    if (!cw) return null;
    const rect = img.getBoundingClientRect();
    // Pre-editor REFERENCE panel (task 61243828) — must match canvas width.
    const refImg = wrap.querySelector<HTMLImageElement>('img[alt="Original template reference"]');
    const refRect = refImg?.getBoundingClientRect();
    return {
      containerWidth: cw,
      imageDisplayWidth: Math.round(rect.width * 100) / 100,
      imageDisplayHeight: Math.round(rect.height * 100) / 100,
      imageNaturalWidth: img.naturalWidth,
      imageNaturalHeight: img.naturalHeight,
      dimensionsPropWidth: (img.naturalWidth > 0 ? templateDimensions?.width : 0) ?? 0,
      dimensionsPropHeight: (img.naturalHeight > 0 ? templateDimensions?.height : 0) ?? 0,
      referenceWidth: refImg && refRect ? Math.round(refRect.width * 100) / 100 : 0,
      referenceHeight: refImg && refRect ? Math.round(refRect.height * 100) / 100 : 0,
    };
  }, [templateDimensions]);

  // Auth guard (mirrors /app).
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) setUser(data.user);
        else navigate({ to: "/login" });
      })
      .catch(() => navigate({ to: "/login" }))
      .finally(() => setAuthLoading(false));
  }, [navigate]);

  // Load the bundled fixture raster as a data URL (client-only, SSR-safe).
  const loadFixture = useCallback(async () => {
    setLoadMessage("Loading fixture raster…");
    try {
      const res = await fetch(QA_MULTIOBJECT_SRC);
      const blob = await res.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("Failed to read fixture"));
        r.readAsDataURL(blob);
      });
      setTemplateImage(dataUrl);
      setTemplateDimensions({ width: QA_MULTIOBJECT_WIDTH, height: QA_MULTIOBJECT_HEIGHT });
      setTemplateRegions(QA_MULTIOBJECT_REGIONS);
      setRegionText({ ...QA_MULTIOBJECT_TEXT });
      setRegionImages({});
      setRegionPrompts({});
      setAddedRegions([]);
      setAddedText({});
      setAddedImages({});
      setRenderedImage(null);
      setRenderError(null);
      setLoadMessage(
        `Fixture loaded: ${QA_MULTIOBJECT_REGIONS.length} per-object regions` +
          ` (${QA_MULTIOBJECT_REGIONS.filter((r) => r.kind === "text").length} text / ` +
          `${QA_MULTIOBJECT_REGIONS.filter((r) => r.kind === "image").length} image), ` +
          `${QA_MULTIOBJECT_WIDTH}×${QA_MULTIOBJECT_HEIGHT}.`,
      );
    } catch (err) {
      setLoadMessage(`Fixture load failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  useEffect(() => {
    void loadFixture();
  }, [loadFixture]);

  // ---- Editor callbacks ---------------------------------------------------

  const handleAdditionsChange = useCallback(
    (regions: TemplateRegion[], text: Record<string, string>, images: Record<string, string>) => {
      setAddedRegions(regions);
      setAddedText(text);
      setAddedImages(images);
    },
    [],
  );

  const handleRegionGeometryChange = useCallback(
    (id: string, geom: { x: number; y: number; w: number; h: number }) => {
      setTemplateRegions((prev) => applyRegionGeometry(prev, id, geom));
    },
    [],
  );

  const handleImageChange = useCallback((id: string, value: string | null) => {
    if (id.startsWith(ADDED_PREFIX)) {
      setAddedImages((prev) => {
        const next = { ...prev };
        if (value == null) delete next[id];
        else next[id] = value;
        return next;
      });
    } else {
      setRegionImages((prev) => {
        const next = { ...prev };
        if (value == null) delete next[id];
        else next[id] = value;
        return next;
      });
    }
  }, []);

  const handleImageUpload = useCallback(
    (id: string, file?: File) => {
      if (!file || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        if (dataUrl) handleImageChange(id, dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [handleImageChange],
  );

  // QA harness keeps AI image-gen out of loop (cost + determinism): pasting a
  // solid placeholder proves the image-replacement plumbing (added + detected)
  // lands in the editor + render payload without spending gpt-image.
  const handleGenerateImage = useCallback(
    (id: string) => {
      handleImageChange(id, QA_SOLID_PNG);
    },
    [handleImageChange],
  );

  const handleRender = useCallback(async () => {
    if (!templateImage || isRendering) return;
    setIsRendering(true);
    setRenderError(null);
    try {
      const payload = buildRenderPayload({
        contentType,
        templateImage,
        regions: buildRenderRegions(templateRegions, addedRegions, includeAdditive),
        regionText,
        regionImages,
        addedText,
        addedImages,
        includeAdditive,
        templateWidth: templateDimensions?.width,
        templateHeight: templateDimensions?.height,
      });
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      const imageDataUrl = data?.imageDataUrl;
      if (res.ok && imageDataUrl) {
        setRenderedImage(imageDataUrl);
      } else {
        setRenderError((data?.error as string) || `Render failed (${res.status}).`);
      }
    } catch (err) {
      setRenderError(`Render failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRendering(false);
    }
  }, [templateImage, contentType, templateRegions, addedRegions, includeAdditive, regionText, regionImages, addedText, addedImages, templateDimensions, isRendering]);

  // ---- QA self-check ------------------------------------------------------

  const runQa = useCallback(async () => {
    if (!templateImage || qaRunning) return;
    setQaRunning(true);
    setQaResults(null);
    const results: QaResult[] = [];

    // QA-0 fixture ready.
    const ready =
      Boolean(templateImage) &&
      templateRegions.length === QA_MULTIOBJECT_REGIONS.length &&
      templateRegions.length > 0 &&
      Boolean(templateDimensions);
    results.push({
      id: "qa-0",
      name: "Fixture ready",
      pass: ready,
      detail: ready
        ? `${templateRegions.length} regions, ${templateDimensions?.width}×${templateDimensions?.height}`
        : `templateImage=${Boolean(templateImage)} regions=${templateRegions.length} dims=${Boolean(templateDimensions)}`,
    });

    // QA-1 manipulation propagates (detected region move/resize → render regions).
    const moved = applyRegionGeometry(QA_MULTIOBJECT_REGIONS, "headline-1", { x: 0.2, y: 0.5, w: 0.6, h: 0.12 });
    const movedHeadline = moved.find((r) => r.id === "headline-1");
    const manipOk = movedHeadline != null && movedHeadline.x === 0.2 && movedHeadline.y === 0.5;
    results.push({
      id: "qa-1",
      name: "Manipulation propagates (move/resize detected region)",
      pass: manipOk,
      detail: manipOk
        ? `headline-1 geometry → x=0.2,y=0.5,w=0.6,h=0.12`
        : `expected x=0.2,y=0.5 got x=${movedHeadline?.x},y=${movedHeadline?.y}`,
    });

    // QA-2 additive isolation (detected-only parity = default).
    const sampleAdded: TemplateRegion = {
      id: `${ADDED_PREFIX}text-1`,
      label: "other",
      kind: "text",
      x: 0.3,
      y: 0.42,
      w: 0.4,
      h: 0.08,
      textColor: "#ffffff",
      fontFamily: "sans-serif",
      fontWeight: "bold",
      fontSizePx: 40,
      align: "center",
    };
    const parityRegions = buildRenderRegions(QA_MULTIOBJECT_REGIONS, [sampleAdded], false);
    const parityHasAdded = parityRegions.some((r) => r.id.startsWith(ADDED_PREFIX));
    results.push({
      id: "qa-2",
      name: "Additive isolated in detected-only parity (none leak into render)",
      pass: !parityHasAdded,
      detail: parityHasAdded
        ? `LEAK: add- region reached render payload (would erase underneath)`
        : `${parityRegions.length} detected regions only; added box excluded`,
    });

    // QA-3 additive tagged draw-on-top (forward path).
    const additiveRegions = buildRenderRegions(QA_MULTIOBJECT_REGIONS, [sampleAdded], true);
    const addedInPayload = additiveRegions.filter((r) => r.id.startsWith(ADDED_PREFIX));
    const drawOnTopOk = addedInPayload.length === 1 && addedInPayload[0].additive === true;
    results.push({
      id: "qa-3",
      name: "Additive tagged additive:true for draw-on-top",
      pass: drawOnTopOk,
      detail: drawOnTopOk
        ? `added box present with additive:true (compositor skips erase/backing)`
        : `addedInPayload=${addedInPayload.length} first.additive=${addedInPayload[0]?.additive}`,
    });

    // QA-4 live render (detected-only parity) → valid PNG from /api/render.
    try {
      const payload = buildRenderPayload({
        contentType,
        templateImage,
        regions: buildRenderRegions(templateRegions, [], false),
        regionText,
        regionImages,
        addedText,
        addedImages,
        includeAdditive: false,
        templateWidth: templateDimensions?.width,
        templateHeight: templateDimensions?.height,
        title: "QA Render (Detection-Matched)",
        body: "Move-in ready with beautiful natural light throughout.",
      });
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      const imageDataUrl = data?.imageDataUrl as string | undefined;
      const renderOk = res.ok && typeof imageDataUrl === "string" && imageDataUrl.startsWith("data:image/");
      results.push({
        id: "qa-4",
        name: "Live /api/render (detected-only) returns valid PNG",
        pass: renderOk,
        detail: renderOk
          ? `HTTP ${res.status}, ${imageDataUrl.length.toLocaleString()} char data-URL`
          : `HTTP ${res.status} error="${data?.error || "no image"}"`,
      });
      if (renderOk && imageDataUrl) setRenderedImage(imageDataUrl);
    } catch (err) {
      results.push({
        id: "qa-4",
        name: "Live /api/render (detected-only) returns valid PNG",
        pass: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // QA-5 live render with an additive box (draw-on-top) → still valid PNG.
    try {
      const payload = buildRenderPayload({
        contentType,
        templateImage,
        regions: buildRenderRegions(templateRegions, [sampleAdded], true),
        regionText,
        regionImages,
        addedText: { [sampleAdded.id]: "FOR SALE" },
        addedImages,
        includeAdditive: true,
        templateWidth: templateDimensions?.width,
        templateHeight: templateDimensions?.height,
        title: "QA Render (Additive draw-on-top)",
        body: "Additive box rendered on top of the hero photo.",
      });
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      const imageDataUrl = data?.imageDataUrl as string | undefined;
      const renderOk = res.ok && typeof imageDataUrl === "string" && imageDataUrl.startsWith("data:image/");
      results.push({
        id: "qa-5",
        name: "Live /api/render with additive box (draw-on-top) valid",
        pass: renderOk,
        detail: renderOk
          ? `HTTP ${res.status}, additive text composited over hero`
          : `HTTP ${res.status} error="${data?.error || "no image"}"`,
      });
      if (renderOk && imageDataUrl) setRenderedImage(imageDataUrl);
    } catch (err) {
      results.push({
        id: "qa-5",
        name: "Live /api/render with additive box (draw-on-top) valid",
        pass: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // QA-6 (OWNER ESCALATION guard, task 2b24da95): the mounted editor's canvas
    // container and the reference <img> MUST resolve to the same on-screen width
    // (the overlay basis). Deterministic in-DOM measurement — no vision.
    (() => {
      const m = measureEditor();
      let r: AlignmentResult;
      if (!m) {
        r = { pass: false, errors: ["editor canvas not mounted for measurement"], detail: "editor canvas not mounted" };
      } else {
        r = assertImageFillsContainer(m);
      }
      results.push({
        id: "qa-6",
        name: "Editor canvas == reference image width (overlay basis, in-DOM)",
        pass: r.pass,
        detail: r.detail,
      });
    })();

    // QA-8 (OWNER ESCALATION guard, task 61243828): the PRE-EDITOR reference
    // panel ("Original template reference", the image shown BEFORE the editor)
    // and the editing canvas MUST resolve to the same on-screen width. This
    // asserts the reference panel actually rendered at the canvas width.
    (() => {
      const m = measureEditor();
      const r = m ? assertReferenceMatchesCanvas(m) : { pass: false, errors: ["editor canvas not mounted"], detail: "editor canvas not mounted" } as AlignmentResult;
      results.push({
        id: "qa-8",
        name: "Pre-editor reference panel == editor canvas width (in-DOM)",
        pass: r.pass,
        detail: r.detail,
      });
    })();

    // QA-7 (OWNER ESCALATION guard, task 2b24da95): canvas width must not drift
    // across scenario re-renders — simulated re-open (reload fixture), a
    // branded-vs-uploaded-equivalent path toggle (additive mode), then settle.
    // All deterministic in-DOM width samples must agree with the baseline.
    // (Awaited BEFORE setQaResults so QA-7 is part of the rendered results array.)
    try {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const baseline = measureEditor()?.containerWidth ?? 0;
      // additive re-render (path-toggle stress).
      setIncludeAdditive((v) => !v);
      await sleep(80);
      // simulated re-open: reload the same fixture (remount → re-measure).
      await loadFixture();
      await sleep(180);
      const w2 = measureEditor()?.containerWidth ?? 0;
      const w3 = measureEditor()?.containerWidth ?? 0;
      const widths = [baseline, w2, w3].filter((w) => w > 0);
      const drift = assertNoWidthDrift(widths);
      results.push({
        id: "qa-7",
        name: "Canvas width stable across re-open / path-switch / additive (no drift)",
        pass: drift.pass && widths.length === 3,
        detail:
          widths.length === 3
            ? drift.detail
            : `got ${widths.length}/3 width samples — canvas not mounted through scenarios`,
      });
    } catch (err) {
      results.push({
        id: "qa-7",
        name: "Canvas width stable across re-open / path-switch / additive (no drift)",
        pass: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    setQaResults(results);
    setQaRunning(false);
  }, [templateImage, qaRunning, templateRegions, templateDimensions, contentType, regionText, regionImages, addedText, addedImages, measureEditor, loadFixture]);

  if (authLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-emerald-200/70">
        Checking session…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-emerald-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-amber-100">Inline-editor QA harness</h1>
          <p className="mt-1 text-xs text-emerald-300/50">
            Exercises manipulation + additive flows against /api/render locally. Reads-only
            the shared <code className="text-emerald-300/70">TemplateInlineEditor</code> —
            no FE files modified. {user?.email ? `Signed in as ${user.email}.` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="rounded-lg border border-emerald-700/40 px-3 py-1.5 text-xs text-emerald-200/80 hover:bg-emerald-900/30"
        >
          ← Home
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/40 p-3">
        <button
          type="button"
          onClick={() => void loadFixture()}
          className="rounded-lg wood-button px-3 py-1.5 text-xs font-semibold text-emerald-100"
        >
          Reload fixture
        </button>
        <label className="text-xs text-emerald-300/60">
          Content type:
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value as EditorContentType)}
            className="ml-2 rounded border border-emerald-800/40 bg-[#071307] px-2 py-1 text-xs text-emerald-100"
          >
            <option value="open-house-flyer">Flyer</option>
            <option value="social-media">Social</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-emerald-300/60">
          <input
            type="checkbox"
            checked={includeAdditive}
            onChange={(e) => setIncludeAdditive(e.target.checked)}
            className="accent-emerald-500"
          />
          Include added boxes in render (tagged <code>additive:true</code> draw-on-top)
        </label>
        <button
          type="button"
          onClick={() => void runQa()}
          disabled={qaRunning || !templateImage}
          className="rounded-lg border border-amber-600/40 bg-amber-900/20 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-800/40 disabled:opacity-50"
        >
          {qaRunning ? "Running…" : "▶ Run QA checks"}
        </button>
      </div>

      {loadMessage && (
        <p className="mt-3 text-xs text-emerald-400/80">{loadMessage}</p>
      )}

      {qaResults && (
        <div className="mt-4 rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/40 p-4">
          <h2 className="text-sm font-semibold text-amber-100">Self-test results</h2>
          <ul className="mt-2 space-y-1.5">
            {qaResults.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    r.pass ? "bg-emerald-600/30 text-emerald-300" : "bg-red-600/30 text-red-300"
                  }`}
                >
                  {r.pass ? "✓" : "✕"}
                </span>
                <span className="text-emerald-100">
                  <span className="font-medium">{r.name}:</span>{" "}
                  <span className={r.pass ? "text-emerald-300/60" : "text-red-300/80"}>{r.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {templateImage ? (
        <div className="mt-6" ref={editorWrapRef} data-qa-editor-wrap>
          <TemplateInlineEditor
            baseImage={templateImage}
            dimensions={templateDimensions}
            regions={templateRegions}
            regionText={regionText}
            regionImages={regionImages}
            regionPrompts={regionPrompts}
            photoSources={QA_PHOTO_SOURCES}
            renderingRegionId={null}
            onTextChange={(id, value) =>
              setRegionText((prev) => ({ ...prev, [id]: value }))
            }
            onImageChange={handleImageChange}
            onPromptChange={(id, value) =>
              setRegionPrompts((prev) => ({ ...prev, [id]: value }))
            }
            onImageUpload={handleImageUpload}
            onGenerateImage={handleGenerateImage}
            onRegionGeometryChange={handleRegionGeometryChange}
            onAdditionsChange={handleAdditionsChange}
            contentType={contentType}
            isRendering={isRendering}
            renderedImage={renderedImage}
            renderError={renderError}
            onDismissRenderError={() => setRenderError(null)}
            onRender={() => void handleRender()}
            isGenerating={false}
            isRefining={false}
            showEditedHint={false}
            modeLabel={includeAdditive ? "QA · Branded/Additive mode" : "QA · Template mode"}
          />
        </div>
      ) : (
        <p className="mt-6 text-sm text-emerald-300/50">
          Fixture not loaded yet — {loadMessage || "loading…"}
        </p>
      )}
    </div>
  );
}
