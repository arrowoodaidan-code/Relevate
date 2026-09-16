/**
 * editor-alignment-check.ts  —  deterministic regression guard for the
 * inline-editor "canvas == reference image" alignment invariant.
 *
 * OWNER ESCALATION (task 2b24da95): the owner reported "still not coming out
 * right" across FOUR previews — the recurring editor/reference misalignment.
 * Parallel teams chase root causes in the geometry/overlay/data path; this
 * module is the PERMANENT PREVENTION guard so the class of bug can never recur
 * silently.
 *
 * The invariant the inline editor relies on (TemplateInlineEditor.tsx):
 *   - `widthPx` = canvas container's clientWidth, read via ResizeObserver.
 *     This is the OVERLAY BASIS — every region chrome is positioned at
 *     `region.x * widthPx`, `region.w * widthPx`, etc.
 *   - The reference `<img>` is `absolute inset-0 w-full h-full object-fill`
 *     inside that same container, so its displayed width MUST equal the
 *     container width (and thus the overlay basis). If img width ever diverges
 *     from the container, boxes stop lining up with the pixels — exactly what
 *     the owner keeps seeing.
 *   - Source of truth = the image itself. `dimensions` prop must equal the
 *     image's natural dimensions (the live `<img>.naturalWidth` is preferred).
 *
 * All checks here are PURE + DETERMINISTIC (no vision, no network). The same
 * functions drive the /qa-editor in-DOM measurements (QA-6/QA-7) and the
 * standalone non-zero-exit guard `scripts/editor-alignment-guard.ts`.
 */

export interface AlignmentMeasurement {
  /** Canvas container clientWidth — what the overlay math (`region.x*widthPx`) uses. */
  containerWidth: number;
  /** Displayed width of the reference <img> (getBoundingClientRect().width). */
  imageDisplayWidth: number;
  /** Displayed height of the reference <img>. */
  imageDisplayHeight: number;
  /** Natural width of the decoded image (single source of truth). */
  imageNaturalWidth: number;
  /** Natural height of the decoded image. */
  imageNaturalHeight: number;
  /** `dimensions` prop passed to the editor. */
  dimensionsPropWidth: number;
  /** `dimensions` prop passed to the editor. */
  dimensionsPropHeight: number;
  /** Displayed width of the PRE-EDITOR REFERENCE panel (alt="Original template reference"). */
  referenceWidth: number;
  /** Displayed height of the PRE-EDITOR REFERENCE panel. */
  referenceHeight: number;
}

export interface AlignmentResult {
  pass: boolean;
  errors: string[];
  detail: string;
}

/** 1px horizontal tolerance — sub-pixel layout rounding. */
export const WIDTH_TOLERANCE_PX = 1;
/** Height computed from aspect ratio is float; allow 2px rounding. */
export const HEIGHT_TOLERANCE_PX = 2;
/** Natural-vs-prop source-of-truth tolerance. */
export const SOURCE_OF_TRUTH_TOLERANCE_PX = 2;

export function computeDisplayedHeight(
  srcW: number,
  srcH: number,
  dispW: number,
): number {
  if (!srcW || !srcH || !dispW || !isFinite(srcW) || !isFinite(srcH)) return 0;
  return (srcH / srcW) * dispW;
}

/**
 * Core invariant: displayed reference image fills the canvas container, and
 * the container's aspect is governed by the single-source-of-truth dimensions.
 *  - imageDisplayWidth  == containerWidth      (overlay basis == img, ≤1px)
 *  - imageDisplayHeight == aspect-consistent   (natural ratio × containerW)
 *  - imageNatural       == dimensions prop     (single source of truth)
 */
export function assertImageFillsContainer(
  m: AlignmentMeasurement,
): AlignmentResult {
  const errors: string[] = [];

  if (Math.abs(m.imageDisplayWidth - m.containerWidth) > WIDTH_TOLERANCE_PX) {
    errors.push(
      `img display width ${m.imageDisplayWidth}px != canvas container width ${m.containerWidth}px ` +
        `(OVERLAY BASIS — region chrome positions at region.x*${m.containerWidth}px but image renders at ` +
        `${m.imageDisplayWidth}px: overlays will drift from pixels)`,
    );
  }

  if (m.containerWidth > 0) {
    const expectedH = computeDisplayedHeight(
      m.imageNaturalWidth,
      m.imageNaturalHeight,
      m.containerWidth,
    );
    if (
      expectedH > 0 &&
      Math.abs(m.imageDisplayHeight - expectedH) > HEIGHT_TOLERANCE_PX
    ) {
      errors.push(
        `img display height ${m.imageDisplayHeight}px != aspect-derived ${expectedH.toFixed(2)}px ` +
          `(container aspect not matching image source dims)`,
      );
    }
  }

  if (
    m.imageNaturalWidth > 0 &&
    (Math.abs(m.imageNaturalWidth - m.dimensionsPropWidth) >
      SOURCE_OF_TRUTH_TOLERANCE_PX ||
      Math.abs(m.imageNaturalHeight - m.dimensionsPropHeight) >
        SOURCE_OF_TRUTH_TOLERANCE_PX)
  ) {
    errors.push(
      `source-of-truth violation: image natural dims ${m.imageNaturalWidth}x${m.imageNaturalHeight}px ` +
        `!= dimensions prop ${m.dimensionsPropWidth}x${m.dimensionsPropHeight}px ` +
        `(dimensions stored/recalled independently of the image)`,
    );
  }

  return {
    pass: errors.length === 0,
    errors,
    detail:
      errors.join("  |  ") ||
      `aligned: img ${m.imageDisplayWidth}x${m.imageDisplayHeight} fills container ` +
        `${m.containerWidth}px; natural ${m.imageNaturalWidth}x${m.imageNaturalHeight} == prop`,
  };
}

/**
 * OWNER ESCALATION guard (task 61243828): the PRE-EDITOR reference panel
 * (the image shown before the editor) and the editing canvas MUST resolve to
 * the same on-screen width so their content aligns and region boxes can be
 * verified against the original. Both are bound to the same
 * EDITOR_CANVAS_MAX_WIDTH + aspect in TemplateInlineEditor, but this asserts
 * the RENDERED widths actually agree (≤1px), catching any future divergence
 * (removed/shared-constraint regression, layout container change, etc.).
 */
export function assertReferenceMatchesCanvas(
  m: AlignmentMeasurement,
): AlignmentResult {
  const errors: string[] = [];
  if (m.referenceWidth > 0) {
    if (Math.abs(m.referenceWidth - m.containerWidth) > WIDTH_TOLERANCE_PX) {
      errors.push(
        `reference panel width ${m.referenceWidth}px != editor canvas width ${m.containerWidth}px ` +
          `(owner: "image shown BEFORE must be the same size as the editing window" — they diverged)`,
      );
    }
    const expectedRefH = computeDisplayedHeight(
      m.imageNaturalWidth,
      m.imageNaturalHeight,
      m.referenceWidth,
    );
    if (
      expectedRefH > 0 &&
      Math.abs(m.referenceHeight - expectedRefH) > HEIGHT_TOLERANCE_PX
    ) {
      errors.push(
        `reference panel height ${m.referenceHeight}px != aspect-derived ${expectedRefH.toFixed(2)}px ` +
          `(reference aspect drifting from source dims)`,
      );
    }
  } else {
    errors.push(
      "reference panel not measured (width 0) — pre-editor reference missing from DOM",
    );
  }
  return {
    pass: errors.length === 0,
    errors,
    detail: errors.join("  |  ") || `aligned: reference ${m.referenceWidth}px == canvas ${m.containerWidth}px`,
  };
}

/**
 * No-drift invariant: widths sampled across re-open / path-switch / additive
 * scenarios must all agree with the first sample (≤1px).
 */
export function assertNoWidthDrift(widths: number[]): AlignmentResult {
  if (!widths.length) {
    return { pass: false, errors: ["no width samples"], detail: "no width samples" };
  }
  const ref = widths[0];
  const errors: string[] = [];
  widths.forEach((w, i) => {
    if (i > 0 && Math.abs(w - ref) > WIDTH_TOLERANCE_PX) {
      errors.push(
        `width[${i}] ${w}px drifted from baseline ${ref}px (overlay basis changed across scenario re-render)`,
      );
    }
  });
  return {
    pass: errors.length === 0,
    errors,
    detail:
      errors.join("  |  ") ||
      `stable: canvas width ${ref}px over ${widths.length} samples (re-open / branded-vs-uploaded / additive)`,
  };
}

/** Vertical-centering tolerance for text-within-box (px). */
export const V_CENTER_TOLERANCE_PX = 4;

/**
 * TEXT-WITHIN-BOX WYSIWYG invariant (Design Engineer, tasks 61243828 + parallel
 * audit 6f5f83a2). The compositor (render-templates.ts ~455) renders region
 * text VERTICALLY CENTERED and box-fitted. The editor now mirrors that centering
 * in its settled (non-focus) overlay; this asserts the rendered text block is
 * vertically centered within its region box so words never visibly jump/drop on
 * Re-render.
 *
 * Inputs are the on-screen (post-layout) geometry of one text region:
 *   boxTop / boxHeight        — the region box as displayed in the editor
 *   textTop / textHeight      — the text block's rendered rect within that box
 * The text block is "centered" when its whitespace split is balanced:
 *   gapAbove = textTop - boxTop
 *   gapBelow = (boxTop + boxHeight) - (textTop + textHeight)
 *   |gapAbove - gapBelow| <= tolerance
 */
export function assertTextVerticallyCentered(input: {
  boxTop: number;
  boxHeight: number;
  textTop: number;
  textHeight: number;
}): AlignmentResult {
  const { boxTop, boxHeight, textTop, textHeight } = input;
  const errors: string[] = [];
  if (!boxHeight || !textHeight) {
    return {
      pass: false,
      errors: ["missing box/text height for centering check"],
      detail: "cannot evaluate text centering (box or text height is 0)",
    };
  }
  const gapAbove = textTop - boxTop;
  const gapBelow = boxTop + boxHeight - (textTop + textHeight);
  const imbalance = Math.abs(gapAbove - gapBelow);
  if (imbalance > V_CENTER_TOLERANCE_PX) {
    errors.push(
      `text not vertically centered in region box: gapAbove=${gapAbove.toFixed(1)}px, gapBelow=${gapBelow.toFixed(1)}px ` +
        `(imbalance ${imbalance.toFixed(1)}px > ${V_CENTER_TOLERANCE_PX}px — text sits off-center vs the compositor; it will jump on Re-render)`,
    );
  }
  return {
    pass: errors.length === 0,
    errors,
    detail: errors.join("  |  ") ||
      `text centered: gapAbove=${gapAbove.toFixed(1)}px, gapBelow=${gapBelow.toFixed(1)}px (balanced)`,
  };
}

/** Format one result for the /qa-editor panel or a CLI table. */
export function formatAlignment(result: AlignmentResult): string {
  return `${result.pass ? "PASS" : "FAIL"}  ${result.detail}`;
}

/**
 * Self-test proving the guard logic:
 *  - Positive: a perfectly-aligned measurement passes all three checks.
 *  - Negative (THE negative test the task requires): a deliberately-introduced
 *    width drift (simulating an overlay running off the reference pixels) is
 *    CAUGHT — `pass` is false and the error names the drift. If this negative
 *    ever returns pass:true, the guard itself is broken and must not be trusted.
 * Returns one result per check so a CLI can exit non-zero on any failure.
 */
export function runEditorAlignmentSelfTest(): AlignmentResult[] {
  const out: AlignmentResult[] = [];

  // ---- POSITIVE ----
  const aligned: AlignmentMeasurement = {
    containerWidth: 450,
    imageDisplayWidth: 450,
    imageDisplayHeight: 600,
    imageNaturalWidth: 1080,
    imageNaturalHeight: 1440,
    dimensionsPropWidth: 1080,
    dimensionsPropHeight: 1440,
    referenceWidth: 450,
    referenceHeight: 600,
  };
  const fillOk = assertImageFillsContainer(aligned);
  out.push({
    pass: fillOk.pass,
    errors: fillOk.errors,
    detail: `positive alignment: ${fillOk.detail}`,
  });

  const refOk = assertReferenceMatchesCanvas(aligned);
  out.push({
    pass: refOk.pass,
    errors: refOk.errors,
    detail: `positive reference==canvas: ${refOk.detail}`,
  });

  const stable = assertNoWidthDrift([450, 450, 450, 450]);
  out.push({
    pass: stable.pass,
    errors: stable.errors,
    detail: `positive no-drift: ${stable.detail}`,
  });

  // ---- POSITIVE: text block vertically centered in its box ----
  // box 100→300 (h=200); text 160→240 (h=80) → gapAbove=60, gapBelow=60.
  const centered = assertTextVerticallyCentered({ boxTop: 100, boxHeight: 200, textTop: 160, textHeight: 80 });
  out.push({
    pass: centered.pass,
    errors: centered.errors,
    detail: `positive text centered: ${centered.detail}`,
  });

  // ---- NEGATIVE: text top-aligned (the pre-fix WYSIWYG bug) ----
  // box 100→300; text pinned to top 100→180 → gapAbove=0, gapBelow=120.
  const topAligned = assertTextVerticallyCentered({ boxTop: 100, boxHeight: 200, textTop: 100, textHeight: 80 });
  out.push({
    pass: !topAligned.pass && topAligned.errors.length > 0,
    errors: topAligned.pass ? ["negative test not caught"] : [],
    detail: topAligned.pass
      ? "NEGATIVE TEST FAILED: guard did NOT catch top-aligned (off-center) region text"
      : `NEGATIVE text caught: ${topAligned.errors[0]}`,
  });

  // ---- NEGATIVE: force a 20px width drift (overlay basis vs displayed img) ----
  const drifted = {
    ...aligned,
    imageDisplayWidth: 430, // container says 450, image only renders 430 → drift
  };
  const neg1 = assertImageFillsContainer(drifted);
  out.push({
    pass: !neg1.pass && neg1.errors.length > 0,
    errors: neg1.pass ? ["negative test not caught"] : [],
    detail: neg1.pass
      ? "NEGATIVE TEST FAILED: guard did NOT catch 20px width drift"
      : `NEGATIVE caught: ${neg1.errors[0]}`,
  });

  // ---- NEGATIVE: reference panel width != canvas width (owner escalation) ----
  const refDrift = {
    ...aligned,
    referenceWidth: 400, // reference renders 400, canvas is 450 → must FAIL
  };
  const negRef = assertReferenceMatchesCanvas(refDrift);
  out.push({
    pass: !negRef.pass && negRef.errors.length > 0,
    errors: negRef.pass ? ["negative test not caught"] : [],
    detail: negRef.pass
      ? "NEGATIVE TEST FAILED: guard did NOT catch reference!=canvas width"
      : `NEGATIVE reference caught: ${negRef.errors[0]}`,
  });

  // ---- NEGATIVE: force source-of-truth violation (natural != prop) ----
  const propDrift = {
    ...aligned,
    dimensionsPropWidth: 1024,
    dimensionsPropHeight: 1365,
  };
  const neg2 = assertImageFillsContainer(propDrift);
  out.push({
    pass: !neg2.pass && neg2.errors.length > 0,
    errors: neg2.pass ? ["negative test not caught"] : [],
    detail: neg2.pass
      ? "NEGATIVE TEST FAILED: guard did NOT catch source-of-truth violation"
      : `NEGATIVE caught: ${neg2.errors[0]}`,
  });

  // ---- NEGATIVE: force drift across the no-drift samples ----
  const neg3 = assertNoWidthDrift([450, 450, 500, 450]);
  out.push({
    pass: !neg3.pass && neg3.errors.length > 0,
    errors: neg3.pass ? ["negative test not caught"] : [],
    detail: neg3.pass
      ? "NEGATIVE TEST FAILED: guard did NOT catch width drift across samples"
      : `NEGATIVE caught: ${neg3.errors[0]}`,
  });

  return out;
}
