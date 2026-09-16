/**
 * Templates service for Relevate.
 * Persists user-created design templates for the template-replica renderer in
 * Neon Postgres, scoped to the owning user.
 *
 * Confirmed persistence contract (coordinated with agent-design-engineer):
 *   - image_data_url  : the uploaded raster template as a base64 data URL (≤4MB)
 *   - width / height  : natural pixel dimensions of the uploaded template
 *                       (flyer vs social is derived from these, not stored)
 *   - style_description: nullable vision-analysis brand/style summary
 *   - regions         : JSONB array of TemplateRegion
 *                       { id, label, kind, x, y, w, h, textColor?, fontFamily?,
 *                         fontWeight?, fontSizePx?, align? } with x/y/w/h
 *                       normalized 0–1, kind text|image, labels headline/
 *                       subheadline/body/bullets/contact/cta/footer/photo/logo/other
 */
import { randomUUID } from "node:crypto";
import { sql as neonSql } from "../db";
import type { TemplateRegion } from "./prompts";

export interface DesignTemplate {
  id: string;
  user_id: string;
  name: string;
  image_data_url: string;
  width: number;
  height: number;
  style_description: string | null;
  regions: TemplateRegion[];
  created_at: string;
  updated_at: string;
}

const VALID_LABELS = new Set(["headline", "subheadline", "body", "bullets", "contact", "cta", "footer", "photo", "logo", "headshot", "mascot", "art", "other"]);
const VALID_FAMILIES = new Set(["serif", "sans-serif", "script", "display", "mono"]);
const VALID_WEIGHTS = new Set(["normal", "bold", "light"]);
const VALID_ALIGNMENTS = new Set(["left", "center", "right"]);

/** Base64 image data URL, png/jpeg/webp, ≤4MB (matches render.ts validImage). */
export function isValidTemplateImage(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^data:image\/(png|jpe?g|webp);base64,/i.test(value) &&
    value.length <= 5_600_000
  );
}

function sanitizeRegions(value: unknown): TemplateRegion[] | null {
  if (!Array.isArray(value) || value.length > 24) return null;
  const ids = new Set<string>();
  const result: TemplateRegion[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(item.id) || ids.has(item.id)) return null;
    if ((item.kind !== "text" && item.kind !== "image") || typeof item.label !== "string" || !VALID_LABELS.has(item.label)) return null;
    const x = Number(item.x), y = Number(item.y), w = Number(item.w), h = Number(item.h);
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w < 0.015 || h < 0.015 || x + w > 1 || y + h > 1) return null;
    if (item.textColor != null && (typeof item.textColor !== "string" || !/^#[0-9a-f]{6}$/i.test(item.textColor))) return null;
    if (item.fontFamily != null && (typeof item.fontFamily !== "string" || !VALID_FAMILIES.has(item.fontFamily))) return null;
    if (item.fontWeight != null && (typeof item.fontWeight !== "string" || !VALID_WEIGHTS.has(item.fontWeight))) return null;
    if (item.align != null && (typeof item.align !== "string" || !VALID_ALIGNMENTS.has(item.align))) return null;
    if (item.fontSizePx != null && (!Number.isFinite(Number(item.fontSizePx)) || Number(item.fontSizePx) < 8 || Number(item.fontSizePx) > 300)) return null;
    ids.add(item.id);
    result.push({
      id: item.id,
      kind: item.kind,
      label: item.label as TemplateRegion["label"],
      x, y, w, h,
      ...(typeof item.textColor === "string" ? { textColor: item.textColor } : {}),
      ...(typeof item.fontFamily === "string" ? { fontFamily: item.fontFamily as TemplateRegion["fontFamily"] } : {}),
      ...(typeof item.fontWeight === "string" ? { fontWeight: item.fontWeight as TemplateRegion["fontWeight"] } : {}),
      ...(typeof item.fontSizePx === "number" ? { fontSizePx: item.fontSizePx } : {}),
      ...(typeof item.align === "string" ? { align: item.align as TemplateRegion["align"] } : {}),
    });
  }
  return result;
}

/** Validate a regions array (the layout spec). Returns the sanitized regions. */
export function validateRegions(value: unknown): { ok: true; regions: TemplateRegion[] } | { ok: false; error: string } {
  const regions = sanitizeRegions(value);
  if (!regions) {
    return { ok: false, error: "regions must be an array of up to 24 valid template regions" };
  }
  return { ok: true, regions };
}

/** Validate a template name. */
export function isValidTemplateName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 100;
}

function isValidDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 64 && value <= 10000;
}

/**
 * Validate a create/update payload. For updates, `partial` allows omitting
 * fields. Returns a normalized payload.
 */
export function validateTemplatePayload(
  value: unknown,
  partial: boolean,
): { ok: true; data: {
  name?: string;
  image_data_url?: string;
  width?: number;
  height?: number;
  style_description?: string | null;
  regions?: TemplateRegion[];
} } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "JSON body is required" };
  }
  const raw = value as Record<string, unknown>;
  const data: {
    name?: string;
    image_data_url?: string;
    width?: number;
    height?: number;
    style_description?: string | null;
    regions?: TemplateRegion[];
  } = {};

  if (raw.name !== undefined || !partial) {
    if (!isValidTemplateName(raw.name)) return { ok: false, error: "name must be a non-empty string up to 100 characters" };
    data.name = (raw.name as string).trim();
  }
  if (raw.image_data_url !== undefined || !partial) {
    if (!isValidTemplateImage(raw.image_data_url)) return { ok: false, error: "image_data_url must be a PNG/JPEG/WebP base64 data URL under 4 MB" };
    data.image_data_url = raw.image_data_url;
  }
  if (raw.width !== undefined || !partial) {
    if (!isValidDimension(raw.width)) return { ok: false, error: "width must be a number between 64 and 10000" };
    data.width = raw.width;
  }
  if (raw.height !== undefined || !partial) {
    if (!isValidDimension(raw.height)) return { ok: false, error: "height must be a number between 64 and 10000" };
    data.height = raw.height;
  }
  if (raw.style_description !== undefined || !partial) {
    if (raw.style_description === null) {
      data.style_description = null;
    } else if (typeof raw.style_description === "string" && raw.style_description.length <= 500) {
      data.style_description = raw.style_description.trim() || null;
    } else {
      return { ok: false, error: "style_description must be a string up to 500 characters or null" };
    }
  }
  if (raw.regions !== undefined || !partial) {
    const regionsCheck = validateRegions(raw.regions);
    if (!regionsCheck.ok) return regionsCheck;
    data.regions = regionsCheck.regions;
  }

  if (partial && Object.keys(data).length === 0) {
    return { ok: false, error: "No updatable fields provided (name, image_data_url, width, height, style_description, or regions)" };
  }
  return { ok: true, data };
}

/** Parse a jsonb value returned by Postgres (may be a string or parsed object). */
function parseRegions(value: unknown): TemplateRegion[] {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as TemplateRegion[]) : [];
    } catch { return []; }
  }
  if (Array.isArray(value)) return value as TemplateRegion[];
  return [];
}

function rowToTemplate(row: Record<string, unknown>): DesignTemplate {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    image_data_url: String(row.image_data_url),
    width: Number(row.width),
    height: Number(row.height),
    style_description: row.style_description == null ? null : String(row.style_description),
    regions: parseRegions(row.regions),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Create a new template owned by the given user. */
export async function createTemplate(
  userId: string,
  payload: {
    name: string;
    image_data_url: string;
    width: number;
    height: number;
    style_description?: string | null;
    regions?: TemplateRegion[];
  },
): Promise<DesignTemplate> {
  const db = neonSql();
  const id = randomUUID();
  const now = new Date().toISOString();
  const rows = await db`
    INSERT INTO templates (id, user_id, name, image_data_url, width, height, style_description, regions, created_at, updated_at)
    VALUES (${id}, ${userId}, ${payload.name}, ${payload.image_data_url}, ${payload.width}, ${payload.height}, ${payload.style_description ?? null}, ${JSON.stringify(payload.regions ?? [])}, ${now}, ${now})
    RETURNING id, user_id, name, image_data_url, width, height, style_description, regions, created_at, updated_at
  `;
  return rowToTemplate(rows[0] as Record<string, unknown>);
}

/** List the current user's templates (newest first). */
export async function listTemplates(userId: string): Promise<DesignTemplate[]> {
  const db = neonSql();
  const rows = await db`
    SELECT id, user_id, name, image_data_url, width, height, style_description, regions, created_at, updated_at
    FROM templates
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  return (rows as Record<string, unknown>[]).map(rowToTemplate);
}

/** Fetch one template — only if it belongs to the user. Returns null otherwise. */
export async function getTemplate(userId: string, id: string): Promise<DesignTemplate | null> {
  const db = neonSql();
  const rows = await db`
    SELECT id, user_id, name, image_data_url, width, height, style_description, regions, created_at, updated_at
    FROM templates
    WHERE id = ${id} AND user_id = ${userId}
  `;
  if (rows.length === 0) return null;
  return rowToTemplate(rows[0] as Record<string, unknown>);
}

/**
 * Update a template's fields. Only fields present in `patch` are updated;
 * updated_at is bumped. Returns null if the template doesn't exist or isn't
 * owned by the user.
 */
export async function updateTemplate(
  userId: string,
  id: string,
  patch: {
    name?: string;
    image_data_url?: string;
    width?: number;
    height?: number;
    style_description?: string | null;
    regions?: TemplateRegion[];
  },
): Promise<DesignTemplate | null> {
  const db = neonSql();
  const now = new Date().toISOString();
  const rows = await db`
    UPDATE templates
    SET name = COALESCE(${patch.name ?? null}, name),
        image_data_url = COALESCE(${patch.image_data_url ?? null}, image_data_url),
        width = COALESCE(${patch.width ?? null}, width),
        height = COALESCE(${patch.height ?? null}, height),
        style_description = CASE WHEN ${patch.style_description !== undefined} THEN ${patch.style_description ?? null} ELSE style_description END,
        regions = COALESCE(${patch.regions === undefined ? null : JSON.stringify(patch.regions)}::jsonb, regions),
        updated_at = ${now}
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, user_id, name, image_data_url, width, height, style_description, regions, created_at, updated_at
  `;
  if (rows.length === 0) return null;
  return rowToTemplate(rows[0] as Record<string, unknown>);
}

/** Delete a template. Returns true if a row was deleted (owned by the user). */
export async function deleteTemplate(userId: string, id: string): Promise<boolean> {
  const db = neonSql();
  const rows = await db`
    DELETE FROM templates
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}
