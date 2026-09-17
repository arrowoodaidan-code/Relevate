// Vercel Build Output API function entry.
//
// The Build Output Node launcher invokes the default export as a classic Node
// `(req, res)` handler — NOT a web handler. TanStack Start emits a portable web
// fetch handler (dist/server/server.js), so we adapt: Node IncomingMessage → web
// Request, run the fetch handler, stream the web Response back onto ServerResponse.
// Node 22 has global Request/Response/Headers/ReadableStream.
//
// API routes (/api/auth/*) are handled directly before falling through to SSR.
//
// Bundled (with its deps + the SSR handler's dynamic ./assets chunks) into
// .vercel/output/functions/render.func/vercel-entry.js by build-vercel.sh.
import type { IncomingMessage, ServerResponse } from "node:http";

import handler from "./dist/server/server.js";
import { signup, login, verifySession, deleteSession } from "./src/lib/auth";
import { analyzeTemplateRegions, generateContent, generateImage, validateImageDataUrl, validatePropertyImages, validateAgentImages, refineContent } from "./src/lib/ai";
import { analyzeListingPhotos, validateListingImages } from "./src/lib/listing-analysis";
import type { ContentType, PropertyDetails } from "./src/lib/prompts";
import { POST as stripeWebhookPost } from "./src/routes/api/webhooks/stripe";
import { isValidPriceKey, PRICE_KEYS } from "./src/lib/price-keys";
import Stripe from "stripe";
import { renderMarketingPng, validateRenderRequest, eraseAllTemplateText } from "./src/lib/render";
import { disclosureWarnings } from "./src/lib/advertising-rules";
import { resolveRenderSuggestion } from "./src/lib/render-suggestions";
import { captureDemoLead, validateDemoLead } from "./src/lib/leads";
import { sendTransactionalEmail } from "./src/lib/email";
import { deleteProperty, getPropertyWithContent, getUsageSummary, listProperties, upsertPropertyWithContent } from "./src/lib/properties";
import { createTemplate, deleteTemplate, getTemplate, listTemplates, updateTemplate, validateTemplatePayload } from "./src/lib/templates";
import { createDesignTemplate, deleteDesignTemplate, getDesignTemplate, listDesignTemplates, updateDesignTemplate, validateDesignTemplatePayload } from "./src/lib/design-templates";
import { renderDesignDoc } from "./src/lib/render-design";
import type { DesignDoc } from "./src/lib/design";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key);
}

function getBaseUrl(req: IncomingMessage): string {
  const host = req.headers.host ?? "localhost";
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  return `${proto}://${host}`;
}

const fetchHandler = handler as {
  fetch: (request: Request) => Response | Promise<Response>;
};

const toWebRequest = (req: IncomingMessage): Request => {
  const host = req.headers.host ?? "localhost";
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const url = `${proto}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value != null) headers.set(key, value);
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers,
    ...(hasBody
      ? { body: req as unknown as ReadableStream, duplex: "half" }
      : {}),
  } as RequestInit);
};

const SESSION_COOKIE = "session";

function parseCookies(req: IncomingMessage): Record<string, string> {
  const cookieHeader = req.headers.cookie ?? "";
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = rest.join("=").trim();
  });
  return cookies;
}

function setSessionCookie(token: string): string {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

async function authenticate(req: IncomingMessage) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const result = await verifySession(token);
  return result?.user ?? null;
}

function sendJson(res: ServerResponse, status: number, data: unknown, extraHeaders?: Record<string, string>) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.setHeader(k, v);
    }
  }
  res.end(JSON.stringify(data));
}

// Read request body as JSON
function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    // ---- Auth API Routes ----

    // POST /api/auth/signup
    if (pathname === "/api/auth/signup" && req.method === "POST") {
      try {
        const { email, name, password } = await readJson(req);
        const result = await signup(email, name, password);
        sendJson(res, 201, {
          success: true,
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            subscription_tier: result.user.subscription_tier,
          },
        }, { "Set-Cookie": setSessionCookie(result.session.token) });
        return;
      } catch (error: any) {
        sendJson(res, 400, { success: false, error: error.message || "Signup failed" });
        return;
      }
    }

    // POST /api/auth/login
    if (pathname === "/api/auth/login" && req.method === "POST") {
      try {
        const { email, password } = await readJson(req);
        const result = await login(email, password);
        sendJson(res, 200, {
          success: true,
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            subscription_tier: result.user.subscription_tier,
          },
        }, { "Set-Cookie": setSessionCookie(result.session.token) });
        return;
      } catch (error: any) {
        sendJson(res, 401, { success: false, error: error.message || "Login failed" });
        return;
      }
    }

    // POST /api/auth/logout
    if (pathname === "/api/auth/logout" && req.method === "POST") {
      const cookies = parseCookies(req);
      const token = cookies[SESSION_COOKIE];
      if (token) await deleteSession(token);
      sendJson(res, 200, { success: true }, { "Set-Cookie": clearSessionCookie() });
      return;
    }

    // GET /api/auth/me
    if (pathname === "/api/auth/me" && req.method === "GET") {
      const user = await authenticate(req);
      if (user) {
        sendJson(res, 200, { authenticated: true, user });
      } else {
        sendJson(res, 401, { authenticated: false });
      }
      return;
    }

    // POST /api/analyze-template — find editable text/photo regions in a raster template.
    if (pathname === "/api/analyze-template" && req.method === "POST") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const { templateImage, templateWidth, templateHeight } = await readJson(req) as { templateImage?: unknown; templateWidth?: unknown; templateHeight?: unknown };
        if (typeof templateImage !== "string" || !validateImageDataUrl(templateImage)) {
          sendJson(res, 400, { success: false, error: "templateImage must be an image data URL under ~4MB" });
          return;
        }
        const regions = await analyzeTemplateRegions(templateImage);
        // Manual text-authoring pivot (e0f2e06f): return a TEXT-ERASED copy of
        // the raster (all detected lettering inpainted away, background + photos
        // preserved) so the editor can author text manually on a clean base.
        const w = typeof templateWidth === "number" && templateWidth > 0 ? templateWidth : undefined;
        const h = typeof templateHeight === "number" && templateHeight > 0 ? templateHeight : undefined;
        const inpaintedImage = eraseAllTemplateText(templateImage, regions ?? [], w, h);
        sendJson(res, 200, { success: true, regions: regions ?? [], ...(inpaintedImage ? { inpaintedImage } : {}) });
      } catch (error) {
        console.error("[team-site] /api/analyze-template error:", error);
        sendJson(res, 500, { success: false, error: "Failed to analyze template" });
      }
      return;
    }

    // POST /api/analyze-listing — extract property + agent details from listing-service photos (R6)
    if (pathname === "/api/analyze-listing" && req.method === "POST") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const { images } = await readJson(req) as { images?: unknown };
        const check = validateListingImages(images);
        if (!check.ok) { sendJson(res, 400, { success: false, error: check.error }); return; }
        const analysis = await analyzeListingPhotos(check.images);
        if (!analysis) {
          sendJson(res, 422, { success: false, error: "Could not read the listing photos. Try clearer photos of the listing page." });
          return;
        }
        sendJson(res, 200, { success: true, analysis });
      } catch (error) {
        console.error("[team-site] /api/analyze-listing error:", error);
        sendJson(res, 500, { success: false, error: "Failed to analyze listing photos" });
      }
      return;
    }

    // POST /api/render — Render edited marketing content to PNG (requires auth)
    if (pathname === "/api/render" && req.method === "POST") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const parsed = validateRenderRequest(await readJson(req));
        if (!parsed.ok) { sendJson(res, 400, { success: false, error: parsed.error }); return; }
        const imageDataUrl = await renderMarketingPng(parsed.data);
        // Disclosure warnings (task 834b0e71): FL-missing-brokerage surfaces as
        // a warning; CA licence renders come back as a confirmation. The image
        // itself always renders — the UI decides how loudly to surface.
        sendJson(res, 200, { success: true, imageDataUrl, warnings: disclosureWarnings(parsed.data) });
      } catch (error) {
        console.error("[team-site] /api/render error:", error);
        sendJson(res, 500, { success: false, error: "Failed to render PNG" });
      }
      return;
    }
    // POST /api/render-design — Render a from-scratch DesignDoc to PNG (requires auth)
    if (pathname === "/api/render-design" && req.method === "POST") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const body = await readJson(req);
        const doc = body?.doc as DesignDoc | undefined;
        if (!doc || typeof doc.width !== "number" || typeof doc.height !== "number" || !Array.isArray(doc.layers)) {
          sendJson(res, 400, { success: false, error: "Invalid DesignDoc payload (doc.width/height/layers required)" });
          return;
        }
        const out = await renderDesignDoc(doc);
        sendJson(res, 200, { success: true, imageDataUrl: out.dataUrl, width: out.width, height: out.height });
      } catch (error) {
        console.error("[team-site] /api/render-design error:", error);
        sendJson(res, 500, { success: false, error: "Failed to render design PNG" });
      }
      return;
    }

    // POST /api/resolve-render-suggestion — map a natural-language suggestion to a
    // renderer-supported style change (drives /api/render's brandStyle).
    if (pathname === "/api/resolve-render-suggestion" && req.method === "POST") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const body = await readJson(req);
        const result = resolveRenderSuggestion({
          suggestion: body?.suggestion ?? "",
          currentStyle: body?.currentStyle ?? "",
          type: body?.type === "social" ? "social" : "flyer",
        });
        sendJson(res, 200, { success: result.ok, ...result });
      } catch (error) {
        console.error("[team-site] /api/resolve-render-suggestion error:", error);
        sendJson(res, 500, { success: false, reason: "Failed to resolve suggestion." });
      }
      return;
    }

    // POST /api/leads — capture a demo/schedule-a-demo lead (public, no auth).
    if (pathname === "/api/leads" && req.method === "POST") {
      try {
        const check = validateDemoLead(await readJson(req));
        if (!check.ok) { sendJson(res, 400, { success: false, error: check.error }); return; }
        const lead = await captureDemoLead(check.data);
        if (!lead) { sendJson(res, 500, { success: false, error: "Failed to store lead" }); return; }
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
        sendJson(res, 200, { success: true, lead });
      } catch (error) {
        console.error("[team-site] /api/leads error:", error);
        sendJson(res, 500, { success: false, error: "Failed to capture your request" });
      }
      return;
    }

    // ---- Saved Properties API (authenticated; owner-requested history panel) ----
    // GET /api/usage — listings-left-this-month for the user's tier
    if (pathname === "/api/usage" && req.method === "GET") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const usage = await getUsageSummary(user.subscription_tier, user.id);
        sendJson(res, 200, { success: true, usage });
      } catch (error) {
        console.error("[team-site] /api/usage error:", error);
        sendJson(res, 500, { success: false, error: "Failed to load usage" });
      }
      return;
    }
    // GET /api/properties — list the current user's saved properties (newest first)
    if (pathname === "/api/properties" && req.method === "GET") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const properties = await listProperties(user.id);
        sendJson(res, 200, { success: true, properties });
      } catch (error) {
        console.error("[team-site] /api/properties list error:", error);
        sendJson(res, 500, { success: false, error: "Failed to list saved properties" });
      }
      return;
    }
    // POST /api/properties — explicit save of property details + one content row
    if (pathname === "/api/properties" && req.method === "POST") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const body = (await readJson(req)) as { address?: unknown; details?: unknown; contentType?: unknown; content?: unknown };
        const address = typeof body.address === "string" ? body.address.trim() : "";
        const contentType = typeof body.contentType === "string" ? body.contentType : "";
        const content = typeof body.content === "string" ? body.content : "";
        if (!address) { sendJson(res, 400, { success: false, error: "Address is required." }); return; }
        if (!contentType || !content) {
          sendJson(res, 400, { success: false, error: "contentType and content are required to save." });
          return;
        }
        const detailsJson = body.details != null ? JSON.stringify(body.details) : null;
        const propertyId = await upsertPropertyWithContent(user.id, address, detailsJson, contentType, content);
        if (!propertyId) { sendJson(res, 500, { success: false, error: "Failed to save property" }); return; }
        sendJson(res, 201, { success: true, propertyId });
      } catch (error) {
        console.error("[team-site] /api/properties create error:", error);
        sendJson(res, 500, { success: false, error: "Failed to save property" });
      }
      return;
    }
    // GET/DELETE /api/properties/:id — fetch (with content) or delete one (owner only)
    const propertyIdMatch = pathname.match(/^\/api\/properties\/([^/]+)$/);
    if (propertyIdMatch) {
      const propId = decodeURIComponent(propertyIdMatch[1]);
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      if (req.method === "GET") {
        try {
          const found = await getPropertyWithContent(user.id, propId);
          if (!found) { sendJson(res, 404, { success: false, error: "Property not found" }); return; }
          sendJson(res, 200, { success: true, ...found });
        } catch (error) {
          console.error("[team-site] /api/properties get error:", error);
          sendJson(res, 500, { success: false, error: "Failed to load property" });
        }
        return;
      }
      if (req.method === "DELETE") {
        try {
          const deleted = await deleteProperty(user.id, propId);
          if (!deleted) { sendJson(res, 404, { success: false, error: "Property not found" }); return; }
          sendJson(res, 200, { success: true });
        } catch (error) {
          console.error("[team-site] /api/properties delete error:", error);
          sendJson(res, 500, { success: false, error: "Failed to delete property" });
        }
        return;
      }
    }
    // ---- Saved DesignDoc Templates API (authenticated; rev-35 pivot) ----
    // POST /api/design-templates — Save a from-scratch DesignDoc as a named template
    if (pathname === "/api/design-templates" && req.method === "POST") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const parsed = validateDesignTemplatePayload(await readJson(req), false);
        if (!parsed.ok) { sendJson(res, 400, { success: false, error: parsed.error }); return; }
        const template = await createDesignTemplate(user.id, { name: parsed.data.name!, design: parsed.data.design! });
        sendJson(res, 201, { success: true, template });
      } catch (error) {
        console.error("[team-site] /api/design-templates create error:", error);
        sendJson(res, 500, { success: false, error: "Failed to create design template" });
      }
      return;
    }
    // GET /api/design-templates — List the current user's saved designs
    if (pathname === "/api/design-templates" && req.method === "GET") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const templates = await listDesignTemplates(user.id);
        sendJson(res, 200, { success: true, templates });
      } catch (error) {
        console.error("[team-site] /api/design-templates list error:", error);
        sendJson(res, 500, { success: false, error: "Failed to list design templates" });
      }
      return;
    }
    // GET/PUT/DELETE /api/design-templates/:id — Fetch, update, or delete one (owner only)
    const designTemplateIdMatch = pathname.match(/^\/api\/design-templates\/([^/]+)$/);
    if (designTemplateIdMatch) {
      const templateId = decodeURIComponent(designTemplateIdMatch[1]);
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      if (req.method === "GET") {
        try {
          const template = await getDesignTemplate(user.id, templateId);
          if (!template) { sendJson(res, 404, { success: false, error: "Design template not found" }); return; }
          sendJson(res, 200, { success: true, template });
        } catch (error) {
          console.error("[team-site] /api/design-templates get error:", error);
          sendJson(res, 500, { success: false, error: "Failed to fetch design template" });
        }
        return;
      }
      if (req.method === "PUT") {
        try {
          const parsed = validateDesignTemplatePayload(await readJson(req), true);
          if (!parsed.ok) { sendJson(res, 400, { success: false, error: parsed.error }); return; }
          const template = await updateDesignTemplate(user.id, templateId, parsed.data);
          if (!template) { sendJson(res, 404, { success: false, error: "Design template not found" }); return; }
          sendJson(res, 200, { success: true, template });
        } catch (error) {
          console.error("[team-site] /api/design-templates update error:", error);
          sendJson(res, 500, { success: false, error: "Failed to update design template" });
        }
        return;
      }
      if (req.method === "DELETE") {
        try {
          const deleted = await deleteDesignTemplate(user.id, templateId);
          if (!deleted) { sendJson(res, 404, { success: false, error: "Design template not found" }); return; }
          sendJson(res, 200, { success: true });
        } catch (error) {
          console.error("[team-site] /api/design-templates delete error:", error);
          sendJson(res, 500, { success: false, error: "Failed to delete design template" });
        }
        return;
      }
      return;
    }
    // ---- Saved Design Templates API (authenticated) ----

    // POST /api/templates — Create a saved design template
    if (pathname === "/api/templates" && req.method === "POST") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const parsed = validateTemplatePayload(await readJson(req), false);
        if (!parsed.ok) { sendJson(res, 400, { success: false, error: parsed.error }); return; }
        const template = await createTemplate(user.id, {
          name: parsed.data.name!,
          image_data_url: parsed.data.image_data_url!,
          width: parsed.data.width!,
          height: parsed.data.height!,
          style_description: parsed.data.style_description,
          regions: parsed.data.regions,
        });
        sendJson(res, 201, { success: true, template });
      } catch (error) {
        console.error("[team-site] /api/templates create error:", error);
        sendJson(res, 500, { success: false, error: "Failed to create template" });
      }
      return;
    }

    // GET /api/templates — List the current user's templates
    if (pathname === "/api/templates" && req.method === "GET") {
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }
      try {
        const templates = await listTemplates(user.id);
        sendJson(res, 200, { success: true, templates });
      } catch (error) {
        console.error("[team-site] /api/templates list error:", error);
        sendJson(res, 500, { success: false, error: "Failed to list templates" });
      }
      return;
    }

    // GET/PUT/DELETE /api/templates/:id — Fetch, update, or delete one template (owner only)
    const templateIdMatch = pathname.match(/^\/api\/templates\/([^/]+)$/);
    if (templateIdMatch) {
      const templateId = decodeURIComponent(templateIdMatch[1]);
      const user = await authenticate(req);
      if (!user) { sendJson(res, 401, { success: false, error: "Authentication required. Please log in." }); return; }

      if (req.method === "GET") {
        try {
          const template = await getTemplate(user.id, templateId);
          if (!template) { sendJson(res, 404, { success: false, error: "Template not found" }); return; }
          sendJson(res, 200, { success: true, template });
        } catch (error) {
          console.error("[team-site] /api/templates get error:", error);
          sendJson(res, 500, { success: false, error: "Failed to fetch template" });
        }
        return;
      }

      if (req.method === "PUT") {
        try {
          const parsed = validateTemplatePayload(await readJson(req), true);
          if (!parsed.ok) { sendJson(res, 400, { success: false, error: parsed.error }); return; }
          const template = await updateTemplate(user.id, templateId, parsed.data);
          if (!template) { sendJson(res, 404, { success: false, error: "Template not found" }); return; }
          sendJson(res, 200, { success: true, template });
        } catch (error) {
          console.error("[team-site] /api/templates update error:", error);
          sendJson(res, 500, { success: false, error: "Failed to update template" });
        }
        return;
      }

      if (req.method === "DELETE") {
        try {
          const deleted = await deleteTemplate(user.id, templateId);
          if (!deleted) { sendJson(res, 404, { success: false, error: "Template not found" }); return; }
          sendJson(res, 200, { success: true });
        } catch (error) {
          console.error("[team-site] /api/templates delete error:", error);
          sendJson(res, 500, { success: false, error: "Failed to delete template" });
        }
        return;
      }
    }

    // POST /api/generate — Generate marketing content (requires auth)
    if (pathname === "/api/generate" && req.method === "POST") {
      const user = await authenticate(req);
      if (!user) {
        sendJson(res, 401, { error: "Authentication required. Please log in." });
        return;
      }

      try {
        const body = await readJson(req);
        const { contentType, details } = body as {
          contentType: ContentType;
          details: PropertyDetails;
        };

        if (!contentType || !details) {
          sendJson(res, 400, {
            error: "Missing required fields: contentType and details are required",
          });
          return;
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
            sendJson(res, 400, {
              error: `Missing required field: ${label} is required for generation`,
            });
            return;
          }
          if (typeof v !== "number" || !Number.isFinite(v)) {
            sendJson(res, 400, {
              error: `Invalid ${label}: must be a finite number`,
            });
            return;
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
          sendJson(res, 400, {
            error: `Invalid contentType. Must be one of: ${validContentTypes.join(", ")}`,
          });
          return;
        }

        // Enforce property photo cap & validity (max 3 image data URLs)
        const imageCheck = validatePropertyImages(details.images);
        if (!imageCheck.ok) {
          sendJson(res, 400, { error: imageCheck.error });
          return;
        }
        details.images = imageCheck.images;

        // Validate agent branding fields (name + logo/headshot images)
        if (
          details.agentName != null &&
          (typeof details.agentName !== "string" || details.agentName.length > 100)
        ) {
          sendJson(res, 400, { error: "agentName must be a string under 100 characters" });
          return;
        }
        const agentCheck = validateAgentImages(details.logoImage, details.agentPhoto);
        if (!agentCheck.ok) {
          sendJson(res, 400, { error: agentCheck.error });
          return;
        }

        const result = await generateContent(
          contentType as ContentType,
          details as PropertyDetails,
        );

        // Persist to the saved-properties history (owner-requested): upsert the
        // property row (address = display name) + content row so the /app grid
        // can list/reload/delete it. Awaiting keeps the old FK violation
        // impossible and lets the UI refresh its saved grid immediately;
        // failures never break generation.
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
          console.error("[team-site] /api/generate save-to-history error:", saveErr);
        }

        sendJson(res, 200, {
          success: true,
          data: {
            content: result.content,
            contentType,
            source: result.source,
            ...(result.fairHousing ? { fairHousing: result.fairHousing } : {}),
            ...(savedPropertyId ? { savedPropertyId } : {}),
          },
        });
        return;
      } catch (error: any) {
        console.error("[team-site] /api/generate error:", error);
        sendJson(res, 500, {
          error: "Failed to generate content",
          details: error.message || "Unknown error",
        });
        return;
      }
    }

    // GET /api/generate — Health check / info endpoint (public)
    if (pathname === "/api/generate" && req.method === "GET") {
      sendJson(res, 200, {
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
      return;
    }

    // POST /api/generate-image — Generate a matching image for content (requires auth)
    if (pathname === "/api/generate-image" && req.method === "POST") {
      const user = await authenticate(req);
      if (!user) {
        sendJson(res, 401, { error: "Authentication required. Please log in." });
        return;
      }

      try {
        const body = await readJson(req);
        const { contentType, details, templateImage: bodyImage } = body as {
          contentType: ContentType;
          details: PropertyDetails;
          templateImage?: string;
        };

        if (!contentType || !details) {
          sendJson(res, 400, {
            error: "Missing required fields: contentType and details are required",
          });
          return;
        }

        const validImageTypes = [
          "open-house-flyer",
          "social-media-post",
          "listing-summary",
        ];
        if (!validImageTypes.includes(contentType)) {
          sendJson(res, 400, {
            error: `Image generation not supported for: ${contentType}. Use: ${validImageTypes.join(", ")}`,
          });
          return;
        }

        // Enforce property photo cap & validity (max 3 image data URLs)
        const imageCheck = validatePropertyImages(details.images);
        if (!imageCheck.ok) {
          sendJson(res, 400, { error: imageCheck.error });
          return;
        }

        // Validate agent branding fields (name + logo/headshot images)
        if (
          details.agentName != null &&
          (typeof details.agentName !== "string" || details.agentName.length > 100)
        ) {
          sendJson(res, 400, { error: "agentName must be a string under 100 characters" });
          return;
        }
        const agentCheck = validateAgentImages(details.logoImage, details.agentPhoto);
        if (!agentCheck.ok) {
          sendJson(res, 400, { error: agentCheck.error });
          return;
        }

        const mergedDetails = {
          ...details,
          images: imageCheck.images,
          ...(bodyImage ? { templateImage: bodyImage } : {}),
        };

        const { imageDataUrl, fairHousing: imageFairHousing } = await generateImage(
          contentType as ContentType,
          mergedDetails as PropertyDetails,
        );

        sendJson(res, 200, { success: true, imageDataUrl, ...(imageFairHousing ? { fairHousing: imageFairHousing } : {}) });
        return;
      } catch (error: any) {
        console.error("[team-site] /api/generate-image error:", error);
        sendJson(res, error.message?.includes("configured") ? 500 : 400, {
          error: error.message || "Failed to generate image",
        });
        return;
      }
    }

    // POST /api/refine — Refine existing generated content (requires auth)
    if (pathname === "/api/refine" && req.method === "POST") {
      const user = await authenticate(req);
      if (!user) {
        sendJson(res, 401, { error: "Authentication required. Please log in." });
        return;
      }

      try {
        const body = await readJson(req);
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
          sendJson(res, 400, {
            error: `Invalid contentType. Must be one of: ${validContentTypes.join(", ")}`,
          });
          return;
        }

        if (!currentContent || typeof currentContent !== "string" || currentContent.trim().length === 0) {
          sendJson(res, 400, {
            error: "currentContent is required and must be a non-empty string",
          });
          return;
        }

        if (!instruction || typeof instruction !== "string" || instruction.trim().length === 0) {
          sendJson(res, 400, {
            error: "instruction is required and must be a non-empty string",
          });
          return;
        }

        if (instruction.length > 500) {
          sendJson(res, 400, {
            error: "instruction must be 500 characters or fewer",
          });
          return;
        }

        const { revised, fairHousing: refineFairHousing } = await refineContent(
          contentType as ContentType,
          currentContent,
          instruction,
        );

        sendJson(res, 200, { success: true, content: revised, ...(refineFairHousing ? { fairHousing: refineFairHousing } : {}) });
        return;
      } catch (error: any) {
        console.error("[team-site] /api/refine error:", error);
        sendJson(res, 500, {
          error: "Failed to refine content",
          details: error.message || "Unknown error",
        });
        return;
      }
    }

    // POST /api/create-checkout-session — Stripe subscription checkout
    if (pathname === "/api/create-checkout-session" && req.method === "POST") {
      try {
        const { priceLookupKey, userId: bodyUserId } = await readJson(req);
        if (!priceLookupKey || !isValidPriceKey(priceLookupKey)) {
          sendJson(res, 400, {
            error: `Invalid priceLookupKey: ${priceLookupKey}. Must be one of: ${PRICE_KEYS.join(", ")}`,
          });
          return;
        }

        // Link the checkout to the logged-in user (from session cookie) so the
        // webhook can upgrade their tier after payment.
        const authedUser = await authenticate(req);
        const userId = authedUser?.id ?? bodyUserId;

        // Block checkout for demo accounts — never bills, never creates a Stripe customer
        if (authedUser?.subscription_tier === "demo") {
          sendJson(res, 403, {
            success: false,
            error: "Demo accounts have full access and never require billing.",
          });
          return;
        }

        const stripe = getStripe();
        const prices = await stripe.prices.list({
          lookup_keys: [priceLookupKey],
          limit: 1,
          active: true,
        });

        if (prices.data.length === 0) {
          sendJson(res, 400, {
            error: `No active Stripe price found with lookup_key: "${priceLookupKey}". Ensure prices are created in the Stripe dashboard with lookup_keys matching: starter_monthly, pro, team, starter_annual, pro_annual, team_annual.`,
          });
          return;
        }

        const priceId = prices.data[0].id;
        const baseUrl = getBaseUrl(req);

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
        sendJson(res, 200, { url: session.url! });
        return;
      } catch (error: any) {
        console.error("[team-site] checkout failed", error);
        sendJson(res, 500, { error: error.message || "Failed to create checkout session" });
        return;
      }
    }

    // POST /api/webhooks/stripe — Stripe event webhook (signature verified)
    if (pathname === "/api/webhooks/stripe" && req.method === "POST") {
      try {
        const webRes = await stripeWebhookPost(toWebRequest(req));
        res.statusCode = webRes.status;
        webRes.headers.forEach((value, key) => res.setHeader(key, value));
        const text = await webRes.text();
        if (text) res.end(text);
        else res.end();
        return;
      } catch (error: any) {
        console.error("[team-site] webhook handler error", error);
        sendJson(res, 500, { error: "Webhook handler failed" });
        return;
      }
    }

    // ---- SSR (TanStack Start) ----
    const webRes = await fetchHandler.fetch(toWebRequest(req));
    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => res.setHeader(key, value));
    if (webRes.body) {
      const reader = webRes.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (error) {
    console.error("[team-site] request failed", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain");
    res.end("Internal Server Error");
  }
}
