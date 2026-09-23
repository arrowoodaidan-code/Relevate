/**
 * Prompt templates for each content type.
 * Used by the AI generation service to create marketing content for real estate listings.
 * Each template accepts property details and returns a structured prompt for OpenAI.
 */

export type ContentType =
  | "property-description"
  | "open-house-flyer"
  | "social-media-post"
  | "email-campaign"
  | "listing-summary";

export type Tone = "luxury" | "modern" | "cozy" | "professional" | "casual";

export type TemplateRegionKind = "text" | "image";
export type TemplateRegionLabel =
  | "headline"
  | "subheadline"
  | "body"
  | "bullets"
  | "contact"
  | "cta"
  | "footer"
  | "photo"
  | "logo"
  | "headshot"
  | "mascot"
  | "art"
  | "other";

/** A normalized editable area detected in an uploaded raster template. */
export interface TemplateRegion {
  id: string;
  label: TemplateRegionLabel;
  kind: TemplateRegionKind;
  /** Fractional coordinates relative to the source template (0–1). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Exact glyph color of the template lettering (#rrggbb). */
  textColor?: string;
  fontFamily?: "serif" | "sans-serif" | "script" | "display" | "condensed" | "mono";
  fontWeight?: "normal" | "bold" | "light";
  /**
   * True when the template's lettering is genuinely slanted. Preserved so a
   * future italic bundle can use it; the current DejaVu set ships regular+bold
   * only, so the compositor renders upright (see src/lib/font-match.ts).
   */
  italic?: boolean;
  /**
   * Character tracking of the template lettering in source-image pixels
   * (negative for tight headline tracking). Analyzer clamps to −20…200 and
   * rounds to whole pixels; matched to a px string by font-match.ts.
   */
  letterSpacingPx?: number;
  /**
   * Case styling of the template lettering. `small-caps` has no true bundled
   * equivalent (DejaVu lacks the smcp OpenType feature) and is approximated by
   * an uppercase content transform — see src/lib/font-match.ts.
   */
  textTransform?: "uppercase" | "small-caps" | "none";
  fontSizePx?: number;
  align?: "left" | "center" | "right";
  /**
   * True for editor-ADDED regions (FE's ADDED_PREFIX ids, e.g. `add-text-1`),
   * as opposed to regions detected from the uploaded template raster.
   * Additive regions have NO pre-existing template content beneath them, so
   * the compositor treats them as pure draw-on-top: it SKIPS the opaque
   * ring/backing rect behind image regions and SKIPS the opaque surface box
   * behind text regions, leaving the underlying template pixels untouched.
   * Detected (non-additive) regions keep the erase/backing/inpaint path so
   * the original lettering/logo never ghosts through.
   */
  additive?: boolean;
}

export interface PropertyDetails {
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  yearBuilt?: number;
  lotSize?: string;
  description: string;
  keyFeatures: string[];
  images?: string[];
  tone?: Tone;
  style?: string;
  templateDescription?: string;
  templateImage?: string;
  /** Editable text/image boxes detected from the raster template. */
  templateRegions?: TemplateRegion[];
  /** Visual factsheet extracted from uploaded property photos (set server-side). */
  propertyVisuals?: string;
  /** Agent branding (set client-side from the Agent & Logo section). */
  agentName?: string;
  logoImage?: string;
  agentPhoto?: string;
  /** Brand/agent sheet extracted from logo + headshot (set server-side). */
  agentIdentity?: string;
}

export interface PromptTemplate {
  systemPrompt: string;
  userPrompt: (details: PropertyDetails) => string;
}

import {
  FAIR_HOUSING_IMAGE_BLOCK,
  FAIR_HOUSING_SYSTEM_BLOCK,
} from "./fair-housing";

const toneInstructions: Record<Tone, string> = {
  luxury:
    "Use sophisticated, elevated language. Emphasize exclusivity, premium finishes, and architectural distinction. The tone should be aspirational and refined.",
  modern:
    "Use clean, contemporary language. Emphasize clean lines, smart home features, and modern design elements. The tone should be fresh and forward-looking.",
  cozy:
    "Use warm, inviting language. Emphasize comfort, charm, and the feeling of home. The tone should be welcoming and intimate.",
  professional:
    "Use clear, confident language. Emphasize practical benefits, value, and investment potential. The tone should be informative and trustworthy.",
  casual:
    "Use friendly, conversational language. Emphasize lifestyle, community, and approachability. The tone should be relaxed and relatable.",
};

export const promptTemplates: Record<ContentType, PromptTemplate> = {
  "property-description": {
    systemPrompt: `You are an expert real estate copywriter. Your task is to write compelling property descriptions that sell homes.`,
    userPrompt: (details: PropertyDetails) =>
      `Write a ${details.tone || "professional"} property description for:
Address: ${details.address}
Price: $${details.price.toLocaleString()}
Bedrooms: ${details.bedrooms} | Bathrooms: ${details.bathrooms} | Sq Ft: ${details.squareFeet.toLocaleString()}${details.yearBuilt ? `\nYear Built: ${details.yearBuilt}` : ""}${details.lotSize ? `\nLot Size: ${details.lotSize}` : ""}
Key Features: ${details.keyFeatures.join(", ")}
Additional Details: ${details.description}

${details.tone ? toneInstructions[details.tone] : toneInstructions.professional}

Write 3-4 paragraphs, starting with a strong hook. Include an "About the Agent" section at the end with a CTA to schedule a showing.`,
  },

  "open-house-flyer": {
    systemPrompt: `You are a real estate marketing specialist. Create compelling open house flyer content that drives attendance.`,
    userPrompt: (details: PropertyDetails) =>
      `Create open house flyer content for:
Address: ${details.address}
Price: $${details.price.toLocaleString()}
Bedrooms: ${details.bedrooms} | Bathrooms: ${details.bathrooms} | Sq Ft: ${details.squareFeet.toLocaleString()}
Key Features: ${details.keyFeatures.join(", ")}
Description: ${details.description}

Format as:
1. HEADLINE: Catchy, attention-grabbing headline (max 10 words)
2. SUBHEADLINE: Brief value proposition (max 15 words)
3. HIGHLIGHTS: 5-6 bullet points of top features
4. DIRECTIONS: Brief driving directions placeholder
5. CONTACT: Agent contact information section with CTA to RSVP

The tone should be exciting and inviting. Use emojis sparingly where appropriate.`,
  },

  "social-media-post": {
    systemPrompt: `You are a social media marketing expert for real estate. Create platform-optimized posts that drive engagement and inquiries. NEVER use more than 5 hashtags total across the entire output.`,
    userPrompt: (details: PropertyDetails) =>
      `Create social media posts for this listing:
Address: ${details.address}
Price: ${details.price.toLocaleString()}
Bedrooms: ${details.bedrooms} | Bathrooms: ${details.bathrooms} | Sq Ft: ${details.squareFeet.toLocaleString()}
Key Features: ${details.keyFeatures.join(", ")}
Description: ${details.description}

HASHTAG LIMIT: Use AT MOST 5 hashtags total across ALL of the posts below — do not exceed 5 tags in the entire output.

Create optimized posts for:
1. INSTAGRAM: Caption (max 2200 chars) with a maximum of 5 hashtags, and a call to action. Include a suggestion for the image/video to pair with it.
2. FACEBOOK: Longer, storytelling-style post (3-4 paragraphs) with emojis, a CTA, and a tip about the neighborhood. Do not add extra hashtags unless the 5-tag total allows it.
3. TWITTER/X: 3 short variants (each under 280 chars) with different angles. Use no more than 5 hashtags total across all three variants.

Each post should be ready to copy-paste and include a clear call to action.`,
  },

  "email-campaign": {
    systemPrompt: `You are a real estate email marketing specialist. Create email campaigns that generate leads and drive showings.`,
    userPrompt: (details: PropertyDetails) =>
      `Create an email campaign for this listing:
Address: ${details.address}
Price: $${details.price.toLocaleString()}
Bedrooms: ${details.bedrooms} | Bathrooms: ${details.bathrooms} | Sq Ft: ${details.squareFeet.toLocaleString()}
Key Features: ${details.keyFeatures.join(", ")}
Description: ${details.description}

Create the email as PLAIN TEXT — absolutely NO HTML tags (no <p>, <h1>, <ul>, <a>, <br>, <div>, or any other markup). The output will be pasted directly into an email client, so it must read like a finished, copy-paste-ready email with only plain text and simple bullet characters.

Structure:
1. SUBJECT LINES: 3 options (A/B test ready), max 60 chars each
2. PREHEADER: Max 100 chars
3. EMAIL BODY (under 400 words, plain text, separated with blank lines):
   - Opening hook (1 sentence)
   - Property highlights (3-4 short bullets using only the "-" character)
   - Feature callout (spotlight on the best feature)
   - Virtual tour/open house invitation
   - Agent signature with placeholder contact info
   - P.S. with urgency trigger (e.g. "just listed", "price reduced", "open house this Sunday")
4. CTA: Button text on one line, then the link placeholder on the next line

Make it sound urgent but not pushy. Output only the email content itself — no code fences, no JSON, no commentary.`,
  },

  "listing-summary": {
    systemPrompt: `You are a real estate data analyst. Create concise, data-rich listing summaries that agents can share with clients.`,
    userPrompt: (details: PropertyDetails) =>
      `Create a listing summary for:
Address: ${details.address}
Price: $${details.price.toLocaleString()}
Bedrooms: ${details.bedrooms} | Bathrooms: ${details.bathrooms} | Sq Ft: ${details.squareFeet.toLocaleString()}${details.yearBuilt ? `\nYear Built: ${details.yearBuilt}` : ""}${details.lotSize ? `\nLot Size: ${details.lotSize}` : ""}
Key Features: ${details.keyFeatures.join(", ")}
Description: ${details.description}

Format as a single-paragraph summary (under 150 words) that covers:
- What makes this property unique
- What buyer needs this property fits based on its physical and financial characteristics only — never target or describe a demographic group
- Key selling points organized by priority
- Why it's priced where it is

This summary should be professional and data-focused, suitable for sharing with potential buyers before they tour.`,
  },
};

/**
 * Get the prompt for a specific content type and property details.
 */
export function buildPrompt(
  contentType: ContentType,
  details: PropertyDetails,
): { systemPrompt: string; userPrompt: string } {
  const template = promptTemplates[contentType];
  if (!template) {
    throw new Error(`Unknown content type: ${contentType}`);
  }
  // Fair Housing guardrail: appended LAST so it overrides tone/persona and
  // any "ideal buyer" instruction in the template above (42 USC 3604(c)).
  let systemPrompt = template.systemPrompt + FAIR_HOUSING_SYSTEM_BLOCK;
  let userPrompt = template.userPrompt(details);

  // Weave template/brand instructions into the prompts
  if (details.templateDescription) {
    const brandInstr =
      `\n\nIMPORTANT BRAND STYLE: Match this brand style in your output: ${details.templateDescription}`;
    userPrompt += brandInstr;
  }

  // A raster-template editor has finite text boxes. Give the copywriter concise,
  // region-specific targets so the generated copy can be placed without shrinking
  // it into unreadability. This does not affect email output unless a template is
  // actually attached.
  if (details.templateRegions?.some((region) => region.kind === "text")) {
    const constraints = details.templateRegions
      .filter((region) => region.kind === "text")
      .map((region) => {
        const limits: Record<TemplateRegionLabel, string> = {
          headline: "headline: at most 40 characters",
          subheadline: "subheadline: at most 70 characters",
          body: "body: 2 short sentences, at most 220 characters",
          bullets: "bullets: 4–6 short bullets, each at most 50 characters",
          contact: "contact: agent name and contact details on separate short lines",
          cta: "CTA: at most 35 characters",
          footer: "footer: at most 55 characters",
          photo: "photo label: at most 25 characters",
          logo: "logo line: at most 25 characters",
          headshot: "headshot label: at most 25 characters",
          mascot: "mascot label: at most 25 characters",
          art: "art label: at most 25 characters",
          other: "short supporting copy: at most 70 characters",
        };
        return `${region.label.toUpperCase()} (${limits[region.label]})`;
      })
      .join("; ");
    userPrompt += `\n\nTEMPLATE REGION FIT: This content will be placed into an uploaded marketing template. Keep the relevant copy concise enough to fit these regions: ${constraints}. Preserve the requested output format, but do not add filler copy.`;
  }

  // Weave real property visuals (from uploaded photos) into the prompts
  if (details.propertyVisuals) {
    const visualsInstr =
      `\n\nIMPORTANT: Use these real property details for accuracy: ${details.propertyVisuals}`;
    userPrompt += visualsInstr;
  }

  // Weave agent identity (name + logo/headshot branding) into the prompts
  if (details.agentName) {
    const agentNameInstr =
      `\n\nIMPORTANT: The agent's name is ${details.agentName} — use this name in the agent signature/contact section (e.g. 'About the Agent', CONTACT, signature, P.S.).`;
    userPrompt += agentNameInstr;
  }
  if (details.agentIdentity) {
    const agentBrandInstr =
      `\n\nIMPORTANT: Use this agent branding in the output: ${details.agentIdentity}`;
    userPrompt += agentBrandInstr;
  }

  return { systemPrompt, userPrompt };
}

/**
 * Build an image generation prompt from property details and content type.
 * Used for flyer hero images, social media backgrounds, etc.
 */
export function buildImagePrompt(
  contentType: ContentType,
  details: PropertyDetails,
  styleHint?: string,
  propertyVisuals?: string,
  agentIdentity?: string,
): string {
  const homeDesc = [
    details.address,
    `${details.bedrooms} bed, ${details.bathrooms} bath`,
    `${details.squareFeet.toLocaleString()} sq ft`,
    details.keyFeatures.slice(0, 3).join(", "),
    details.description,
  ]
    .filter(Boolean)
    .join(" — ");

  const basePrompt = (() => {
    switch (contentType) {
      case "open-house-flyer":
        return `Professional real estate open house flyer hero image. Wide, inviting shot of a beautiful home at ${homeDesc}. Golden hour lighting, landscaped front yard, welcoming entrance. High-end real estate photography style. Text-free, clean composition suitable for a flyer background.`;
      case "social-media-post":
        return `Square social media post background for a real estate listing. Stunning interior or exterior shot of a home at ${homeDesc}. Bright, airy, modern aesthetic. Lifestyle-oriented real estate photography. Text-free with negative space for overlaid text.`;
      case "listing-summary":
        return `Professional real estate listing hero image. Beautiful wide shot of a property at ${homeDesc}. Warm, inviting atmosphere. High-end architectural photography. Clean composition suitable for a website hero or presentation.`;
      default:
        return `Professional real estate marketing image. Beautiful shot of a home at ${homeDesc}. Warm natural light, inviting atmosphere. High-quality real estate photography.`;
    }
  })();

  let prompt = basePrompt;

  if (styleHint) {
    prompt += ` Match this visual style: ${styleHint}.`;
  }

  if (propertyVisuals) {
    prompt += ` IMPORTANT: The real property looks like this — generate an image that resembles these actual details: ${propertyVisuals}.`;
  }

  if (agentIdentity) {
    prompt += ` Include the agent's brand identity: ${agentIdentity}.`;
  }

  if (details.templateDescription) {
    prompt += ` Incorporate this brand aesthetic: ${details.templateDescription}.`;
  }

  // Fair Housing guardrail for imagery: 100.75 explicitly covers
  // photographs/illustrations/symbols, so the image prompt carries the same
  // restriction as the copy (appended last so it wins).
  prompt += FAIR_HOUSING_IMAGE_BLOCK;

  return prompt;
}