/**
 * AI content generation service for Relevate.
 * Works with mock data when OPENAI_API_KEY is not set,
 * and switches to real OpenAI generation when the key is available.
 */

import type { ContentType, PropertyDetails, TemplateRegion, TemplateRegionLabel } from "./prompts";
import { buildPrompt, buildImagePrompt } from "./prompts";
import {
  scanFairHousing,
  fairHousingStrictRetryBlock,
  fairHousingImageAvoidBlock,
  type FairHousingOutcome,
  type FairHousingScanResult,
} from "./fair-housing";
import { stripBracketPlaceholders } from "./placeholder-guard";
import { randomUUID } from "node:crypto";
import { sql } from "../db";

/**
 * Save generated content to the Neon Postgres database.
 * Runs asynchronously; failures are logged but not thrown.
 */
async function saveToDatabase(
  propertyId: string,
  contentType: ContentType,
  content: string,
): Promise<void> {
  try {
    const db = sql();
    const id = randomUUID();
    await db`
      INSERT INTO generated_content (id, property_id, content_type, content)
      VALUES (${id}, ${propertyId}, ${contentType}, ${content})
    `;
  } catch (error) {
    console.error("Failed to save generated content to database:", error);
  }
}

/**
 * Generate content using mock data (fallback when no API key).
 * Returns realistic-looking sample content for each content type.
 */
function generateMockContent(
  contentType: ContentType,
  details: PropertyDetails,
): string {
  const address = details.address;
  const beds = details.bedrooms;
  const baths = details.bathrooms;
  const sqft = details.squareFeet.toLocaleString();
  const price = `$${details.price.toLocaleString()}`;
  const features = details.keyFeatures.slice(0, 3).join(", ");

  // Bracketed-placeholder rule (task fa4a26ae): the mock templates themselves
  // must not emit placeholders. Signature lines use the SUPPLIED agent
  // details when present and are OMITTED otherwise — an unsupplied detail
  // renders nothing (never a bracket, never an invented value).
  const agentSigLines = [
    details.agentName?.trim(),
    details.agentPhone?.trim(),
    details.agentEmail?.trim(),
  ].filter((s): s is string => Boolean(s));
  const emailSignature = agentSigLines.length > 0
    ? `Best regards,\n${agentSigLines.join("\n")}`
    : `Best regards,`;

  const mocks: Record<ContentType, string> = {
    "property-description": `Welcome to ${address} — a stunning ${beds}-bedroom, ${baths}-bathroom home offering ${sqft} square feet of thoughtfully designed living space. Priced at ${price}, this property exemplifies modern comfort and style.

Step inside to discover an open-concept layout bathed in natural light, with premium finishes throughout. The gourmet kitchen features top-of-the-line appliances, while the spacious living areas provide the perfect setting for both entertaining and everyday living.

The primary suite offers a private retreat with a spa-like ensuite bathroom and generous closet space. Additional bedrooms are well-appointed and versatile for guests, a home office, or a growing family.

Notable features include ${features}. This home is a rare find in today's market — schedule your private showing today to experience everything it has to offer.

About the Agent: Ready to make this your new home? Contact me today to schedule a private tour and see why ${address} is the perfect place for you.`,

    "open-house-flyer": `HEADLINE: Your Dream Home Awaits at ${address}

SUBHEADLINE: ${beds} beds • ${baths} baths • ${sqft} sq ft — Priced at ${price}

HIGHLIGHTS:
• Open-concept living with abundant natural light
• Gourmet kitchen with premium appliances and quartz countertops
• Primary suite with spa-like ensuite bathroom
• ${features}
• Prime location near shopping, dining, and parks
• Move-in ready with recent updates throughout

DIRECTIONS: ${address} — see your preferred maps app for turn-by-turn directions.

CONTACT: For more information or to RSVP, contact your agent today. Light refreshments will be served.`,

    "social-media-post": `INSTAGRAM:
📍 Just listed: ${address} 🏡✨

${beds} beds • ${baths} baths • ${sqft} sq ft
${price}

This stunning home features ${features} — perfect for your next chapter!

📅 Schedule a private tour today — link in bio!

#JustListed #RealEstate #HomeForSale #DreamHome #HouseHunting

FACEBOOK:
🏡 Just listed and ready for its new owners!

${address} is now available and we couldn't be more excited to share it with you. This ${beds}-bed, ${baths}-bath beauty offers ${sqft} of living space with features you'll love: ${features}.

Priced at ${price}, this home is a fantastic opportunity in today's market. Whether you're a first-time buyer or looking to upgrade, this property checks all the boxes.

📞 Message me for a private showing or stop by our open house this weekend!

TWITTER/X:
1. 🏡 Just listed: ${address} — ${beds} beds, ${baths} baths, ${sqft} sq ft. ${price}. ${features}. DM for details!

2. New on the market! ✨ ${address} — Move-in ready with ${features}. Schedule your tour today. ${price}

3. Hot new listing alert! 🔥 ${address} — ${beds}BR/${baths}BA, ${sqft} sq ft. Don't miss this one! ${price}`,

    "email-campaign": `SUBJECT LINE OPTIONS:
1. 🏡 Just Listed: ${address} — ${beds} Beds, ${baths} Baths
2. Your Dream Home at ${address} — Available Now
3. ✨ New Listing: ${price} — ${beds} Bedroom Home in Prime Location

PREHEADER: ${beds} beds • ${baths} baths • ${sqft} sq ft — Schedule your tour today

EMAIL BODY:

Hi there,

I'm excited to share this stunning new listing — ${address} — now available at ${price}!

This ${beds}-bedroom, ${baths}-bathroom home offers ${sqft} square feet of beautifully designed living space. Here's what makes it special:

• ${details.keyFeatures[0] || "Open-concept living areas"}
• ${details.keyFeatures[1] || "Gourmet kitchen with premium finishes"}
• ${details.keyFeatures[2] || "Spacious primary suite with ensuite bath"}
• Prime location with easy access to amenities

FEATURED: The heart of this home is the stunning kitchen — perfect for entertaining guests or enjoying quiet family meals.

I'm hosting an open house this weekend and would love to see you there. Can't make it? I'm happy to schedule a private tour at your convenience.

Ready to take the next step? Hit reply or click the button below to book your showing.

Schedule a tour — reply to this email to book a time.

${emailSignature}

P.S. Open house this Sunday from 2-4pm — reply for the address and private showing times.`,

    "listing-summary": `${address} presents a remarkable opportunity for buyers seeking a ${beds}-bedroom, ${baths}-bathroom home offering ${sqft} square feet of living space at ${price}. This property stands out for its exceptional layout, premium finishes, and move-in-ready condition. The layout suits buyers who need modern comfort with practical functionality — flexible living space, ample storage, and low-maintenance upkeep. Key selling points include ${features}, along with the home's prime location near shopping, dining, and excellent schools. Priced competitively for the current market, this home offers strong value given its condition, features, and location — making it an attractive option for buyers who want quality without compromise.`,
  };

  return mocks[contentType] || "Content generation unavailable for this type.";
}

/**
 * Generate content using OpenAI API.
 * Requires OPENAI_API_KEY to be set in the environment.
 */
async function generateWithOpenAI(
  contentType: ContentType,
  details: PropertyDetails,
  fairHousingRetry?: FairHousingScanResult,
): Promise<string> {
  // Analyze an uploaded raster template before generation. The region map is
  // cached and becomes a concise-copy constraint in buildPrompt().
  if (details.templateImage && !details.templateRegions?.length) {
    try {
      const regions = await analyzeTemplateRegions(details.templateImage);
      if (regions) details.templateRegions = regions;
    } catch (err) {
      console.error("Template region analysis failed, continuing without regions:", err);
    }
  }

  // Analyze uploaded property photos (if any) and weave the visual factsheet
  // into the prompt so copy describes the REAL home. Failure never blocks
  // generation — log and continue without visuals.
  if (details.images?.length) {
    try {
      const visuals = await analyzePropertyPhotos(details.images);
      if (visuals) details.propertyVisuals = visuals;
    } catch (err) {
      console.error("Property photo analysis failed, continuing without visuals:", err);
    }
  }

  // Analyze agent logo/headshot (if any) and weave the extracted brand identity
  // into the prompt. Failure never blocks generation.
  if (details.logoImage || details.agentPhoto) {
    try {
      const identity = await analyzeAgentIdentity(details.logoImage, details.agentPhoto);
      if (identity) details.agentIdentity = identity;
    } catch (err) {
      console.error("Agent identity analysis failed, continuing without branding:", err);
    }
  }

  let { systemPrompt, userPrompt } = buildPrompt(contentType, details);
  // Fair Housing strict retry: when the first draft tripped the risk-pattern
  // scan, harden both prompts and name the exact phrases that were caught.
  if (fairHousingRetry && !fairHousingRetry.clean) {
    systemPrompt = systemPrompt + fairHousingStrictRetryBlock(fairHousingRetry.hits);
    userPrompt =
      userPrompt +
      `\n\nSTRICT REWRITE REQUIRED: your previous draft contained these risk phrases: ${fairHousingRetry.hits
        .map((h) => `"${h.matched}"`)
        .join(", ")}. Do not include them or anything similar in any section of the output.`;
  }

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} — ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

/**
 * Deterministic enforcement of the owner's 5-hashtag cap (Aug 13) for social
 * media posts. The model is prompted to stay within 5 hashtags total; this
 * guarantees the cap regardless of model or mock output by keeping the first
 * `max` hashtag tokens in document order and removing every later one.
 */
function capHashtags(content: string, max = 5): string {
  const hashtagRe = /#[\p{L}\p{N}_]+/gu;
  const matches = content.match(hashtagRe);
  if (!matches || matches.length <= max) return content;
  let seen = 0;
  const trimmed = content.replace(hashtagRe, (token) => {
    seen += 1;
    return seen <= max ? token : "";
  });
  // Collapse whitespace left behind by removed tokens, keep newlines intact.
  return trimmed
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+(\n)/g, "$1")
    .trimEnd();
}

/**
 * Generate marketing content for a property listing.
 * Uses OpenAI if OPENAI_API_KEY is set, otherwise returns mock data.
 * Saves generated content to the team database.
 */
export async function generateContent(
  contentType: ContentType,
  details: PropertyDetails,
): Promise<{
  content: string;
  source: "openai" | "mock";
  fairHousing?: FairHousingOutcome;
}> {
  let content: string;
  let source: "openai" | "mock";

  if (process.env.OPENAI_API_KEY) {
    try {
      content = await generateWithOpenAI(contentType, details);
      source = "openai";
    } catch (error) {
      console.error("OpenAI generation failed, falling back to mock:", error);
      content = generateMockContent(contentType, details);
      source = "mock";
    }
  } else {
    content = generateMockContent(contentType, details);
    source = "mock";
  }

  // Owner directive (Aug 13): cap hashtags in generated social posts at 5 total.
  // Enforced here (not just prompted) so the cap holds for model AND mock output.
  if (contentType === "social-media-post") {
    content = capHashtags(content);
  }
  // Bracketed-placeholder guard (task fa4a26ae): the same deterministic
  // enforcement pattern as the hashtag cap. Prompted rules alone did not stop
  // "[Your Phone Number]"/"[Your Email Address]" from reaching a rendered
  // flyer, so every generated output (model AND mock) is scrubbed here —
  // placeholder text never reaches the client textarea, and an unsupplied
  // detail simply renders nothing (never invented, see placeholder-guard.ts).
  content = stripBracketPlaceholders(content);

  // Save to database (fire-and-forget — don't block the response)
  // Use a placeholder property ID from details or generate one
  const propertyId = details.address
    ? randomUUID()
    : randomUUID();
  saveToDatabase(propertyId, contentType, content);

  // Fair Housing post-generation check: scan the generated copy for risk
  // patterns. On a hit, retry ONCE with the strict instruction naming the
  // phrases. A still-flagged result is returned WITH the flag — never
  // silently shipped (task 01bc80ec).
  const firstScan = scanFairHousing(content);
  if (firstScan.clean) {
    return { content, source };
  }
  console.warn(
    "[fair-housing] risk patterns in generated %s: %s",
    contentType,
    firstScan.hits.map((h) => h.matched).join(" | "),
  );
  if (process.env.OPENAI_API_KEY && source === "openai") {
    try {
      const retryContent = await generateWithOpenAI(contentType, details, firstScan);
      const capped = contentType === "social-media-post" ? capHashtags(retryContent) : retryContent;
      const retryScan = scanFairHousing(capped);
      if (retryScan.clean) {
        return {
          content: capped,
          source,
          fairHousing: { flagged: false, repaired: true, hits: firstScan.hits },
        };
      }
      console.warn("[fair-housing] strict retry still flagged — returning flagged content");
    } catch (retryErr) {
      console.error("[fair-housing] strict retry failed, returning flagged content:", retryErr);
    }
  }
  return { content, source, fairHousing: { flagged: true, hits: firstScan.hits } };
}

/**
 * Simple hash for caching template analysis results.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return String(hash);
}

// In-memory cache for template image analysis results
const templateCache = new Map<string, string>();
const templateRegionCache = new Map<string, TemplateRegion[]>();

const regionLabels = new Set<TemplateRegionLabel>([
  "headline", "subheadline", "body", "bullets", "contact", "cta", "footer",
  "photo", "logo", "headshot", "mascot", "art", "other",
]);
const regionFontFamilies = new Set<NonNullable<TemplateRegion["fontFamily"]>>([
  "serif", "sans-serif", "script", "display", "condensed", "mono",
]);
const regionWeights = new Set<NonNullable<TemplateRegion["fontWeight"]>>(["normal", "bold", "light"]);
const regionAlignments = new Set<NonNullable<TemplateRegion["align"]>>(["left", "center", "right"]);
const regionTransforms = new Set<NonNullable<TemplateRegion["textTransform"]>>(["uppercase", "small-caps", "none"]);

function normalizeTemplateRegions(value: unknown): TemplateRegion[] {
  if (!Array.isArray(value)) return [];
  const used = new Set<string>();
  const regions: TemplateRegion[] = [];
  for (const raw of value.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const kind = item.kind === "text" || item.kind === "image" ? item.kind : null;
    const x = Number(item.x);
    const y = Number(item.y);
    const w = Number(item.w);
    const h = Number(item.h);
    if (!kind || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) continue;
    if (x < 0 || y < 0 || w <= 0.015 || h <= 0.015 || x + w > 1.001 || y + h > 1.001) continue;
    const originalId = typeof item.id === "string" ? item.id.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) : "";
    let id = originalId || `${kind}-${regions.length + 1}`;
    while (used.has(id)) id = `${id}-${regions.length + 1}`;
    used.add(id);
    const label = typeof item.label === "string" && regionLabels.has(item.label as TemplateRegionLabel)
      ? item.label as TemplateRegionLabel
      : kind === "image" ? "photo" : "other";
    const color = typeof item.textColor === "string" && /^#[0-9a-f]{6}$/i.test(item.textColor)
      ? item.textColor
      : undefined;
    const family = typeof item.fontFamily === "string" && regionFontFamilies.has(item.fontFamily as NonNullable<TemplateRegion["fontFamily"]>)
      ? item.fontFamily as TemplateRegion["fontFamily"]
      : undefined;
    const weight = typeof item.fontWeight === "string" && regionWeights.has(item.fontWeight as NonNullable<TemplateRegion["fontWeight"]>)
      ? item.fontWeight as TemplateRegion["fontWeight"]
      : undefined;
    const align = typeof item.align === "string" && regionAlignments.has(item.align as NonNullable<TemplateRegion["align"]>)
      ? item.align as TemplateRegion["align"]
      : undefined;
    // Typography fidelity fields (style/color workstream): italic is boolean,
    // letterSpacingPx is an integer px (rounded, clamped −20…200 so it can
    // never crash the renderer), textTransform is a strict enum.
    const italic = typeof item.italic === "boolean" ? item.italic : undefined;
    const letterSpacingRaw = Number(item.letterSpacingPx);
    const letterSpacingPx = Number.isFinite(letterSpacingRaw)
      ? Math.max(-20, Math.min(200, Math.round(letterSpacingRaw)))
      : undefined;
    const transform = typeof item.textTransform === "string" && regionTransforms.has(item.textTransform as NonNullable<TemplateRegion["textTransform"]>)
      ? item.textTransform as TemplateRegion["textTransform"]
      : undefined;
    const fontSize = Number(item.fontSizePx);
    // Round then clamp so the box can never fail the renderer's sanitizeRegions
    // (which requires w/h >= 0.015 and x+w <= 1, y+h <= 1). The renderer re-
    // validates every saved/analyzed region before compositing, so a box that
    // rounds to x+w > 1 would 400 on render.
    const rx = Math.round(x * 10000) / 10000;
    const ry = Math.round(y * 10000) / 10000;
    const rw = Math.round(w * 10000) / 10000;
    const rh = Math.round(h * 10000) / 10000;
    const cx = Math.min(Math.max(rx, 0), 0.985);
    const cy = Math.min(Math.max(ry, 0), 0.985);
    const cw = Math.min(Math.max(rw, 0.015), Math.max(0.015, 1 - cx));
    const ch = Math.min(Math.max(rh, 0.015), Math.max(0.015, 1 - cy));
    regions.push({
      id,
      label,
      kind,
      x: cx,
      y: cy,
      w: cw,
      h: ch,
      ...(color ? { textColor: color } : {}),
      ...(family ? { fontFamily: family } : {}),
      ...(weight ? { fontWeight: weight } : {}),
      ...(italic !== undefined ? { italic } : {}),
      ...(letterSpacingPx !== undefined ? { letterSpacingPx } : {}),
      ...(transform ? { textTransform: transform } : {}),
      ...(Number.isFinite(fontSize) && fontSize >= 8 && fontSize <= 300 ? { fontSizePx: fontSize } : {}),
      ...(align ? { align } : {}),
    });
  }
  return regions;
}

/**
 * Analyze a template image via GPT-4o-mini vision to extract a style sheet.
 * Results are cached in-memory by image content hash.
 */
export async function analyzeTemplateImage(
  imageDataUrl: string,
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const hash = simpleHash(imageDataUrl);
  const cached = templateCache.get(hash);
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
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this real estate marketing template image. Describe the visual style concisely: colors (hex if discernible), fonts/general typography feel, layout structure, overall vibe, and imagery style. Keep it under 100 words. This will be used as a style guide for generating matching content.",
              },
              {
                type: "image_url",
                image_url: { url: imageDataUrl, detail: "low" },
              },
            ],
          },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      console.error("Template analysis failed:", await response.text());
      return null;
    }

    const data = await response.json();
    const styleSheet = data.choices?.[0]?.message?.content?.trim();
    if (styleSheet) {
      templateCache.set(hash, styleSheet);
    }
    return styleSheet || null;
  } catch (err) {
    console.error("Template analysis error:", err);
    return null;
  }
}

/**
 * Detect the small set of editable text/photo boxes in a raster marketing
 * template. Coordinates are normalized so the renderer can preserve the base
 * image at any output size. Failure is intentionally non-blocking: users can
 * still use the standard designed-graphic path.
 */
export async function analyzeTemplateRegions(imageDataUrl: string): Promise<TemplateRegion[] | null> {
  if (!process.env.OPENAI_API_KEY || !validateImageDataUrl(imageDataUrl)) return null;
  // "v3:" version prefix — the prompt now (a) runs on gpt-4o and (b) enumerates
  // EVERY distinct image object as its own region (Canva-style per-object
  // replacement) with extended image labels (photo/logo/headshot/mascot/art);
  // entries cached by an older prompt shape must not be served to a newer
  // consumer.
  const hash = `v3:${simpleHash(imageDataUrl)}`;
  const cached = templateRegionCache.get(hash);
  if (cached) return cached;

  // Hardening (e51c4b81): gpt-4o occasionally returns an EMPTY/bad region list
  // (transient 0-region call). Retry up to 3 times before giving up so the
  // analysis is not a coin-flip.
  for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this raster real-estate marketing template for an exact-replica editor. Return ONLY JSON with this shape: {"regions":[{"id":"headline-1","label":"headline","kind":"text","x":0.1,"y":0.1,"w":0.8,"h":0.1,"textColor":"#f2e9d0","fontFamily":"serif","fontWeight":"bold","italic":false,"letterSpacingPx":2,"textTransform":"uppercase","fontSizePx":64,"align":"center"}]}.\n\nIdentify up to 24 editable regions. Every coordinate must be a fraction of the full image, 0 through 1. kind is exactly text or image. label is one of headline, subheadline, body, bullets, contact, cta, footer, photo, logo, headshot, mascot, art, other.\n\nFor EVERY text region, inspect the lettering precisely and return all of these:\n- textColor: the EXACT hex color of the glyphs, as #rrggbb. Look at the solid core of the letters, never the anti-aliased edges or the background.\n- fontFamily: one of serif, sans-serif, script, display, condensed, mono — the closest visual category of the typeface. Prefer the DISTINCTIVE category when it clearly applies: script for calligraphy/cursive/brush lettering (swashes, connected strokes, flowing caps); display for elegant high-contrast headline serifs with thin hairlines (Didot, Bodoni, Playfair, Trajan-style capitals); condensed for tall narrow tightly-set faces where glyphs are visibly narrower than normal (Bebas, Oswald, Impact-style). Use serif for ordinary book/body serifs (Times, Georgia, Garamond), sans-serif for plain grotesque/geometric sans (Helvetica, Arial, Futura), mono only for genuinely monospaced typewriter/code lettering.\n- fontWeight: normal, bold, or light, judged from the actual stroke thickness of the letters.\n- italic: true ONLY if the lettering is genuinely slanted (italic/oblique typeface), otherwise false.\n- letterSpacingPx: the horizontal tracking between characters in source-image pixels — negative for tight headline tracking, near 0 for normal body text, positive for wide, letter-spaced uppercase labels. Estimate it from the visible gaps between letters.\n- textTransform: uppercase if the text is rendered in ALL CAPS, small-caps if capital forms are used at lowercase body size, otherwise none.\n- fontSizePx: the approximate cap height of the lettering in source-image pixels.\n- align: left, center, or right, relative to the text's own block.\n\nIMAGE OBJECTS — enumerate EVERY distinct replaceable image as its OWN image region (Canva-style per-object edit): the main/hero photo, a company logo, a person/headshot, and any mascot or illustration/art each get a SEPARATE region with its own id and x/y/w/h. When a foreground object (logo, headshot, mascot) sits ON TOP of a background/hero photo, still return them as DISTINCT boxes — the photo box may cover the full canvas, and the foreground object gets its own smaller box over it. Label each image region: photo (hero/main photo or any standalone photo), logo (company/brand mark), headshot (a person/portrait/face), mascot (a character/cartoon/object illustration), or art (decorative illustration/icon/texture art). For a full-bleed background photo, one 'photo' region covering the canvas is fine — but ALSO list each distinct object sitting on it separately. Do NOT emit an image region for a plain flat/gradient background with no replaceable object. Include text blocks even if their wording is unknown. Do not include anything outside the image bounds.`,
            },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ],
        }],
        max_tokens: 3200,
      }),
    });
    if (!response.ok) {
      console.error("Template region analysis failed:", await response.text());
      if (attempt < 2) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      return null;
    }
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") {
      if (attempt < 2) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      return null;
    }
    const parsed = JSON.parse(raw) as { regions?: unknown };
    const regions = normalizeTemplateRegions(parsed.regions);
    if (!regions.length) {
      if (attempt < 2) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      return null;
    }
    // Second pass (owner-mandated per-object separation, Aug 19): a single pass
    // can MISS a foreground image sitting ON a background/hero photo (e.g. a
    // logo over the hero). If any image region was found, run a focused second
    // gpt-4o call that hunts specifically for overlapping foreground objects,
    // then merge only genuinely-new boxes (dedup near-identical >=55% overlap).
    let merged = [...regions];
    // TEXT-RECALL SECOND PASS (fix b91769d7, detection reliability): the first
    // pass is a single gpt-4o call that occasionally MISSES an entire text line
    // (measured: a real lettering band between the top photo and the body at
    // y≈0.33..0.39 was detected as nothing — its lettering then survived in the
    // "erased" base and the user's new text landed on top of it). Run a focused
    // gpt-4o call that re-enumerates EVERY text block/line independently, then
    // merge only genuinely-new coverage: skip boxes that duplicate an existing
    // text region (IoU ≥ 55%) or that sit substantially over a replaceable image
    // region (>50% of the box inside an image → it's a photo caption/logo, not
    // erasure-worthy lettering, and white-filling it would eat the photo).
    try {
      const resp2 = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o",
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: [
            { type: "text", text: `A first vision pass found this real-estate flyer's editable regions but may have MISSED some TEXT. Second TEXT pass — carefully enumerate EVERY TEXT BLOCK OR LINE in this image, WITHOUT EXCEPTION: headline, subheadline, body paragraphs, bullet lines, address/directions, open-house details, agent contact, footer, and any other lettering. Re-check every row of the image top to bottom; a previous pass can skip a text line sitting between a top photo and the body. Return them all as text regions in json format, each with a TIGHT box that fully encloses its lettering. Shape: {"regions":[{"id":"text-7","label":"body","kind":"text","x":0.1,"y":0.33,"w":0.8,"h":0.06}]}. Coordinates are fractions of the full image, 0–1. label one of headline, subheadline, body, bullets, contact, cta, footer, other. Do NOT include photos or logos as text. Include a text region for EVERY text line.` },
            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
          ] }],
          max_tokens: 2500,
        }),
      });
      if (resp2.ok) {
        const d2 = await resp2.json();
        const rawh2 = d2.choices?.[0]?.message?.content;
        if (typeof rawh2 === "string") {
          const more = normalizeTemplateRegions(((JSON.parse(rawh2) as { regions?: unknown }).regions) ?? []);
          for (const r of more) {
            if (r.kind !== "text") continue;
            // Dedup: skip if it largely duplicates an existing text region.
            const dupText = merged.some((m) => {
              if (m.kind !== "text") return false;
              const ix = Math.max(0, Math.min(m.x + m.w, r.x + r.w) - Math.max(m.x, r.x));
              const iy = Math.max(0, Math.min(m.y + m.h, r.y + r.h) - Math.max(m.y, r.y));
              const inter = ix * iy, a = m.w * m.h, b = r.w * r.h, union = a + b - inter;
              return union > 0 && inter / union > 0.55;
            });
            if (dupText) continue;
            // Skip if >50% of the box sits over a replaceable image region
            // (white-filling it would erase a photo, caption, or logo).
            const area = r.w * r.h;
            let overImg = false;
            for (const m of merged) {
              if (m.kind !== "image") continue;
              const ix = Math.max(0, Math.min(m.x + m.w, r.x + r.w) - Math.max(m.x, r.x));
              const iy = Math.max(0, Math.min(m.y + m.h, r.y + r.h) - Math.max(m.y, r.y));
              if (area > 0 && (ix * iy) / area > 0.5) { overImg = true; break; }
            }
            if (overImg) continue;
            merged.push(r);
          }
        }
      }
    } catch (e) { console.error("Template text-recall pass error:", e); }
    if (regions.some((r) => r.kind === "image")) {
      try {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: [
              { type: "text", text: `A first pass found this template's main image and text regions. Second pass — find any IMAGE objects that sit ON TOP of / overlap a background photo or pattern and were NOT yet returned, especially: a company logo or badge sitting in a corner or over the hero photo, a headshot/portrait, or a mascot/illustration placed over a photo. Look carefully at every corner and overlay of the hero photo and any photo for these smaller objects. Return ONLY these foreground image objects as NEW image regions the first pass missed. Shape: {"regions":[{"id":"logo-2","label":"logo","kind":"image","x":0.8,"y":0.05,"w":0.15,"h":0.1}]}. label is one of photo, logo, headshot, mascot, art; coordinates are fractions 0–1; max 8 regions. Do NOT repeat an object already represented by a larger background photo's single full-crop box and do NOT return the hero photo itself — only objects that need their own replaceable box on top of another image. If none, return {"regions":[]}.` },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
            ]}],
            max_tokens: 1200,
          }),
        });
        if (resp.ok) {
          const d = await resp.json();
          const rawh = d.choices?.[0]?.message?.content;
          if (typeof rawh === "string") {
            const extra = normalizeTemplateRegions(((JSON.parse(rawh) as { regions?: unknown }).regions) ?? []);
            for (const r of extra) {
              if (r.kind !== "image") continue;
              const dup = merged.some((m) => {
                if (m.kind !== "image") return false;
                const ix = Math.max(0, Math.min(m.x + m.w, r.x + r.w) - Math.max(m.x, r.x));
                const iy = Math.max(0, Math.min(m.y + m.h, r.y + r.h) - Math.max(m.y, r.y));
                const inter = ix * iy, a = m.w * m.h, b = r.w * r.h, union = a + b - inter;
                return union > 0 && inter / union > 0.55;
              });
              if (!dup) merged.push(r);
            }
          }
        }
      } catch (e) { console.error("Template region refine pass error:", e); }
    }
    // FIX 1 (e51c4b81, deterministic row-union + merge): gpt-4o splits full-width
    // lettering into left/right (or duplicated stacked) boxes and leaves the
    // space between them un-erased → ghost. Do a deterministic geometric pass
    // (no LLM): merge near-same-line boxes, then widen each text box to the full
    // horizontal union of all text boxes on its row band (bounded to the canvas
    // and to image-box insets). Result: every lettering row is ONE full-width box.
    // Also FIX 4 (ai.ts part): drop an outsized secondary image box that swallows
    // text (keep the text).
    merged = deterministicRegionFix(merged);
    templateRegionCache.set(hash, merged);
    return merged;
  } catch (err) {
    console.error("Template region analysis error:", err);
    if (attempt < 2) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    return null;
  }
  }
  return null;
}

/**
 * FIX 1 + FIX 4 (e51c4b81): deterministic geometric post-pass on detected
 * regions (no LLM — run-to-run stable). Merges same-line/duplicate text boxes,
 * widens each text row to the full horizontal union of its text boxes, and
 * drops outsized secondary image boxes that swallow text.
 */
function deterministicRegionFix(regions: TemplateRegion[]): TemplateRegion[] {
  const imgs = regions.filter((r) => r.kind === "image");
  let text = regions.filter((r) => r.kind === "text");
  if (!text.length) return regions;

  // --- FIX 4 (ai.ts part) first: drop outsized image boxes that swallow text ---
  // A secondary image box (>0.25×0.25 of canvas, not a full-bleed `photo`) that
  // overlaps a text box by >50% of its own area is a detector error (e.g.
  // photo-2 0.65×0.28 trapping the contact text). Keep the text, drop the image.
  const kept: TemplateRegion[] = [];
  for (const im of imgs) {
    const big = im.w > 0.25 && im.h > 0.25;
    const fullBleedPhoto = im.label === "photo" && im.w > 0.85 && im.h > 0.85;
    let swallowsText = false;
    if (big && !fullBleedPhoto) {
      const iarea = im.w * im.h;
      for (const t of text) {
        const ix = Math.max(0, Math.min(im.x + im.w, t.x + t.w) - Math.max(im.x, t.x));
        const iy = Math.max(0, Math.min(im.y + im.h, t.y + t.h) - Math.max(im.y, t.y));
        if (iarea > 0 && (ix * iy) / iarea > 0.5) { swallowsText = true; break; }
      }
    }
    if (!swallowsText) kept.push(im);
  }

  // --- FIX 1: widen each text row to the full horizontal union, then merge
  // same-line boxes into ONE box per row ---
  // Widen pass: for each text box, if other text boxes share its row band,
  // extend it to the horizontal union of all of them (bounded to canvas and
  // image-box insets so we never white-fill a photo). This kills the bullet
  // ghost: under-width boxes covering only x0.05–0.45 of a full-width line
  // become the full row, so the eraser covers the right-hand lettering too.
  text = text.map((r) => {
    const rTop = r.y, rBot = r.y + r.h;
    let minX = r.x, maxX = r.x + r.w;
    for (const o of text) {
      if (o === r) continue;
      const gap = Math.min(r.h, o.h) * 0.5;
      if (o.y - gap <= rBot && o.y + o.h + gap >= rTop) {
        if (o.x < minX) minX = o.x;
        if (o.x + o.w > maxX) maxX = o.x + o.w;
      }
    }
    let newX = Math.max(0, minX);
    let newW = Math.min(1, maxX) - newX;
    if (newW < 0.015) return r;
    // Respect image insets: clamp the widened box so it doesn't extend far over
    // a replaceable image (a full-width line may still legitimately overlap a
    // photo's edge slightly, so only clamp hard overlap).
    let w = newW;
    for (const im of kept) {
      const ix = Math.max(0, Math.min(im.x + im.w, newX + newW) - Math.max(im.x, newX));
      const rarea = newW * r.h;
      if (rarea > 0 && (ix * Math.max(0, Math.min(im.y + im.h, rBot) - Math.max(im.y, rTop))) / rarea > 0.6) {
        // Too much of this text row sits over an image → keep original width.
        return r;
      }
    }
    return { ...r, x: Math.round(newX * 10000) / 10000, w: Math.round(w * 10000) / 10000 };
  });

  // Merge pass (AFTER widening, so same-row boxes now share the full row width
  // and visibly overlap). Two boxes are the SAME line/row when their vertical
  // overlap is ≥40% of the smaller box's height (strong same-row signal) and
  // their x-ranges touch or overlap — collapse them into one union box, keeping
  // the larger fontSizePx and a sampled textColor. The 40% threshold merges the
  // detector's duplicate stacked boxes (body/cta/text-4/text-8 in the dense
  // band) yet spares genuinely adjacent rows (a headline at y0.10–0.20 and a
  // sub-line at 0.18–0.25 only share 2/7 → stay separate). Single-column
  // templates (this product's scope) collapse to exactly one full-width box per
  // lettering row.
  let changed = true;
  while (changed) {
    changed = false;
    outer:
    for (let i = 0; i < text.length; i++) {
      for (let j = i + 1; j < text.length; j++) {
        const a = text[i], b = text[j];
        const aBot = a.y + a.h, bBot = b.y + b.h;
        const yOv = Math.max(0, Math.min(aBot, bBot) - Math.max(a.y, b.y));
        const hMin = Math.min(a.h, b.h);
        if (hMin <= 0 || yOv / hMin < 0.4) continue;
        const aRight = a.x + a.w, bRight = b.x + b.w;
        const touch = a.x <= bRight && b.x <= aRight;
        if (!touch) continue;
        // Merge b into a (union).
        const nx = Math.min(a.x, b.x);
        const ny = Math.min(a.y, b.y);
        const nxr = Math.max(aRight, bRight);
        const nyr = Math.max(aBot, bBot);
        text[i] = {
          ...a,
          x: nx,
          y: ny,
          w: Math.min(1, nxr - nx),
          h: Math.min(1, nyr - ny),
          ...(a.fontSizePx !== undefined && b.fontSizePx !== undefined && b.fontSizePx > a.fontSizePx
            ? { fontSizePx: b.fontSizePx } : {}),
          ...(b.textColor ? { textColor: b.textColor } : {}),
        };
        text.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }

  return [...text, ...kept];
}

/**
 * Validate that a data URL is a reasonable size (under ~4MB) and is an image.
 */
export function validateImageDataUrl(dataUrl: string): boolean {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return false;
  // Rough check: base64 is ~33% larger than binary, so 4MB binary ≈ 5.3MB base64
  if (dataUrl.length > 6_000_000) return false;
  return true;
}

// In-memory cache for property photo analysis results (keyed by joined-image hash)
const propertyPhotoCache = new Map<string, string>();

/**
 * Analyze property photos via GPT-4o-mini vision to extract a visual factsheet.
 * One call with ALL photos (detail: "low"). Results cached by content hash.
 * Returns null on any failure — never throws.
 */
export async function analyzePropertyPhotos(
  images: string[],
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY || images.length === 0) return null;

  const validImages = images.filter(validateImageDataUrl);
  if (validImages.length === 0) return null;

  const hash = simpleHash(validImages.join("|"));
  const cached = propertyPhotoCache.get(hash);
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
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "These are photos of a real property listing. Produce a concise visual factsheet (under 150 words, plain text) covering: exterior architectural style, siding/roof materials, landscaping and curb appeal, visible interior finishes (floors, kitchen, baths), overall condition, and standout features. This factsheet will be used to write accurate listing copy and generate matching images.",
              },
              ...validImages.map((url) => ({
                type: "image_url",
                image_url: { url, detail: "low" },
              })),
            ],
          },
        ],
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      console.error("Property photo analysis failed:", await response.text());
      return null;
    }

    const data = await response.json();
    const factsheet = data.choices?.[0]?.message?.content?.trim();
    if (factsheet) {
      propertyPhotoCache.set(hash, factsheet);
    }
    return factsheet || null;
  } catch (err) {
    console.error("Property photo analysis error:", err);
    return null;
  }
}

/**
 * Validate a property `images` payload from an API request.
 * Returns the sanitized array (or empty) on success, or a clean error string.
 */
export function validatePropertyImages(
  images: unknown,
): { ok: true; images: string[] } | { ok: false; error: string } {
  if (images == null) return { ok: true, images: [] };
  if (!Array.isArray(images)) {
    return { ok: false, error: "Property photos must be an array of image data URLs" };
  }
  if (images.length > 3) {
    return { ok: false, error: "Maximum of 3 property photos allowed" };
  }
  for (const img of images) {
    if (typeof img !== "string" || !validateImageDataUrl(img)) {
      return {
        ok: false,
        error: "Each property photo must be an image data URL under ~4MB",
      };
    }
  }
  return { ok: true, images: images as string[] };
}

// In-memory cache for agent identity analysis results (keyed by joined-image hash)
const agentIdentityCache = new Map<string, string>();

/**
 * Analyze an agent's logo + headshot via GPT-4o-mini vision to extract a brand
 * sheet. One call with both images (whichever are present, detail "low").
 * Results cached by content hash. Returns null on any failure — never throws.
 */
export async function analyzeAgentIdentity(
  logoImage?: string | null,
  agentPhoto?: string | null,
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const images: string[] = [logoImage, agentPhoto].filter(
    (img): img is string => typeof img === "string" && validateImageDataUrl(img),
  );
  if (images.length === 0) return null;

  const hash = simpleHash(images.join("|"));
  const cached = agentIdentityCache.get(hash);
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
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "These are a real estate agent's branding assets (logo and/or professional headshot). Produce a concise plain-text brand sheet (under 120 words) covering: logo colors + symbol + typography style; and if a headshot is present, the agent's appearance (gender, approximate age range, hair, professional attire) for copy reference. This will be used to write marketing content that matches the agent's brand.",
              },
              ...images.map((url) => ({
                type: "image_url",
                image_url: { url, detail: "low" },
              })),
            ],
          },
        ],
        max_tokens: 350,
      }),
    });

    if (!response.ok) {
      console.error("Agent identity analysis failed:", await response.text());
      return null;
    }

    const data = await response.json();
    const brandSheet = data.choices?.[0]?.message?.content?.trim();
    if (brandSheet) {
      agentIdentityCache.set(hash, brandSheet);
    }
    return brandSheet || null;
  } catch (err) {
    console.error("Agent identity analysis error:", err);
    return null;
  }
}

/**
 * Validate agent logo/headshot payloads from an API request.
 * Each must be undefined/null or a valid image data URL.
 */
export function validateAgentImages(
  logoImage: unknown,
  agentPhoto: unknown,
): { ok: true } | { ok: false; error: string } {
  const entries: Array<[string, unknown]> = [
    ["logo", logoImage],
    ["photo", agentPhoto],
  ];
  for (const [label, img] of entries) {
    if (img == null) continue;
    if (typeof img !== "string" || !validateImageDataUrl(img)) {
      return {
        ok: false,
        error: `Agent ${label} must be an image data URL under ~4MB`,
      };
    }
  }
  return { ok: true };
}

/**
 * Refine existing generated content using a user-provided instruction.
 * Uses gpt-4o-mini to revise the content based on the instruction.
 * Falls back to returning currentContent unchanged if OPENAI_API_KEY is not set.
 */
export async function refineContent(
  contentType: ContentType,
  currentContent: string,
  instruction: string,
): Promise<{ revised: string; fairHousing?: FairHousingOutcome }> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[refineContent] OPENAI_API_KEY not set — returning content unchanged");
    return { revised: currentContent };
  }
  const isEmail = contentType === "email-campaign";
  const plainTextRule = isEmail
    ? " The content type is an email campaign, so it MUST remain PLAIN TEXT with no HTML tags whatsoever (no <p>, <h1>, <ul>, <a>, <br>, <div>, or any other markup)."
    : "";
  const systemPrompt =
    `You are an expert real estate marketing copywriter. Your task is to revise existing content based on the user's specific instruction.` +
    plainTextRule +
    ` Preserve the same format, structure, and tone of the original content unless the instruction explicitly says to change it. Output ONLY the revised content — no commentary, no code fences, no JSON, no markdown formatting.`;
  const callOnce = async (userInstruction: string): Promise<string> => {
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userInstruction },
          ],
          temperature: 0.7,
          max_tokens: 1500,
        }),
      },
    );
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} — ${error}`);
    }
    const data = await response.json();
    return (data.choices[0]?.message?.content?.trim() as string) || "";
  };
  const finalize = (text: string): string =>
    // Owner directive (Aug 13): keep social-post hashtags capped at 5 even after
    // refinement (e.g. an instruction to "add more hashtags" must not exceed the cap).
    // Bracketed-placeholder guard (task fa4a26ae): a refinement prompt can coax
    // the model into emitting template placeholders just as easily — scrub here
    // so every candidate (first revision and strict retry) is clean before it
    // reaches the textarea (and from there the renderer).
    stripBracketPlaceholders(contentType === "social-media-post" ? capHashtags(text) : text);
  try {
    const first = await callOnce(
      `Content type: ${contentType}\n\nExisting content:\n---\n${currentContent}\n---\n\nUser instruction: ${instruction}\n\nRevise the content according to this instruction. Output ONLY the revised content.`,
    );
    const revised = first ? finalize(first) : currentContent;
    // Fair Housing check on refined output: a user instruction can inject
    // targeting language ("make it appeal to young families") — never ship it.
    const scan = scanFairHousing(revised);
    if (scan.clean) {
      return { revised };
    }
    console.warn(
      "[fair-housing] risk patterns in refined %s: %s",
      contentType,
      scan.hits.map((h) => h.matched).join(" | "),
    );
    try {
      const strictInstruction =
        `${instruction}\n\nFAIR HOUSING OVERRIDE: your previous revision contained these risk phrases: ${scan.hits
          .map((h) => `"${h.matched}"`)
          .join(", ")}. Rewrite removing ALL of them and anything like them — describe only the property, never any type of person or demographic.`;
      const second = await callOnce(
        `Content type: ${contentType}\n\nExisting content:\n---\n${currentContent}\n---\n\nUser instruction: ${strictInstruction}\n\nRevise the content according to this instruction. Output ONLY the revised content.`,
      );
      if (second) {
        const finalText = finalize(second);
        if (scanFairHousing(finalText).clean) {
          return { revised: finalText, fairHousing: { flagged: false, repaired: true, hits: scan.hits } };
        }
      }
    } catch (retryErr) {
      console.error("[fair-housing] refine strict retry failed:", retryErr);
    }
    return { revised, fairHousing: { flagged: true, hits: scan.hits } };
  } catch (err) {
    console.error("[refineContent] Error:", err);
    return { revised: currentContent };
  }
}

/**
 * Generate an image via OpenAI Images API (gpt-image-1).
 * Returns a data URL (data:image/png;base64,...) or throws.
 */
export async function generateImage(
  contentType: ContentType,
  details: PropertyDetails,
): Promise<{ imageDataUrl: string; fairHousing?: FairHousingOutcome }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  // Analyze template image if provided
  let styleHint: string | undefined;
  if (details.templateImage) {
    if (!validateImageDataUrl(details.templateImage)) {
      throw new Error("Template image is too large or invalid (max ~4MB, must be an image data URL)");
    }
    const extracted = await analyzeTemplateImage(details.templateImage);
    if (extracted) {
      styleHint = extracted;
    }
  }

  // Analyze property photos (if any) so the generated image resembles the real
  // home. Failure never blocks generation — continue without visuals.
  let propertyVisuals: string | undefined;
  if (details.images?.length) {
    try {
      const visuals = await analyzePropertyPhotos(details.images);
      if (visuals) propertyVisuals = visuals;
    } catch (err) {
      console.error("Property photo analysis failed, continuing without visuals:", err);
    }
  }

  // Analyze agent logo/headshot so generated visuals can carry brand identity.
  let agentIdentity: string | undefined;
  if (details.logoImage || details.agentPhoto) {
    try {
      const identity = await analyzeAgentIdentity(details.logoImage, details.agentPhoto);
      if (identity) agentIdentity = identity;
    } catch (err) {
      console.error("Agent identity analysis failed, continuing without branding:", err);
    }
  }

  let prompt = buildImagePrompt(contentType, details, styleHint, propertyVisuals, agentIdentity);
  // Fair Housing check on the IMAGE prompt: 100.75 covers photos/illustrations
  // too. Hits usually come from user-supplied detail (description/keyFeatures)
  // leaking into the prompt — add the avoidance instruction before the single
  // (paid) image call and surface the hits to the caller.
  const promptScan = scanFairHousing(prompt);
  let imageFairHousing: FairHousingOutcome | undefined;
  if (!promptScan.clean) {
    console.warn(
      "[fair-housing] risk patterns in image prompt: %s",
      promptScan.hits.map((h) => h.matched).join(" | "),
    );
    prompt = `${prompt}${fairHousingImageAvoidBlock(promptScan.hits)}`;
    imageFairHousing = { flagged: true, hits: promptScan.hits };
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "medium",
      n: 1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Image API error: ${response.status} — ${errorText}`);
  }

  const data = await response.json();
  // gpt-image-1 returns either b64_json or url
  const b64 = data.data?.[0]?.b64_json;
  const imageUrl = data.data?.[0]?.url as string | undefined;

  const finish = (dataUrl: string) => ({
    imageDataUrl: dataUrl,
    ...(imageFairHousing ? { fairHousing: imageFairHousing } : {}),
  });
  if (b64) {
    return finish(`data:image/png;base64,${b64}`);
  }
  if (imageUrl) {
    // Fetch the image and convert to data URL
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to fetch generated image from URL: ${imgRes.status}`);
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const mimeType = imgRes.headers.get("content-type") || "image/png";
    return finish(`data:${mimeType};base64,${imgBuffer.toString("base64")}`);
  }
  throw new Error("No image data returned from OpenAI");
}