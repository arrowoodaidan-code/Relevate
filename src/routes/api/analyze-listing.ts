/**
 * TanStack Start API route for listing-photo auto-fill (R6).
 *
 * The HTTP endpoint is served by serve.ts (preview) and vercel-entry.ts
 * (production) — see POST /api/analyze-listing there, mirroring how
 * /api/analyze-template is dispatched. This file provides the RPC-style server
 * function (same pattern as generate.ts) and is the canonical home of the
 * extraction contract:
 *
 *   POST { images: [dataURL, ...] }  (≤3, each an image data URL under ~4MB)
 *   → { success, analysis } where analysis is:
 *     {
 *       property: { address, price, beds, baths, sqft, keyFeatures[], description },
 *       agent:    { name, phone, email, brokerage },
 *       confidence: { <field>: "high"|"medium"|"low"|"missing", ... }
 *     }
 *
 * Field names intentionally match R5's structured-data contract
 * (price/beds/baths/sqft/agentPhone) so filled forms flow into the renderer.
 */
import { createServerFn } from "@tanstack/react-start";
import { analyzeListingPhotos, validateListingImages } from "~/lib/listing-analysis";
import type { ListingAnalysis } from "~/lib/listing-analysis";

export { analyzeListingPhotos, validateListingImages };
export type { ListingAnalysis };

/**
 * Server function to extract property + agent details from listing-service
 * page photos. Call from a client component:
 *
 *   const result = await analyzeListingPhoto({ images: [...] });
 *   // result.data.analysis.property.price, .agent.phone, .confidence.*
 */
export const analyzeListingPhoto = createServerFn({ method: "POST" })
  .validator((data: { images: unknown }) => {
    if (!data || !Array.isArray(data.images)) {
      throw new Error("images is required (array of image data URLs)");
    }
    const check = validateListingImages(data.images);
    if (!check.ok) throw new Error(check.error);
    return { images: check.images };
  })
  .handler(async ({ data }) => {
    const analysis = await analyzeListingPhotos(data.images);
    if (!analysis) {
      return {
        success: false as const,
        error: "Could not read the listing photos. Try clearer photos of the listing page.",
      };
    }
    return { success: true as const, analysis };
  });
