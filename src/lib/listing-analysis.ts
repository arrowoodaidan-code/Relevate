/**
 * Listing-photo auto-fill (R6): vision-extract property + agent/company details
 * from photos of a listing-service page (Realtor.com / Zillow / brokerage site)
 * so the content-generation form can be pre-filled.
 *
 * Mirrors the existing vision pattern in src/lib/ai.ts (analyzeTemplateRegions /
 * analyzePropertyPhotos): gpt-4o-mini vision, JSON response, in-memory hash cache,
 * never throws — returns null on any failure so callers degrade gracefully.
 * The field names below intentionally match R5's structured-data contract
 * (price/beds/baths/sqft/agentPhone — see /home/team/shared/r5-branded-design-spec.md)
 * so a filled form flows straight into the renderer.
 */

export type ListingConfidence = "high" | "medium" | "low" | "missing";

export interface ListingPropertyFields {
  address: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  keyFeatures: string[];
  description: string;
}

export interface ListingAgentFields {
  name: string;
  phone: string;
  email: string;
  brokerage: string;
}

/** Per-field confidence for every extractable field (keys match the field names). */
export interface ListingConfidenceMap {
  address: ListingConfidence;
  price: ListingConfidence;
  beds: ListingConfidence;
  baths: ListingConfidence;
  sqft: ListingConfidence;
  keyFeatures: ListingConfidence;
  description: ListingConfidence;
  agentName: ListingConfidence;
  agentPhone: ListingConfidence;
  agentEmail: ListingConfidence;
  agentBrokerage: ListingConfidence;
}

export interface ListingAnalysis {
  property: ListingPropertyFields;
  agent: ListingAgentFields;
  confidence: ListingConfidenceMap;
}

const CONFIDENCE_VALUES = new Set<ListingConfidence>([
  "high",
  "medium",
  "low",
  "missing",
]);

const EMPTY_PROPERTY: ListingPropertyFields = {
  address: "",
  price: "",
  beds: "",
  baths: "",
  sqft: "",
  keyFeatures: [],
  description: "",
};

const EMPTY_AGENT: ListingAgentFields = {
  name: "",
  phone: "",
  email: "",
  brokerage: "",
};

const EMPTY_CONFIDENCE: ListingConfidenceMap = {
  address: "missing",
  price: "missing",
  beds: "missing",
  baths: "missing",
  sqft: "missing",
  keyFeatures: "missing",
  description: "missing",
  agentName: "missing",
  agentPhone: "missing",
  agentEmail: "missing",
  agentBrokerage: "missing",
};

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return String(hash);
}

/** Validate a data URL is an image under ~4MB (same rule as property-photo analysis). */
export function validateListingImageDataUrl(dataUrl: string): boolean {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return false;
  if (dataUrl.length > 6_000_000) return false;
  return true;
}

/**
 * Validate a listing-photo `images` payload from an API request.
 * Max 3 images, each an image data URL under ~4MB (same limits as property photos).
 */
export function validateListingImages(
  images: unknown,
): { ok: true; images: string[] } | { ok: false; error: string } {
  if (images == null) return { ok: false, error: "images is required (array of image data URLs)" };
  if (!Array.isArray(images)) {
    return { ok: false, error: "images must be an array of image data URLs" };
  }
  if (images.length === 0) {
    return { ok: false, error: "At least one listing photo is required" };
  }
  if (images.length > 3) {
    return { ok: false, error: "Maximum of 3 listing photos allowed" };
  }
  for (const img of images) {
    if (typeof img !== "string" || !validateListingImageDataUrl(img)) {
      return {
        ok: false,
        error: "Each listing photo must be an image data URL under ~4MB",
      };
    }
  }
  return { ok: true, images: images as string[] };
}

function cleanString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function cleanConfidence(value: unknown): ListingConfidence {
  return typeof value === "string" && CONFIDENCE_VALUES.has(value as ListingConfidence)
    ? (value as ListingConfidence)
    : "missing";
}

function cleanFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (out.length >= 8) break;
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed.length > 60 ? trimmed.slice(0, 60) : trimmed);
  }
  return out;
}

/**
 * Normalize a raw model JSON payload into the stable ListingAnalysis contract.
 * Unknown/malformed fields fall back to empty + "missing" — never fabricated.
 * Returns null when the payload has no readable content at all.
 */
function normalizeListingAnalysis(raw: unknown): ListingAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const propRaw = (root.property ?? {}) as Record<string, unknown>;
  const agentRaw = (root.agent ?? {}) as Record<string, unknown>;
  const confRaw = (root.confidence ?? {}) as Record<string, unknown>;

  const property: ListingPropertyFields = {
    address: cleanString(propRaw.address, 200),
    price: cleanString(propRaw.price, 32),
    beds: cleanString(propRaw.beds, 8),
    baths: cleanString(propRaw.baths, 8),
    sqft: cleanString(propRaw.sqft, 16),
    keyFeatures: cleanFeatures(propRaw.keyFeatures),
    description: cleanString(propRaw.description, 400),
  };
  const agent: ListingAgentFields = {
    name: cleanString(agentRaw.name ?? agentRaw.agentName, 100),
    phone: cleanString(agentRaw.phone ?? agentRaw.agentPhone, 32),
    email: cleanString(agentRaw.email, 120),
    brokerage: cleanString(agentRaw.brokerage, 120),
  };
  const confidence: ListingConfidenceMap = {
    address: cleanConfidence(confRaw.address),
    price: cleanConfidence(confRaw.price),
    beds: cleanConfidence(confRaw.beds),
    baths: cleanConfidence(confRaw.baths),
    sqft: cleanConfidence(confRaw.sqft),
    keyFeatures: cleanConfidence(confRaw.keyFeatures),
    description: cleanConfidence(confRaw.description),
    agentName: cleanConfidence(confRaw.agentName),
    agentPhone: cleanConfidence(confRaw.agentPhone),
    agentEmail: cleanConfidence(confRaw.agentEmail),
    agentBrokerage: cleanConfidence(confRaw.agentBrokerage),
  };

  // A payload is only usable if at least one field was actually read.
  const hasContent =
    property.address ||
    property.price ||
    property.beds ||
    property.baths ||
    property.sqft ||
    property.keyFeatures.length > 0 ||
    property.description ||
    agent.name ||
    agent.phone ||
    agent.email ||
    agent.brokerage;
  if (!hasContent) return null;

  return { property, agent, confidence };
}

// In-memory cache for listing-photo analysis (keyed by joined-image hash).
// Same approach as the template/property-photo caches — analysis is deterministic
// per image set, so repeat uploads skip the vision call.
const listingAnalysisCache = new Map<string, ListingAnalysis>();

/**
 * Analyze listing-service page photo(s) via gpt-4o-mini vision and return the
 * extracted property + agent/company details with per-field confidence.
 * Returns null on any failure (no key, invalid images, API error, unreadable
 * photo) — never throws.
 */
export async function analyzeListingPhotos(
  images: string[],
): Promise<ListingAnalysis | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const validImages = images.filter(validateListingImageDataUrl);
  if (validImages.length === 0) return null;

  const hash = `r6:${simpleHash(validImages.join("|"))}`;
  const cached = listingAnalysisCache.get(hash);
  if (cached) return cached;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `These are photo(s) of a real-estate listing page from a listing service (Realtor.com, Zillow, brokerage site, etc.). Extract the listing details shown on the page. Return ONLY JSON with EXACTLY this shape (no markdown, no commentary):
{
  "property": {
    "address": "full street address, city, state — only if visible",
    "price": "asking price as a display string like $485,000 — only if visible",
    "beds": "number of bedrooms as plain digits like 4 — only if visible",
    "baths": "number of bathrooms as plain digits like 3 (allow .5) — only if visible",
    "sqft": "square footage as digits with optional comma like 2,800 — only if visible",
    "keyFeatures": ["up to 8 short feature phrases visible on the page, each under 40 chars"],
    "description": "the listing description visible in the photo, up to 250 chars — only if visible"
  },
  "agent": {
    "name": "listing agent name — only if visible",
    "phone": "agent phone — only if visible",
    "email": "agent email — only if visible",
    "brokerage": "brokerage/company name — only if visible"
  },
  "confidence": {
    "address": "high|medium|low|missing",
    "price": "high|medium|low|missing",
    "beds": "high|medium|low|missing",
    "baths": "high|medium|low|missing",
    "sqft": "high|medium|low|missing",
    "keyFeatures": "high|medium|low|missing",
    "description": "high|medium|low|missing",
    "agentName": "high|medium|low|missing",
    "agentPhone": "high|medium|low|missing",
    "agentEmail": "high|medium|low|missing",
    "agentBrokerage": "high|medium|low|missing"
  }
}

RULES — CRITICAL:
- NEVER invent or guess values. Extract ONLY text that is actually visible and legible in the photo(s).
- A field that is not visible, cut off, or unreadable must be an EMPTY string (or empty array for keyFeatures) with confidence "missing" — never a placeholder, never "N/A", never an estimate.
- "high": clearly legible and unambiguous. "medium": visible but partially cut/occluded or inferred from strong context. "low": partially legible or uncertain — still provide the best guess in the value field so the user can verify.
- Price must keep its currency display format ($485,000). If only digits are visible (485000), return "$485,000" formatted from what you see — do not invent a different amount.
- If the photo contains multiple listings, extract the PRIMARY listing (the largest/most prominent one).
- Use the photo with the sharpest readable text when multiple photos are provided; combine details across photos if they show the same listing.`,
              },
              ...validImages.map((url) => ({
                type: "image_url",
                image_url: { url, detail: "high" },
              })),
            ],
          },
        ],
        max_tokens: 1600,
      }),
    });

    if (!response.ok) {
      console.error("Listing photo analysis failed:", await response.text());
      return null;
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return null;
    const parsed = JSON.parse(raw) as unknown;
    const analysis = normalizeListingAnalysis(parsed);
    if (!analysis) return null;
    listingAnalysisCache.set(hash, analysis);
    return analysis;
  } catch (err) {
    console.error("Listing photo analysis error:", err);
    return null;
  }
}

/** Fields that are not confidently readable (for the amber "please check" UX). */
export function lowConfidenceFields(analysis: ListingAnalysis): string[] {
  const flags: string[] = [];
  const add = (field: string, value: string, conf: ListingConfidence) => {
    if (conf === "low" || conf === "missing") flags.push(field);
    else if (conf === "medium" && value) flags.push(field);
  };
  add("address", analysis.property.address, analysis.confidence.address);
  add("price", analysis.property.price, analysis.confidence.price);
  add("beds", analysis.property.beds, analysis.confidence.beds);
  add("baths", analysis.property.baths, analysis.confidence.baths);
  add("sqft", analysis.property.sqft, analysis.confidence.sqft);
  add("keyFeatures", analysis.property.keyFeatures.length ? "x" : "", analysis.confidence.keyFeatures);
  add("description", analysis.property.description, analysis.confidence.description);
  add("agentName", analysis.agent.name, analysis.confidence.agentName);
  add("agentPhone", analysis.agent.phone, analysis.confidence.agentPhone);
  add("agentEmail", analysis.agent.email, analysis.confidence.agentEmail);
  add("agentBrokerage", analysis.agent.brokerage, analysis.confidence.agentBrokerage);
  return flags;
}

/** Convenience export for the route files + frontend. */
export const EMPTY_LISTING_ANALYSIS: ListingAnalysis = {
  property: EMPTY_PROPERTY,
  agent: EMPTY_AGENT,
  confidence: EMPTY_CONFIDENCE,
};
