/**
 * Design-template service for Relevate (rev-35 pivot, task 856289a6).
 *
 * Persists a user's from-scratch design (a DesignDoc, see src/lib/design.ts)
 * as a reusable named template in Neon Postgres, scoped to the owning user —
 * the same pool/pattern as auth and the uploaded-template service
 * (src/lib/templates.ts). A saved DesignDoc can be listed, reopened into the
 * editor, re-edited, re-rendered, updated, or deleted.
 *
 * The full DesignDoc is stored as a JSONB `design` column (its width/height
 * also mirrored to columns for convenience). This is the native-layer model
 * produced by DesignCanvasEditor.tsx and consumed by render-design.ts — there
 * is NO image+raster here, unlike the uploaded-template `templates` table.
 */
import { randomUUID } from "node:crypto";
import { sql as neonSql } from "../db";
import type { DesignDoc, DesignLayer } from "./design";

// Reuse a single lazy Neon client across all operations in this module instead of
// creating a fresh one per call. This is the documented @neondatabase/serverless
// best practice: it establishes the (pooled) HTTP connection once per serverless
// instance and reuses it, avoiding the cold-start connection establishment and
// repeated pool creation that can stall a DB-backed route (the reported
// /api/design-templates GET/POST hang was isolated to this DB path, which is the
// only divergence from the DB-free /api/render-design). The provider's client is
// safe to share across concurrent tagged-template calls.
type Db = ReturnType<typeof neonSql>;
let sharedDb: Db | null = null;
function getDb(): Db {
  if (!sharedDb) sharedDb = neonSql();
  return sharedDb;
}

export interface DesignTemplate {
  id: string;
  user_id: string;
  name: string;
  design: DesignDoc;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

/** Validate a template name. */
export function isValidTemplateName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 120;
}

const HEIGHT_MIN = 64;
const HEIGHT_MAX = 10000;

/** Validate full / partial DesignDoc. Returns a normalized payload. */
export function validateDesignDoc(
  value: unknown,
): { ok: true; design: DesignDoc } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "DesignDoc is required" };
  }
  const raw = value as Record<string, unknown>;
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { ok: false, error: "DesignDoc width/height must be numbers" };
  }
  if (width < HEIGHT_MIN || height < HEIGHT_MIN || width > HEIGHT_MAX || height > HEIGHT_MAX) {
    return { ok: false, error: `DesignDoc dimensions must be within ${HEIGHT_MIN}–${HEIGHT_MAX}px` };
  }
  const layers = Array.isArray(raw.layers) ? raw.layers : [];
  if (layers.length > 200) {
    return { ok: false, error: "Too many layers (max 200)" };
  }
  const layersOk: DesignLayer[] = [];
  for (const l of layers) {
    const v = validateLayer(l);
    if (!v) return { ok: false, error: "Invalid layer in DesignDoc" };
    layersOk.push(v);
  }
  const design: DesignDoc = {
    width,
    height,
    background:
      typeof raw.background === "string" && /^#[0-9a-f]{6}$/i.test(raw.background)
        ? raw.background
        : "#ffffff",
    layers: layersOk,
  };
  return { ok: true, design };
}

function isValidRect(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    [r.x, r.y, r.w, r.h].every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100000)
  );
}

const FAMILIES = new Set(["sans", "serif", "mono", "display", "script", "condensed"]);
const WEIGHTS = new Set([400, 700, 900]);
const ALIGNS = new Set(["left", "center", "right"]);
const FITS = new Set(["cover", "contain"]);
const SHAPES = new Set(["rect", "ellipse"]);

function validateLayer(v: unknown): DesignLayer | null {
  if (!v || typeof v !== "object") return null;
  const raw = v as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id.length > 80) return null;
  if (!isValidRect(raw.rect)) return null;
  const base: Record<string, unknown> = {
    id: raw.id,
    type: raw.type,
    rect: raw.rect,
  };
  if (typeof raw.rotation === "number" && Number.isFinite(raw.rotation)) base.rotation = raw.rotation;
  if (typeof raw.opacity === "number" && Number.isFinite(raw.opacity)) base.opacity = raw.opacity;

  if (raw.type === "text") {
    if (typeof raw.text !== "string") return null;
    const t: Record<string, unknown> = { ...base, text: raw.text };
    if (typeof raw.fontFamily === "string" && FAMILIES.has(raw.fontFamily)) t.fontFamily = raw.fontFamily;
    if (typeof raw.fontWeight === "number" && WEIGHTS.has(raw.fontWeight)) t.fontWeight = raw.fontWeight;
    if (typeof raw.fontSize === "number" && Number.isFinite(raw.fontSize) && raw.fontSize > 0) t.fontSize = raw.fontSize;
    if (typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color)) t.color = raw.color;
    if (typeof raw.align === "string" && ALIGNS.has(raw.align)) t.align = raw.align;
    if (typeof raw.letterSpacing === "number" && Number.isFinite(raw.letterSpacing)) t.letterSpacing = raw.letterSpacing;
    if (typeof raw.lineHeight === "number" && Number.isFinite(raw.lineHeight) && raw.lineHeight > 0) t.lineHeight = raw.lineHeight;
    if (typeof raw.uppercase === "boolean") t.uppercase = raw.uppercase;
    return t as unknown as DesignLayer;
  }
  if (raw.type === "image") {
    if (typeof raw.imageData !== "string" || !raw.imageData.startsWith("data:image/")) return null;
    const im: Record<string, unknown> = { ...base, imageData: raw.imageData.slice(0, 5_800_000) };
    if (typeof raw.objectFit === "string" && FITS.has(raw.objectFit)) im.objectFit = raw.objectFit;
    return im as unknown as DesignLayer;
  }
  if (raw.type === "shape") {
    const sh: Record<string, unknown> = { ...base };
    if (typeof raw.shape === "string" && SHAPES.has(raw.shape)) sh.shape = raw.shape;
    if (typeof raw.fill === "string" && /^#[0-9a-f]{6}$/i.test(raw.fill)) sh.fill = raw.fill;
    if (typeof raw.stroke === "string" && /^#[0-9a-f]{6}$/i.test(raw.stroke)) sh.stroke = raw.stroke;
    if (typeof raw.strokeWidth === "number" && Number.isFinite(raw.strokeWidth)) sh.strokeWidth = raw.strokeWidth;
    if (typeof raw.radius === "number" && Number.isFinite(raw.radius)) sh.radius = raw.radius;
    return sh as unknown as DesignLayer;
  }
  return null;
}

/**
 * Validate a create/update payload. For create, `design` and `name` required.
 * For partial updates, `partial` allows omitting fields.
 */
export function validateDesignTemplatePayload(
  value: unknown,
  partial: boolean,
):
  | { ok: true; data: { name?: string; design?: DesignDoc } }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "JSON body is required" };
  }
  const raw = value as Record<string, unknown>;
  const data: { name?: string; design?: DesignDoc } = {};

  if (raw.name !== undefined) {
    if (!isValidTemplateName(raw.name)) return { ok: false, error: "name must be a non-empty string ≤120 chars" };
    data.name = raw.name.trim();
  } else if (!partial) {
    return { ok: false, error: "name is required" };
  }

  if (raw.design !== undefined) {
    const d = validateDesignDoc(raw.design);
    if (!d.ok) return d;
    data.design = d.design;
  } else if (!partial) {
    return { ok: false, error: "design is required" };
  }

  return { ok: true, data };
}

function rowToDesignTemplate(row: Record<string, unknown>): DesignTemplate {
  let design: DesignDoc = { width: 1275, height: 1650, background: "#ffffff", layers: [] };
  const raw = row.design;
  try {
    // The neon driver may already parse the JSONB column into a JS object; it
    // may also arrive as a JSON string. Handle both.
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.layers)) {
      design = parsed as DesignDoc;
    }
  } catch {
    // keep defaults
  }
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    design,
    width: Number(row.width),
    height: Number(row.height),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Create a new design template owned by the given user. */
export async function createDesignTemplate(
  userId: string,
  payload: { name: string; design: DesignDoc },
): Promise<DesignTemplate> {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const rows = await db`
    INSERT INTO design_templates (id, user_id, name, design, width, height, created_at, updated_at)
    VALUES (${id}, ${userId}, ${payload.name}, ${JSON.stringify(payload.design)}::jsonb, ${payload.design.width}, ${payload.design.height}, ${now}, ${now})
    RETURNING id, user_id, name, design, width, height, created_at, updated_at
  `;
  return rowToDesignTemplate(rows[0] as Record<string, unknown>);
}

/** List the current user's design templates (newest first). */
export async function listDesignTemplates(userId: string): Promise<DesignTemplate[]> {
  const db = getDb();
  const rows = await db`
    SELECT id, user_id, name, design, width, height, created_at, updated_at
    FROM design_templates
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  return (rows as Record<string, unknown>[]).map(rowToDesignTemplate);
}

/** Fetch one design template — only if it belongs to the user. */
export async function getDesignTemplate(userId: string, id: string): Promise<DesignTemplate | null> {
  const db = getDb();
  const rows = await db`
    SELECT id, user_id, name, design, width, height, created_at, updated_at
    FROM design_templates
    WHERE id = ${id} AND user_id = ${userId}
  `;
  if (rows.length === 0) return null;
  return rowToDesignTemplate(rows[0] as Record<string, unknown>);
}

/** Update a design template's name/design. Owner only. */
export async function updateDesignTemplate(
  userId: string,
  id: string,
  patch: { name?: string; design?: DesignDoc },
): Promise<DesignTemplate | null> {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = await db`
    UPDATE design_templates
    SET name = COALESCE(${patch.name ?? null}, name),
        design = COALESCE(${patch.design === undefined ? null : JSON.stringify(patch.design)}::jsonb, design),
        width = COALESCE(${patch.design === undefined ? null : patch.design.width}, width),
        height = COALESCE(${patch.design === undefined ? null : patch.design.height}, height),
        updated_at = ${now}
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, user_id, name, design, width, height, created_at, updated_at
  `;
  if (rows.length === 0) return null;
  return rowToDesignTemplate(rows[0] as Record<string, unknown>);
}

/** Delete a design template. Returns true if a row was deleted. */
export async function deleteDesignTemplate(userId: string, id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db`
    DELETE FROM design_templates
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}
