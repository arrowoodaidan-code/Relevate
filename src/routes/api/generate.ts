/**
 * TanStack Start API route for Relevate content generation.
 * This provides a server-side endpoint that can be called from the frontend
 * via TanStack Start's RPC mechanism.
 *
 * The actual generation logic is handled by the AI service in src/lib/ai.ts,
 * which uses mock data when OPENAI_API_KEY is not set.
 */
import { createServerFn } from "@tanstack/react-start";
import { generateContent } from "~/lib/ai";
import type { ContentType, PropertyDetails } from "~/lib/prompts";

/**
 * Server function to generate marketing content for a property listing.
 * Call this from any client component:
 *
 *   const result = await generateListingContent({ contentType, details });
 */
export const generateListingContent = createServerFn({ method: "POST" })
  .validator(
    (data: { contentType: ContentType; details: PropertyDetails }) => {
      if (!data || !data.contentType || !data.details) {
        throw new Error(
          "Missing required fields: contentType and details are required",
        );
      }
      const validTypes = [
        "property-description",
        "open-house-flyer",
        "social-media-post",
        "email-campaign",
        "listing-summary",
      ];
      if (!validTypes.includes(data.contentType)) {
        throw new Error(`Invalid contentType: ${data.contentType}`);
      }
      return data;
    },
  )
  .handler(async ({ data }) => {
    const result = await generateContent(data.contentType, data.details);
    return {
      success: true,
      content: result.content,
      contentType: data.contentType,
      source: result.source,
    };
  });