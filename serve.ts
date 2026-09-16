// Production server for the built site. The TanStack Start build emits a portable
// fetch handler (dist/server/server.js) plus static client assets (dist/client);
// this wraps them in a Bun server on port 3000 — static files first, API routes
// second, SSR for the rest. Run `bun run build` before starting. Restart it with
// `bun run publish`.
//
// Starting a new instance supersedes the old one: it frees the port no matter
// which user owns the current server (provisioning starts it as `engine`; a team
// member's `bun run publish` runs as their own user), so publish never collides
// with an already-running server. Every sandbox user has passwordless sudo, so
// the takeover works across user boundaries.
import handler from "./dist/server/server.js";
import { analyzeTemplateRegions, generateContent, generateImage, validateImageDataUrl, validatePropertyImages, validateAgentImages, refineContent } from "./src/lib/ai";
import { analyzeListingPhotos, validateListingImages } from "./src/lib/listing-analysis";
import { signup, login, verifySession, deleteSession } from "./src/lib/auth";
import type { ContentType, PropertyDetails } from "./src/lib/prompts";
import type { User } from "./src/lib/auth";
import { POST as stripeWebhookPost } from "./src/routes/api/webhooks/stripe";
import Stripe from "stripe";
import { renderMarketingPng, validateRenderRequest, eraseAllTemplateText } from "./src/lib/render";
import { resolveRenderSuggestion } from "./src/lib/render-suggestions";
import { captureDemoLead, validateDemoLead } from "./src/lib/leads";
import { sendTransactionalEmail } from "./src/lib/email";
import { deleteProperty, getPropertyWithContent, getUsageSummary, listProperties, upsertPropertyWithContent } from "./src/lib/properties";
import { createTemplate, deleteTemplate, getTemplate, listTemplates, updateTemplate, validateTemplatePayload } from "./src/lib/templates";
import { renderDesignDoc } from "./src/lib/render-design";
import type { DesignDoc } from "./src/lib/design";
import { createDesignTemplate, deleteDesignTemplate, getDesignTemplate, listDesignTemplates, updateDesignTemplate, validateDesignTemplatePayload } from "./src/lib/design-templates";
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// Pinned, NOT read from the environment. The published preview URL
// (<label>.<PUBLIC_SITE_DOMAIN>) is reverse-proxied to 0.0.0.0:3000 inside the
// sandbox, so the default site MUST bind there. Bun auto-loads .env files, so
// honouring process.env.PORT/HOST would let a stray env var or a .env in the site
// dir silently move the site off :3000 (or onto loopback) and break the public URL.
const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;
const SESSION_COOKIE = "listinglab_session";

// Free PORT regardless of which user owns the current listener. lsof runs under
// sudo so it can see (and the kill can signal) a process owned by another user;
// the loop waits for the socket to actually release before we bind.
const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

/**
 * Parse cookies from a Request into a simple record.
 */
function parseCookies(req: Request): Record<string, string> {
  const cookieHeader = req.headers.get("Cookie") || "";
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = rest.join("=").trim();
  });
  return cookies;
}

/**
 * Build a Set-Cookie header string for the session token.
 * Domain-less, path=/, httpOnly, sameSite=lax, 7-day expiry.
 */
function setSessionCookie(token: string): string {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

/**
 * Build a Set-Cookie header to clear the session cookie.
 */
function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Try to authenticate the request. Returns the user or null.
 */
async function authenticate(req: Request): Promise<User | null> {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const result = await verifySession(token);
  return result?.user ?? null;
}

// Take over the port, re-freeing and retrying if another publish grabbed it in the
// gap between freeing and binding (last publish wins). Bun.serve throws EADDRINUSE
// synchronously, so without this a raced publish would die while the shell already
// reported success.
for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT,
      hostname: HOST,
      async fetch(req) {
        const url = new URL(req.url);
        const { pathname } = url;

        // ---- CORS / Preflight ----
        if (req.method === "OPTIONS") {
          return new Response(null, { status: 204 });
        }

        // ---- Auth API Routes ----

        // POST /api/auth/signup — Create account
        if (pathname === "/api/auth/signup" && req.method === "POST") {
          try {
            const { email, name, password } = await req.json() as {
              email: string;
              name: string;
              password: string;
            };
            const result = await signup(email, name, password);
            return new Response(
              JSON.stringify({
                success: true,
                user: {
                  id: result.user.id,
                  email: result.user.email,
                  name: result.user.name,
                  subscription_tier: result.user.subscription_tier,
                },
              }),
              {
                status: 201,
                headers: {
                  "Content-Type": "application/json",
                  "Set-Cookie": setSessionCookie(result.session.token),
                },
              },
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : "Signup failed";
            return Response.json({ success: false, error: message }, { status: 400 });
          }
        }

        // POST /api/auth/login — Log in
        if (pathname === "/api/auth/login" && req.method === "POST") {
          try {
            const { email, password } = await req.json() as {
              email: string;
              password: string;
            };
            const result = await login(email, password);
            return new Response(
              JSON.stringify({
                success: true,
                user: {
                  id: result.user.id,
                  email: result.user.email,
                  name: result.user.name,
                  subscription_tier: result.user.subscription_tier,
                },
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  "Set-Cookie": setSessionCookie(result.session.token),
                },
              },
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : "Login failed";
            return Response.json({ success: false, error: message }, { status: 401 });
          }
        }

        // POST /api/auth/logout — Log out
        if (pathname === "/api/auth/logout" && req.method === "POST") {
          const cookies = parseCookies(req);
          const token = cookies[SESSION_COOKIE];
          if (token) await deleteSession(token);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": clearSessionCookie(),
            },
          });
        }

        // GET /api/auth/me — Get current user
        if (pathname === "/api/auth/me" && req.method === "GET") {
          const user = await authenticate(req);
          if (user) {
            return Response.json({ authenticated: true, user });
          }
          return Response.json({ authenticated: false }, { status: 401 });
        }

        // POST /api/analyze-template — find editable text/photo regions in an uploaded raster template.
        if (pathname === "/api/analyze-template" && req.method === "POST") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const { templateImage, templateWidth, templateHeight } = await req.json() as { templateImage?: unknown; templateWidth?: unknown; templateHeight?: unknown };
            if (typeof templateImage !== "string" || !validateImageDataUrl(templateImage)) {
              return Response.json({ success: false, error: "templateImage must be an image data URL under ~4MB" }, { status: 400 });
            }
            const regions = await analyzeTemplateRegions(templateImage);
            // Manual text-authoring pivot (e0f2e06f): return a TEXT-ERASED copy
            // of the raster (all detected lettering inpainted away, background +
            // photos preserved) so the editor can author text manually on a clean
            // base instead of showing the template's original lettering.
            const w = typeof templateWidth === "number" && templateWidth > 0 ? templateWidth : undefined;
            const h = typeof templateHeight === "number" && templateHeight > 0 ? templateHeight : undefined;
            const inpaintedImage = eraseAllTemplateText(templateImage, regions ?? [], w, h);
            return Response.json({ success: true, regions: regions ?? [], ...(inpaintedImage ? { inpaintedImage } : {}) });
          } catch (error) {
            console.error("API /api/analyze-template error:", error);
            return Response.json({ success: false, error: "Failed to analyze template" }, { status: 500 });
          }
        }

        // POST /api/analyze-listing — extract property + agent details from listing-service photos (R6)
        if (pathname === "/api/analyze-listing" && req.method === "POST") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const { images } = await req.json() as { images?: unknown };
            const check = validateListingImages(images);
            if (!check.ok) return Response.json({ success: false, error: check.error }, { status: 400 });
            const analysis = await analyzeListingPhotos(check.images);
            if (!analysis) {
              return Response.json(
                { success: false, error: "Could not read the listing photos. Try clearer photos of the listing page." },
                { status: 422 },
              );
            }
            return Response.json({ success: true, analysis });
          } catch (error) {
            console.error("API /api/analyze-listing error:", error);
            return Response.json({ success: false, error: "Failed to analyze listing photos" }, { status: 500 });
          }
        }

        // POST /api/render — Render edited marketing content to PNG (requires auth)
        if (pathname === "/api/render" && req.method === "POST") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const parsed = validateRenderRequest(await req.json());
            if (!parsed.ok) return Response.json({ success: false, error: parsed.error }, { status: 400 });
            const imageDataUrl = await renderMarketingPng(parsed.data);
            return Response.json({ success: true, imageDataUrl });
          } catch (error) {
            console.error("API /api/render error:", error);
            return Response.json({ success: false, error: "Failed to render PNG" }, { status: 500 });
          }
        }
        // POST /api/render-design — Render a from-scratch DesignDoc to PNG (requires auth)
        if (pathname === "/api/render-design" && req.method === "POST") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const body = await req.json();
            const doc = body?.doc as DesignDoc | undefined;
            if (!doc || typeof doc.width !== "number" || typeof doc.height !== "number" || !Array.isArray(doc.layers)) {
              return Response.json({ success: false, error: "Invalid DesignDoc payload (doc.width/height/layers required)" }, { status: 400 });
            }
            const out = await renderDesignDoc(doc);
            return Response.json({ success: true, imageDataUrl: out.dataUrl, width: out.width, height: out.height });
          } catch (error) {
            console.error("API /api/render-design error:", error);
            return Response.json({ success: false, error: "Failed to render design PNG" }, { status: 500 });
          }
        }

        // POST /api/resolve-render-suggestion — map a natural-language suggestion
        // to a renderer-supported style change (drives /api/render's brandStyle).
        if (pathname === "/api/resolve-render-suggestion" && req.method === "POST") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const body = await req.json();
            const result = resolveRenderSuggestion({
              suggestion: body?.suggestion ?? "",
              currentStyle: body?.currentStyle ?? "",
              type: body?.type === "social" ? "social" : "flyer",
            });
            return Response.json({ success: result.ok, ...result });
          } catch (error) {
            console.error("API /api/resolve-render-suggestion error:", error);
            return Response.json({ success: false, reason: "Failed to resolve suggestion." }, { status: 500 });
          }
        }

        // POST /api/leads — capture a demo/schedule-a-demo lead (public, no auth).
        if (pathname === "/api/leads" && req.method === "POST") {
          try {
            const check = validateDemoLead(await req.json());
            if (!check.ok) return Response.json({ success: false, error: check.error }, { status: 400 });
            const lead = await captureDemoLead(check.data);
            if (!lead) return Response.json({ success: false, error: "Failed to store lead" }, { status: 500 });
            // AWAITED (hard-capped ~9s inside sendTransactionalEmail) so the SMTP
            // send completes BEFORE the response returns — on serverless an
            // unawaited send is frozen/killed when the request ends and the email
            // is silently lost. Lead storage already succeeded above; an email
            // failure must never fail the request.
            const notify = await sendTransactionalEmail({
              to: "arrowood.aidan@gmail.com",
              subject: `New demo request from ${lead.name}`,
              html: `<p><strong>Name:</strong> ${escapeHtml(lead.name)}</p>
                     <p><strong>Email:</strong> ${escapeHtml(lead.email)}</p>
                     <p><strong>Brokerage:</strong> ${escapeHtml(lead.brokerage ?? "—")}</p>
                     <p><strong>Source:</strong> ${escapeHtml(lead.source ?? "—")}</p>
                     <p>View/manage in the Relevate pipeline.</p>`,
            });
            console.log(`[leads] notify ${notify.success ? "sent" : "failed"} for lead=${lead.id}`);
            return Response.json({ success: true, lead });
          } catch (error) {
            console.error("API /api/leads error:", error);
            return Response.json({ success: false, error: "Failed to capture your request" }, { status: 500 });
          }
        }


        // ---- Saved Properties API (authenticated; owner-requested history panel) ----
        // GET /api/usage — listings-left-this-month for the user's tier
        if (pathname === "/api/usage" && req.method === "GET") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const usage = await getUsageSummary(user.subscription_tier, user.id);
            return Response.json({ success: true, usage });
          } catch (error) {
            console.error("API /api/usage error:", error);
            return Response.json({ success: false, error: "Failed to load usage" }, { status: 500 });
          }
        }
        // GET /api/properties — list the current user's saved properties (newest first)
        if (pathname === "/api/properties" && req.method === "GET") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const properties = await listProperties(user.id);
            return Response.json({ success: true, properties });
          } catch (error) {
            console.error("API /api/properties list error:", error);
            return Response.json({ success: false, error: "Failed to list saved properties" }, { status: 500 });
          }
        }
        // POST /api/properties — explicit save of property details + one content row
        if (pathname === "/api/properties" && req.method === "POST") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const body = (await req.json()) as { address?: unknown; details?: unknown; contentType?: unknown; content?: unknown };
            const address = typeof body.address === "string" ? body.address.trim() : "";
            const contentType = typeof body.contentType === "string" ? body.contentType : "";
            const content = typeof body.content === "string" ? body.content : "";
            if (!address) return Response.json({ success: false, error: "Address is required." }, { status: 400 });
            if (!contentType || !content) {
              return Response.json({ success: false, error: "contentType and content are required to save." }, { status: 400 });
            }
            const detailsJson = body.details != null ? JSON.stringify(body.details) : null;
            const propertyId = await upsertPropertyWithContent(user.id, address, detailsJson, contentType, content);
            if (!propertyId) return Response.json({ success: false, error: "Failed to save property" }, { status: 500 });
            return Response.json({ success: true, propertyId }, { status: 201 });
          } catch (error) {
            console.error("API /api/properties create error:", error);
            return Response.json({ success: false, error: "Failed to save property" }, { status: 500 });
          }
        }
        // GET/DELETE /api/properties/:id — fetch (with content) or delete one (owner only)
        const propertyIdMatch = pathname.match(/^\/api\/properties\/([^/]+)$/);
        if (propertyIdMatch) {
          const propId = decodeURIComponent(propertyIdMatch[1]);
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          if (req.method === "GET") {
            try {
              const found = await getPropertyWithContent(user.id, propId);
              if (!found) return Response.json({ success: false, error: "Property not found" }, { status: 404 });
              return Response.json({ success: true, ...found });
            } catch (error) {
              console.error("API /api/properties get error:", error);
              return Response.json({ success: false, error: "Failed to load property" }, { status: 500 });
            }
          }
          if (req.method === "DELETE") {
            try {
              const deleted = await deleteProperty(user.id, propId);
              if (!deleted) return Response.json({ success: false, error: "Property not found" }, { status: 404 });
              return Response.json({ success: true });
            } catch (error) {
              console.error("API /api/properties delete error:", error);
              return Response.json({ success: false, error: "Failed to delete property" }, { status: 500 });
            }
          }
        }
        // ---- Saved DesignDoc Templates API (authenticated; rev-35 pivot) ----
        // POST /api/design-templates — Save a from-scratch DesignDoc as a named template
        if (pathname === "/api/design-templates" && req.method === "POST") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const parsed = validateDesignTemplatePayload(await req.json(), false);
            if (!parsed.ok) return Response.json({ success: false, error: parsed.error }, { status: 400 });
            const template = await createDesignTemplate(user.id, { name: parsed.data.name!, design: parsed.data.design! });
            return Response.json({ success: true, template }, { status: 201 });
          } catch (error) {
            console.error("API /api/design-templates create error:", error);
            return Response.json({ success: false, error: "Failed to create design template" }, { status: 500 });
          }
        }
        // GET /api/design-templates — List the current user's saved designs
        if (pathname === "/api/design-templates" && req.method === "GET") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const templates = await listDesignTemplates(user.id);
            return Response.json({ success: true, templates });
          } catch (error) {
            console.error("API /api/design-templates list error:", error);
            return Response.json({ success: false, error: "Failed to list design templates" }, { status: 500 });
          }
        }
        // GET/PUT/DELETE /api/design-templates/:id — Fetch, update, or delete one (owner only)
        const designTemplateIdMatch = pathname.match(/^\/api\/design-templates\/([^/]+)$/);
        if (designTemplateIdMatch) {
          const templateId = decodeURIComponent(designTemplateIdMatch[1]);
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          if (req.method === "GET") {
            try {
              const template = await getDesignTemplate(user.id, templateId);
              if (!template) return Response.json({ success: false, error: "Design template not found" }, { status: 404 });
              return Response.json({ success: true, template });
            } catch (error) {
              console.error("API /api/design-templates get error:", error);
              return Response.json({ success: false, error: "Failed to fetch design template" }, { status: 500 });
            }
          }
          if (req.method === "PUT") {
            try {
              const parsed = validateDesignTemplatePayload(await req.json(), true);
              if (!parsed.ok) return Response.json({ success: false, error: parsed.error }, { status: 400 });
              const template = await updateDesignTemplate(user.id, templateId, parsed.data);
              if (!template) return Response.json({ success: false, error: "Design template not found" }, { status: 404 });
              return Response.json({ success: true, template });
            } catch (error) {
              console.error("API /api/design-templates update error:", error);
              return Response.json({ success: false, error: "Failed to update design template" }, { status: 500 });
            }
          }
          if (req.method === "DELETE") {
            try {
              const deleted = await deleteDesignTemplate(user.id, templateId);
              if (!deleted) return Response.json({ success: false, error: "Design template not found" }, { status: 404 });
              return Response.json({ success: true });
            } catch (error) {
              console.error("API /api/design-templates delete error:", error);
              return Response.json({ success: false, error: "Failed to delete design template" }, { status: 500 });
            }
          }
        }
        // ---- Saved Design Templates API (authenticated) ----

        // POST /api/templates — Create a saved design template
        if (pathname === "/api/templates" && req.method === "POST") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const parsed = validateTemplatePayload(await req.json(), false);
            if (!parsed.ok) return Response.json({ success: false, error: parsed.error }, { status: 400 });
            const template = await createTemplate(user.id, {
              name: parsed.data.name!,
              image_data_url: parsed.data.image_data_url!,
              width: parsed.data.width!,
              height: parsed.data.height!,
              style_description: parsed.data.style_description,
              regions: parsed.data.regions,
            });
            return Response.json({ success: true, template }, { status: 201 });
          } catch (error) {
            console.error("API /api/templates create error:", error);
            return Response.json({ success: false, error: "Failed to create template" }, { status: 500 });
          }
        }

        // GET /api/templates — List the current user's templates
        if (pathname === "/api/templates" && req.method === "GET") {
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });
          try {
            const templates = await listTemplates(user.id);
            return Response.json({ success: true, templates });
          } catch (error) {
            console.error("API /api/templates list error:", error);
            return Response.json({ success: false, error: "Failed to list templates" }, { status: 500 });
          }
        }

        // GET/PUT/DELETE /api/templates/:id — Fetch, update, or delete one template (owner only)
        const templateIdMatch = pathname.match(/^\/api\/templates\/([^/]+)$/);
        if (templateIdMatch) {
          const templateId = decodeURIComponent(templateIdMatch[1]);
          const user = await authenticate(req);
          if (!user) return Response.json({ success: false, error: "Authentication required. Please log in." }, { status: 401 });

          if (req.method === "GET") {
            try {
              const template = await getTemplate(user.id, templateId);
              if (!template) return Response.json({ success: false, error: "Template not found" }, { status: 404 });
              return Response.json({ success: true, template });
            } catch (error) {
              console.error("API /api/templates get error:", error);
              return Response.json({ success: false, error: "Failed to fetch template" }, { status: 500 });
            }
          }

          if (req.method === "PUT") {
            try {
              const parsed = validateTemplatePayload(await req.json(), true);
              if (!parsed.ok) return Response.json({ success: false, error: parsed.error }, { status: 400 });
              const template = await updateTemplate(user.id, templateId, parsed.data);
              if (!template) return Response.json({ success: false, error: "Template not found" }, { status: 404 });
              return Response.json({ success: true, template });
            } catch (error) {
              console.error("API /api/templates update error:", error);
              return Response.json({ success: false, error: "Failed to update template" }, { status: 500 });
            }
          }

          if (req.method === "DELETE") {
            try {
              const deleted = await deleteTemplate(user.id, templateId);
              if (!deleted) return Response.json({ success: false, error: "Template not found" }, { status: 404 });
              return Response.json({ success: true });
            } catch (error) {
              console.error("API /api/templates delete error:", error);
              return Response.json({ success: false, error: "Failed to delete template" }, { status: 500 });
            }
          }
        }

        // ---- Generate API Route (authenticated) ----

        // POST /api/generate — Generate marketing content (requires auth)
        if (pathname === "/api/generate" && req.method === "POST") {
          const user = await authenticate(req);
          if (!user) {
            return Response.json(
              { error: "Authentication required. Please log in." },
              { status: 401 },
            );
          }

          try {
            const body = await req.json();
            const { contentType, details } = body as {
              contentType: ContentType;
              details: PropertyDetails;
            };

            if (!contentType || !details) {
              return Response.json(
                { error: "Missing required fields: contentType and details are required" },
                { status: 400 },
              );
            }


            // Graceful 400 for missing/invalid numeric property fields — avoids a
            // cryptic `Cannot read properties of undefined (reading 'toLocaleString')`
            // crash when a payload omits e.g. squareFeet.
            const numericFields: Array<[keyof PropertyDetails, string]> = [
              ["squareFeet", "squareFeet"],
              ["price", "price"],
              ["bedrooms", "bedrooms"],
              ["bathrooms", "bathrooms"],
            ];
            for (const [field, label] of numericFields) {
              const v = (details as Record<string, unknown>)[field];
              if (v == null) {
                return Response.json(
                  { error: `Missing required field: ${label} is required for generation` },
                  { status: 400 },
                );
              }
              if (typeof v !== "number" || !Number.isFinite(v)) {
                return Response.json(
                  { error: `Invalid ${label}: must be a finite number` },
                  { status: 400 },
                );
              }
            }
            const validContentTypes = [
              "property-description",
              "open-house-flyer",
              "social-media-post",
              "email-campaign",
              "listing-summary",
            ];

            if (!validContentTypes.includes(contentType)) {
              return Response.json(
                { error: `Invalid contentType. Must be one of: ${validContentTypes.join(", ")}` },
                { status: 400 },
              );
            }

            // Enforce property photo cap & validity (max 3 image data URLs)
            const imageCheck = validatePropertyImages(details.images);
            if (!imageCheck.ok) {
              return Response.json({ error: imageCheck.error }, { status: 400 });
            }
            details.images = imageCheck.images;

            // Validate agent branding fields (name + logo/headshot images)
            if (
              details.agentName != null &&
              (typeof details.agentName !== "string" || details.agentName.length > 100)
            ) {
              return Response.json(
                { error: "agentName must be a string under 100 characters" },
                { status: 400 },
              );
            }
            const agentCheck = validateAgentImages(details.logoImage, details.agentPhoto);
            if (!agentCheck.ok) {
              return Response.json({ error: agentCheck.error }, { status: 400 });
            }

            const result = await generateContent(
              contentType as ContentType,
              details as PropertyDetails,
            );

            let savedPropertyId: string | null = null;
            try {
              const saveAddress = String(details.address ?? "").trim() || "Unnamed property";
              // Persist a slim details JSON: drop image data URLs (photos/logo/
              // headshot) to keep rows small - form fields still restore on reload.
              const slimDetails: Record<string, unknown> = { ...details };
              for (const k of ["images", "logoImage", "agentPhoto"]) delete slimDetails[k];
              savedPropertyId = await upsertPropertyWithContent(
                user.id,
                saveAddress,
                JSON.stringify(slimDetails),
                contentType,
                result.content,
              );
            } catch (saveErr) {
              console.error("API /api/generate save-to-history error:", saveErr);
            }
            return Response.json({
              success: true,
              data: {
                content: result.content,
                contentType,
                source: result.source,
                ...(savedPropertyId ? { savedPropertyId } : {}),
              },
            });
          } catch (error) {
            console.error("API /api/generate error:", error);
            return Response.json(
              {
                error: "Failed to generate content",
                details: error instanceof Error ? error.message : "Unknown error",
              },
              { status: 500 },
            );
          }
        }


        // GET /api/generate — Health check / info endpoint (public)
        if (pathname === "/api/generate" && req.method === "GET") {
          return Response.json({
            status: "ok",
            service: "Relevate Content Generation API",
            version: "1.0.0",
            aiProvider: process.env.OPENAI_API_KEY ? "openai" : "mock",
            supportedContentTypes: [
              "property-description",
              "open-house-flyer",
              "social-media-post",
              "email-campaign",
              "listing-summary",
            ],
          });
        }

        // ---- Generate Image API Route (authenticated) ----

        // POST /api/generate-image — Generate a matching image for content (requires auth)
        if (pathname === "/api/generate-image" && req.method === "POST") {
          const user = await authenticate(req);
          if (!user) {
            return Response.json(
              { error: "Authentication required. Please log in." },
              { status: 401 },
            );
          }

          try {
            const body = await req.json();
            const { contentType, details, templateImage: bodyImage } = body as {
              contentType: ContentType;
              details: PropertyDetails;
              templateImage?: string;
            };

            if (!contentType || !details) {
              return Response.json(
                { error: "Missing required fields: contentType and details are required" },
                { status: 400 },
              );
            }

            const validImageTypes = [
              "open-house-flyer",
              "social-media-post",
              "listing-summary",
            ];
            if (!validImageTypes.includes(contentType)) {
              return Response.json(
                { error: `Image generation not supported for: ${contentType}. Use: ${validImageTypes.join(", ")}` },
                { status: 400 },
              );
            }

            // Enforce property photo cap & validity (max 3 image data URLs)
            const imageCheck = validatePropertyImages(details.images);
            if (!imageCheck.ok) {
              return Response.json({ error: imageCheck.error }, { status: 400 });
            }

            // Validate agent branding fields (name + logo/headshot images)
            if (
              details.agentName != null &&
              (typeof details.agentName !== "string" || details.agentName.length > 100)
            ) {
              return Response.json(
                { error: "agentName must be a string under 100 characters" },
                { status: 400 },
              );
            }
            const agentCheck = validateAgentImages(details.logoImage, details.agentPhoto);
            if (!agentCheck.ok) {
              return Response.json({ error: agentCheck.error }, { status: 400 });
            }
            // Merge template image from body if provided (overrides details.templateImage)
            const mergedDetails = {
              ...details,
              images: imageCheck.images,
              ...(bodyImage ? { templateImage: bodyImage } : {}),
            };

            const imageDataUrl = await generateImage(
              contentType as ContentType,
              mergedDetails as PropertyDetails,
            );

            return Response.json({
              success: true,
              imageDataUrl,
            });
          } catch (error: any) {
            console.error("API /api/generate-image error:", error);
            return Response.json(
              {
                error: error.message || "Failed to generate image",
              },
              { status: error.message?.includes("configured") ? 500 : 400 },
            );
          }
        }

        // POST /api/refine — Refine existing generated content (requires auth)
        if (pathname === "/api/refine" && req.method === "POST") {
          const user = await authenticate(req);
          if (!user) {
            return Response.json(
              { error: "Authentication required. Please log in." },
              { status: 401 },
            );
          }

          try {
            const body = await req.json();
            const { contentType, currentContent, instruction } = body as {
              contentType: ContentType;
              currentContent: string;
              instruction: string;
            };

            const validContentTypes = [
              "property-description",
              "open-house-flyer",
              "social-media-post",
              "email-campaign",
              "listing-summary",
            ];

            if (!contentType || !validContentTypes.includes(contentType)) {
              return Response.json(
                { error: `Invalid contentType. Must be one of: ${validContentTypes.join(", ")}` },
                { status: 400 },
              );
            }

            if (!currentContent || typeof currentContent !== "string" || currentContent.trim().length === 0) {
              return Response.json(
                { error: "currentContent is required and must be a non-empty string" },
                { status: 400 },
              );
            }

            if (!instruction || typeof instruction !== "string" || instruction.trim().length === 0) {
              return Response.json(
                { error: "instruction is required and must be a non-empty string" },
                { status: 400 },
              );
            }

            if (instruction.length > 500) {
              return Response.json(
                { error: "instruction must be 500 characters or fewer" },
                { status: 400 },
              );
            }

            const revised = await refineContent(
              contentType as ContentType,
              currentContent,
              instruction,
            );

            return Response.json({
              success: true,
              content: revised,
            });
          } catch (error) {
            console.error("API /api/refine error:", error);
            return Response.json(
              {
                error: "Failed to refine content",
                details: error instanceof Error ? error.message : "Unknown error",
              },
              { status: 500 },
            );
          }
        }

        // POST /api/create-checkout-session — Stripe subscription checkout
        if (pathname === "/api/create-checkout-session" && req.method === "POST") {
          try {
            const body = await req.json();
            const { priceLookupKey, userId: bodyUserId } = body as {
              priceLookupKey?: string;
              userId?: string;
            };
            const validKeys = ["starter_monthly", "pro", "team"];
            if (!priceLookupKey || !validKeys.includes(priceLookupKey)) {
              return Response.json(
                {
                  error: `Invalid priceLookupKey: ${priceLookupKey}. Must be one of: ${validKeys.join(", ")}`,
                },
                { status: 400 },
              );
            }

            // Link checkout to logged-in user (session cookie) for webhook provisioning
            const authedUser = await authenticate(req);
            const userId = authedUser?.id ?? bodyUserId;

            // Block checkout for demo accounts — never bills, never creates a Stripe customer
            if (authedUser?.subscription_tier === "demo") {
              return Response.json(
                {
                  success: false,
                  error: "Demo accounts have full access and never require billing.",
                },
                { status: 403 },
              );
            }

            const stripeKey = process.env.STRIPE_SECRET_KEY;
            if (!stripeKey) {
              return Response.json(
                { error: "STRIPE_SECRET_KEY is not configured" },
                { status: 500 },
              );
            }
            const stripe = new Stripe(stripeKey);

            const prices = await stripe.prices.list({
              lookup_keys: [priceLookupKey],
              limit: 1,
              active: true,
            });

            if (prices.data.length === 0) {
              return Response.json(
                {
                  error: `No active Stripe price found with lookup_key: "${priceLookupKey}". Ensure prices are created in the Stripe dashboard with lookup_keys matching: starter_monthly, pro, team.`,
                },
                { status: 400 },
              );
            }

            const priceId = prices.data[0].id;
            const proto =
              (req.headers.get("x-forwarded-proto") as string | null) ?? "http";
            const baseUrl = `${proto}://${req.headers.get("host") ?? "localhost:3000"}`;

            const sessionParams: Stripe.Checkout.SessionCreateParams = {
              mode: "subscription",
              line_items: [{ price: priceId, quantity: 1 }],
              success_url: `${baseUrl}/app/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${baseUrl}/app/subscription/cancel`,
              allow_promotion_codes: true,
              billing_address_collection: "auto",
              metadata: { price_lookup_key: priceLookupKey },
            };

            if (userId) {
              sessionParams.metadata = { ...sessionParams.metadata, user_id: userId };
            }

            const session = await stripe.checkout.sessions.create(sessionParams);
            return Response.json({ url: session.url! });
          } catch (error: any) {
            console.error("[team-site] checkout failed", error);
            return Response.json(
              { error: error.message || "Failed to create checkout session" },
              { status: 500 },
            );
          }
        }

        // POST /api/webhooks/stripe — Stripe event webhook (signature verified)
        if (pathname === "/api/webhooks/stripe" && req.method === "POST") {
          return stripeWebhookPost(req);
        }

        // ---- Static Files ----
        if (pathname !== "/") {
          const file = Bun.file(CLIENT_DIR + pathname);
          if (await file.exists()) return new Response(file);
        }

        // ---- SSR (TanStack Start) ----
        return (
          handler as { fetch: (r: Request) => Response | Promise<Response> }
        ).fetch(req);
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}
console.log(`team-site serving on http://${HOST}:${String(PORT)}`);

