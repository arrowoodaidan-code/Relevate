/**
 * Saved-property history (owner-requested app updates, Sep 2026).
 *
 * Persists generated marketing content against a real `properties` row so it can
 * be listed, reloaded, and deleted from the /app right-side grid. This also
 * structurally fixes the old /api/generate `generated_content_property_id_fkey`
 * violation: content is now only ever inserted with a property_id that exists
 * (upserted here), never a random UUID.
 *
 * Owner-isolated: every query scopes by user_id. The Neon `properties` /
 * `generated_content` tables already exist (managed directly in Neon); the
 * CREATE TABLE IF NOT EXISTS guards below keep fresh/local databases working.
 *
 * Server-only (uses the eager Neon client from "./db").
 */
import { sql } from "./db";
import { isFullAccessTier } from "./auth";

export interface SavedProperty {
  id: string;
  address: string;
  created_at: string;
  content_types: string[];
}

export interface SavedPropertyDetail extends SavedProperty {
  details: Record<string, unknown> | null;
}

export interface SavedContentRow {
  content_type: string;
  content: string;
  created_at: string;
}

export interface UsageSummary {
  tier: string;
  unlimited: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  label: string;
}

/** Monthly listing caps per tier (Team/demo = unlimited). */
const TIER_MONTHLY_LIMITS: Record<string, number> = {
  starter: 5,
  pro: 20,
};

async function ensureSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS properties (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id),
      address      TEXT NOT NULL,
      details      TEXT,
      created_at   TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS generated_content (
      id            TEXT PRIMARY KEY,
      property_id   TEXT NOT NULL REFERENCES properties(id),
      content_type  TEXT NOT NULL,
      content       TEXT NOT NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
}

/**
 * Upsert the property row (scoped to user + address — the address IS the
 * display name) and upsert the generated content for the given content type
 * (regenerating the same type for the same address updates in place instead
 * of piling up duplicate rows). Returns the property id.
 */
export async function upsertPropertyWithContent(
  userId: string,
  address: string,
  detailsJson: string | null,
  contentType: string,
  content: string,
): Promise<string | null> {
  try {
    await ensureSchema();
    // Find or create the property for this user+address.
    const existing = await sql`
      SELECT id FROM properties WHERE user_id = ${userId} AND address = ${address} LIMIT 1
    `;
    let propertyId: string;
    if (existing && existing.length > 0) {
      propertyId = String((existing[0] as Record<string, unknown>).id);
      if (detailsJson != null) {
        await sql`UPDATE properties SET details = ${detailsJson} WHERE id = ${propertyId}`;
      }
    } else {
      const inserted = await sql`
        INSERT INTO properties (id, user_id, address, details)
        VALUES (${crypto.randomUUID()}, ${userId}, ${address}, ${detailsJson})
        RETURNING id
      `;
      if (!inserted || inserted.length === 0) return null;
      propertyId = String((inserted[0] as Record<string, unknown>).id);
    }
    // Upsert the content row for this property+type (newest content wins).
    const existingContent = await sql`
      SELECT id FROM generated_content WHERE property_id = ${propertyId} AND content_type = ${contentType} LIMIT 1
    `;
    if (existingContent && existingContent.length > 0) {
      const contentId = String((existingContent[0] as Record<string, unknown>).id);
      await sql`UPDATE generated_content SET content = ${content}, created_at = NOW() WHERE id = ${contentId}`;
    } else {
      await sql`
        INSERT INTO generated_content (id, property_id, content_type, content)
        VALUES (${crypto.randomUUID()}, ${propertyId}, ${contentType}, ${content})
      `;
    }
    return propertyId;
  } catch (error) {
    console.error("[properties] upsert failed:", error);
    return null;
  }
}

/** List the user's saved properties, newest first, with available content types. */
export async function listProperties(userId: string): Promise<SavedProperty[]> {
  await ensureSchema();
  const rows = await sql`
    SELECT p.id, p.address, p.created_at,
           COALESCE(array_agg(DISTINCT gc.content_type) FILTER (WHERE gc.content_type IS NOT NULL), ARRAY[]::text[]) AS content_types
    FROM properties p
    LEFT JOIN generated_content gc ON gc.property_id = p.id
    WHERE p.user_id = ${userId}
    GROUP BY p.id, p.address, p.created_at
    ORDER BY p.created_at DESC
    LIMIT 100
  `;
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    address: String(r.address),
    created_at: String(r.created_at),
    content_types: Array.isArray(r.content_types) ? (r.content_types as string[]) : [],
  }));
}

/** Fetch one property (owner only) plus all of its saved content rows. */
export async function getPropertyWithContent(
  userId: string,
  propertyId: string,
): Promise<{ property: SavedPropertyDetail; contents: SavedContentRow[] } | null> {
  await ensureSchema();
  const propRows = await sql`
    SELECT id, address, details, created_at FROM properties
    WHERE id = ${propertyId} AND user_id = ${userId} LIMIT 1
  `;
  if (!propRows || propRows.length === 0) return null;
  const p = propRows[0] as Record<string, unknown>;
  const contentRows = await sql`
    SELECT content_type, content, created_at FROM generated_content
    WHERE property_id = ${propertyId} ORDER BY created_at DESC
  `;
  let details: Record<string, unknown> | null = null;
  if (p.details) {
    try {
      details = JSON.parse(String(p.details)) as Record<string, unknown>;
    } catch {
      details = null;
    }
  }
  return {
    property: {
      id: String(p.id),
      address: String(p.address),
      created_at: String(p.created_at),
      content_types: contentRows.map((c) => String((c as Record<string, unknown>).content_type)),
      details,
    },
    contents: (contentRows as Array<Record<string, unknown>>).map((c) => ({
      content_type: String(c.content_type),
      content: String(c.content),
      created_at: String(c.created_at),
    })),
  };
}

/**
 * Delete a property and all of its generated content (owner only).
 * Returns false when the property doesn't exist for this user.
 */
export async function deleteProperty(userId: string, propertyId: string): Promise<boolean> {
  await ensureSchema();
  const owned = await sql`
    DELETE FROM properties WHERE id = ${propertyId} AND user_id = ${userId} RETURNING id
  `;
  if (!owned || owned.length === 0) return false;
  // Content rows are removed first (FK has no ON DELETE CASCADE in Neon schema).
  await sql`DELETE FROM generated_content WHERE property_id = ${propertyId}`;
  return true;
}

/** Count distinct properties the user saved this calendar month. */
export async function countListingsThisMonth(userId: string): Promise<number> {
  await ensureSchema();
  const rows = await sql`
    SELECT COUNT(*)::int AS n FROM properties
    WHERE user_id = ${userId} AND created_at >= date_trunc('month', NOW())
  `;
  const n = rows && rows.length > 0 ? Number((rows[0] as Record<string, unknown>).n) : 0;
  return Number.isFinite(n) ? n : 0;
}

/** Build the "listings left this month" summary for the user's tier. */
export async function getUsageSummary(tier: string, userId: string): Promise<UsageSummary> {
  const unlimited = isFullAccessTier(tier);
  const limit = unlimited ? null : (TIER_MONTHLY_LIMITS[tier] ?? 5);
  const used = await countListingsThisMonth(userId);
  if (unlimited) {
    return { tier, unlimited: true, used, limit: null, remaining: null, label: "Unlimited listings" };
  }
  const remaining = Math.max((limit ?? 0) - used, 0);
  return {
    tier,
    unlimited: false,
    used,
    limit,
    remaining,
    label: `${remaining} of ${limit} listings left this month`,
  };
}
