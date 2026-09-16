/**
 * TanStack Start API route for demo-lead capture.
 *
 * The HTTP endpoint POST /api/leads is dispatched by serve.ts (preview) and
 * vercel-entry.ts (production); this file mirrors the RPC-style server-function
 * pattern used by analyze-listing.ts and is the canonical home of the contract:
 *
 *   POST { name, email, brokerage?, source? }   (public — no auth)
 *   → 200 { success: true, lead: { id, name, email, brokerage, source, created_at } }
 *   → 400 { success: false, error }             (validation)
 *   → 500 { success: false, error }             (storage failure)
 */
import { createServerFn } from "@tanstack/react-start";
import { captureDemoLead, validateDemoLead, type DemoLead } from "~/lib/leads";

export { captureDemoLead, validateDemoLead };
export type { DemoLead };

export const captureLead = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const check = validateDemoLead(data);
    if (!check.ok) throw new Error(check.error);
    return check.data;
  })
  .handler(async ({ data }) => {
    const lead = await captureDemoLead(data);
    if (!lead) throw new Error("Failed to store lead");
    return { success: true, lead };
  });
