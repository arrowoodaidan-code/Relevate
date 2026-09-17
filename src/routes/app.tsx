import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { RelevateMark } from "~/components";
import {
  BrandedTemplateSelector,
  buildStructuredData,
  DesignedRenderButton,
  DesignedOutputCard,
  DesignedDownloadButton,
  DesignedErrorBanner,
  type BrandedTemplateId,
} from "~/components/designed-output";
import { trackEvent } from "~/lib/analytics";
import { ListingPhotoFill } from "~/components/ListingPhotoFill";
import { SuggestionBox } from "~/components/SuggestionBox";
import type { ListingAnalysis } from "~/lib/listing-analysis";
import { DesignCanvasEditor } from "~/components/DesignCanvasEditor";
import { createBlankDesign, DESIGN_PRESETS, type DesignDoc, type DesignPresetId } from "~/lib/design";
import { NativeInlineEditor, type NativeEditorValue } from "~/components/NativeInlineEditor";

// US states for the disclosure jurisdiction selector (task 834b0e71). The full
// list is offered; state-specific DISCLOSURE behaviour exists only for the
// VERIFIED jurisdictions (FL, CA) — every other selection simply supplies the
// fields without claiming any requirement (other-states-candidate, unverified).
const US_STATES: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"],
  ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"],
  ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"],
  ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"],
  ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
];

// --- Saved properties history (owner-requested app updates) ---
interface SavedProperty {
  id: string;
  address: string;
  created_at: string;
  content_types: string[];
}
interface UsageSummary {
  tier: string;
  unlimited: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  label: string;
}
interface SavedContentRow {
  content_type: string;
  content: string;
  created_at: string;
}
interface SavedPropertyDetail {
  id: string;
  address: string;
  created_at: string;
  content_types: string[];
  details: Record<string, unknown> | null;
}
const CONTENT_TYPE_LABELS: Record<string, string> = {
  "property-description": "Description",
  "open-house-flyer": "Flyer",
  "social-media-post": "Social",
  "email-campaign": "Email",
  "listing-summary": "Summary",
};
function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || "there";
}
function applySavedDetailsToForm(
  raw: Record<string, unknown> | null,
  setDetails: React.Dispatch<React.SetStateAction<FormDetails>>,
) {
  if (!raw) return;
  const d = raw as Record<string, unknown>;
  const num = (v: unknown): string => (v == null ? "" : String(v));
  setDetails((prev) => ({
    ...prev,
    address: typeof d.address === "string" ? d.address : prev.address,
    bedrooms: num(d.bedrooms) || prev.bedrooms,
    bathrooms: num(d.bathrooms) || prev.bathrooms,
    sqft: num(d.squareFeet) || prev.sqft,
    price: typeof d.price === "number" && d.price > 0 ? formatPrice(String(d.price)) : prev.price,
    features: Array.isArray(d.keyFeatures) ? (d.keyFeatures as string[]).slice(0, 8) : prev.features,
    sellingPoints: typeof d.description === "string" ? d.description : prev.sellingPoints,
  }));
}

// --- Types ---

interface SavedDesignTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  subscription_tier: string;
}

interface FormDetails {
  address: string;
  bedrooms: string;
  bathrooms: string;
  sqft: string;
  price: string;
  features: string[];
  sellingPoints: string;
}

type FormContentType =
  | "property-description"
  | "open-house-flyer"
  | "social-media"
  | "email-campaign"
  | "listing-summary";

const CONTENT_TYPES: { value: FormContentType; label: string; icon: string; description: string }[] = [
  {
    value: "property-description",
    label: "Property Description",
    icon: "📝",
    description: "SEO-optimized MLS listing description",
  },
  {
    value: "open-house-flyer",
    label: "Open House Flyer",
    icon: "🏠",
    description: "Print-ready open house flyer content",
  },
  {
    value: "social-media",
    label: "Social Media Posts",
    icon: "📱",
    description: "Posts for Instagram, Facebook & LinkedIn",
  },
  {
    value: "email-campaign",
    label: "Email Campaign",
    icon: "✉️",
    description: "Professional email to your list",
  },
  {
    value: "listing-summary",
    label: "Listing Summary",
    icon: "📋",
    description: "Quick summary for presentations & website",
  },
];

const COMMON_FEATURES = [
  "Hardwood Floors",
  "Granite Countertops",
  "Stainless Steel Appliances",
  "Walk-in Closets",
  "Updated Kitchen",
  "New Roof",
  "Central AC",
  "Fireplace",
  "Deck/Patio",
  "Finished Basement",
  "Garage",
  "Fenced Yard",
  "Pool",
  "Smart Home Features",
  "Open Floor Plan",
  "Vaulted Ceilings",
  "In-Unit Laundry",
  "Storage Space",
  "Pet Friendly",
  "Water View",
];

function mapContentType(formType: FormContentType): string {
  if (formType === "social-media") return "social-media-post";
  return formType;
}

function buildApiDetails(
  form: FormDetails,
  tmplDesc: string,
  photos: string[],
  agentName: string,
  logoImage: string | null,
  agentPhoto: string | null,
) {
  const priceNum = Number.parseFloat(form.price.replace(/[^0-9.]/g, ""));
  const sqftNum = Number.parseInt(form.sqft.replace(/[^0-9]/g, ""), 10);
  return {
    address: form.address || "123 Main Street",
    bedrooms: Number.parseInt(form.bedrooms, 10) || 0,
    bathrooms: Number.parseFloat(form.bathrooms) || 0,
    squareFeet: Number.isNaN(sqftNum) ? 0 : sqftNum,
    price: Number.isNaN(priceNum) ? 0 : priceNum,
    keyFeatures:
      form.features.length > 0
        ? form.features
        : ["Open Floor Plan", "Updated Kitchen", "Natural Light"],
    description:
      form.sellingPoints ||
      "Move-in ready with beautiful natural light throughout.",
    ...(tmplDesc ? { templateDescription: tmplDesc } : {}),
    ...(photos.length > 0 ? { images: photos } : {}),
    ...(agentName.trim() ? { agentName: agentName.trim() } : {}),
    ...(logoImage ? { logoImage } : {}),
    ...(agentPhoto ? { agentPhoto } : {}),
  };
}

function formatPrice(val: string): string {
  const num = val.replace(/[^0-9.]/g, "");
  if (!num) return val;
  const n = Number.parseFloat(num);
  if (Number.isNaN(n)) return val;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export const Route = createFileRoute("/app")({
  component: AppDashboard,
});

function AppDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Saved-properties history + monthly usage (owner-requested app updates)
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [savedProps, setSavedProps] = useState<SavedProperty[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savedPanelMsg, setSavedPanelMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setUser(data.user);
        } else {
          navigate({ to: "/login" });
        }
      })
      .catch(() => navigate({ to: "/login" }))
      .finally(() => setAuthLoading(false));
  }, [navigate]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    navigate({ to: "/" });
  }

  const refreshUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage", { credentials: "include" });
      const data = await res.json();
      if (data.success && data.usage) setUsage(data.usage as UsageSummary);
    } catch {
      /* usage panel is non-critical */
    }
  }, []);
  useEffect(() => {
    if (user) void refreshUsage();
  }, [user, refreshUsage]);

  const loadSavedProperties = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch("/api/properties", { credentials: "include" });
      const data = await res.json();
      if (data.success && Array.isArray(data.properties)) {
        setSavedProps(data.properties as SavedProperty[]);
      }
    } catch {
      /* grid is non-critical */
    } finally {
      setSavedLoading(false);
    }
  }, []);
  const loadSavedPropertiesRef = useRef(loadSavedProperties);
  useEffect(() => {
    loadSavedPropertiesRef.current = loadSavedProperties;
  }, [loadSavedProperties]);
  useEffect(() => {
    if (user && savedOpen) void loadSavedPropertiesRef.current();
  }, [user, savedOpen]);
  const handleOpenSaved = useCallback(() => {
    setSavedOpen((v) => !v);
    if (!savedOpen) void loadSavedProperties();
  }, [savedOpen, loadSavedProperties]);
  const handleDeleteSaved = useCallback(async (id: string) => {
    if (!window.confirm("Delete this saved property and all of its generated content? This cannot be undone.")) return;
    setDeletingId(id);
    setSavedPanelMsg(null);
    try {
      const res = await fetch(`/api/properties/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setSavedProps((prev) => prev.filter((p) => p.id !== id));
        setSavedPanelMsg("Property deleted.");
        setTimeout(() => setSavedPanelMsg(null), 2500);
      } else {
        setSavedPanelMsg(data.error || "Failed to delete property.");
      }
    } catch {
      setSavedPanelMsg("Failed to delete property.");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const [details, setDetails] = useState<FormDetails>({
    address: "",
    bedrooms: "3",
    bathrooms: "2",
    sqft: "1800",
    price: "$450,000",
    features: [],
    sellingPoints: "",
  });
  const [contentType, setContentType] = useState<FormContentType>("property-description");
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  // Fair Housing guardrail (task 01bc80ec): server-side risk-pattern result.
  // flagged=true -> hits survived the strict retry; the UI must show them.
  // flagged=false with repaired=true -> the retry produced clean copy; the
  // initially caught phrases are kept for transparency.
  const [fairHousingWarning, setFairHousingWarning] = useState<{
    flagged: boolean;
    repaired?: boolean;
    hits?: Array<{ label: string; matched: string; note: string; outsideFederalSeven: boolean }>;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [customFeature, setCustomFeature] = useState("");
  const [activeTab, setActiveTab] = useState<"input" | "result">("input");
  const resultRef = useRef<HTMLDivElement>(null);

  // Template/brand style state
  const [templateDescription, setTemplateDescription] = useState("");
  // Agent & Logo state (agent name, logo, realtor headshot)
  const [agentName, setAgentName] = useState("");
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [logoImagePreview, setLogoImagePreview] = useState<string | null>(null);
  const [agentPhoto, setAgentPhoto] = useState<string | null>(null);
  const [agentPhotoPreview, setAgentPhotoPreview] = useState<string | null>(null);

  // Agent contact details — filled from listing photos (R6), editable like everything else.
  const [agentPhone, setAgentPhone] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [agentBrokerage, setAgentBrokerage] = useState("");
  // Disclosure profile (task 834b0e71) — licence fields, jurisdiction, NAR
  // declaration, EHO toggle. Persisted to localStorage so they auto-attach to
  // every future render in this browser. All user-supplied, never fabricated.
  const [agentLicense, setAgentLicense] = useState("");
  const [brokerName, setBrokerName] = useState("");
  const [brokerLicense, setBrokerLicense] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [narMember, setNarMember] = useState(false);
  const [ehoFooter, setEhoFooter] = useState(true);
  // Compliance notices returned by /api/render (FL missing-brokerage warning,
  // CA licence confirmation) — surfaced next to the designed preview.
  const [renderWarnings, setRenderWarnings] = useState<{ level: "warning" | "info"; message: string }[]>([]);

  // Apply a listing-photo extraction to the form (R6). Fills every field the
  // vision model read; fields it could not read are blanked (never fabricated)
  // and flagged in the ListingPhotoFill panel for the user to verify.
  const applyListingAnalysis = useCallback((analysis: ListingAnalysis) => {
    const { property, agent } = analysis;
    setDetails((prev) => ({
      ...prev,
      address: property.address || "",
      price: property.price ? formatPrice(property.price) : "",
      bedrooms: property.beds || "",
      bathrooms: property.baths || "",
      sqft: property.sqft || "",
      features: property.keyFeatures.length > 0 ? property.keyFeatures : [],
      sellingPoints: property.description || "",
    }));
    setAgentName(agent.name || "");
    setAgentPhone(agent.phone || "");
    setAgentEmail(agent.email || "");
    setAgentBrokerage(agent.brokerage || "");
    trackEvent("listing_photo_fill_applied");
  }, []);

  // Property photos state (up to 3, stored as resized data URLs)
  const [propertyPhotos, setPropertyPhotos] = useState<string[]>([]);
  const MAX_PROPERTY_PHOTOS = 3;

  // Generated image (kept: feeds the designed-render payload's AI background).
  // Setter was removed with the "Generate matching image" button (owner request);
  // state remains so /api/render can still receive an AI background image.
  const [generatedImage] = useState<string | null>(null);

  // Refine state
  const [refineInstruction, setRefineInstruction] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  // From-scratch (blank canvas) design editor state - native-layer editor
  // (strategic pivot). A DesignDoc is produced here; the renderer (task 2)
  // and save-as-template (task 3) consume it.
  const [designEditorOpen, setDesignEditorOpen] = useState(false);
  const [designDoc, setDesignDoc] = useState<DesignDoc | null>(null);
  const [designPreset, setDesignPreset] = useState<DesignPresetId>("flyer");
  const [designTemplateName, setDesignTemplateName] = useState("");
  const [savedDesigns, setSavedDesigns] = useState<SavedDesignTemplate[]>([]);
  const [designTemplateSaving, setDesignTemplateSaving] = useState(false);
  const [designTemplateMsg, setDesignTemplateMsg] = useState<string | null>(null);
  // Render the custom DesignDoc to PNG via /api/render-design (owner-pivot wiring,
  // task f10f0b99). Separate from the native /api/render path used by the native
  // templates — this one renders the from-scratch canvas exactly as edited.
  const [isDesignRendering, setIsDesignRendering] = useState(false);
  const [designRenderedImage, setDesignRenderedImage] = useState<string | null>(null);
  const [designRenderError, setDesignRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadSavedDesigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const loadSavedDesigns = useCallback(async () => {
    try {
      const res = await fetch("/api/design-templates", { credentials: "include" });
      const data = await res.json();
      if (data.success) setSavedDesigns(data.templates ?? []);
    } catch {
      /* ignore */
    }
  }, []);
  const handleSaveDesignTemplate = async () => {
    if (!designDoc) { setDesignTemplateMsg("Open the design editor and build a design first."); return; }
    const name = designTemplateName.trim();
    if (!name) { setDesignTemplateMsg("Name your template first."); return; }
    setDesignTemplateSaving(true);
    setDesignTemplateMsg(null);
    try {
      const res = await fetch("/api/design-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, design: designDoc }),
      });
      const data = await res.json();
      if (data.success) {
        setDesignTemplateMsg(`Saved “${name}”.`);
        setDesignTemplateName("");
        await loadSavedDesigns();
      } else {
        setDesignTemplateMsg(data.error || "Failed to save template.");
      }
    } catch {
      setDesignTemplateMsg("Failed to save template.");
    } finally {
      setDesignTemplateSaving(false);
    }
  };
  const handleOpenDesignTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/design-templates/${id}`, { credentials: "include" });
      const data = await res.json();
      if (data.success && data.template) {
        const doc = data.template.design as DesignDoc;
        setDesignDoc(doc);
        const p = DESIGN_PRESETS;
        setDesignPreset(
          doc.width === p.flyer.width && doc.height === p.flyer.height ? "flyer"
            : doc.width === p.social.width && doc.height === p.social.height ? "social"
            : "socialPortrait",
        );
        setDesignEditorOpen(true);
        setDesignTemplateMsg(`Opened “${data.template.name}” for editing.`);
      } else {
        setDesignTemplateMsg(data.error || "Could not open template.");
      }
    } catch {
      setDesignTemplateMsg("Could not open template.");
    }
  };
  const handleDeleteDesignTemplate = async (id: string) => {
    try {
      await fetch(`/api/design-templates/${id}`, { method: "DELETE", credentials: "include" });
      await loadSavedDesigns();
    } catch {
      /* ignore */
    }
  };

  const handleRenderDesign = useCallback(async () => {
    if (!designDoc) {
      setDesignRenderError("Open the design editor and build a design first.");
      return;
    }
    setIsDesignRendering(true);
    setDesignRenderError(null);
    try {
      const res = await fetch("/api/render-design", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: designDoc }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDesignRenderError(data.error || "Failed to render design. Please try again.");
        return;
      }
      setDesignRenderedImage(data.imageDataUrl as string);
    } catch {
      setDesignRenderError("Failed to render design. Please try again.");
    } finally {
      setIsDesignRendering(false);
    }
  }, [designDoc]);

  // Render designed output state (server-rendered PNG via /api/render)
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderedImage, setRenderedImage] = useState<string | null>(null);
  // Suggestion-box applied style (prompt under the rendered image). When set, it
  // overrides templateDescription as the brandStyle sent to /api/render, so a
  // user suggestion visibly restyles the rendered flyer/social image.
  const [suggestionStyle, setSuggestionStyle] = useState<string>("");
  // R5 branded-mode layout override ("" = renderer auto-picks by photo/format).
  const [brandedTemplate, setBrandedTemplate] = useState<BrandedTemplateId | "">("");
  // Track the body that produced the current rendered image, so we can detect
  // textarea edits and prompt a re-render.
  const renderedBodyRef = useRef<string | null>(null);
  const renderedBlobUrlRef = useRef<string | null>(null);
  // Abort signal for the in-flight native /api/render request. Guards against an
  // upstream/gateway stall that never resolves (the Scenario-1 live hang): a
  // cold serverless function can exceed the host's ~30s upstream cutoff, leave
  // the fetch hanging, and keep the UI stuck at "Rendering designed flyer…"
  // indefinitely. A client-side timeout aborts it and surfaces a clear error so
  // the spinner always stops.
  const renderAbortRef = useRef<AbortController | null>(null);

  // Revoke any blob URL we created for a rendered design on unmount.
  useEffect(() => {
    return () => {
      if (renderedBlobUrlRef.current) {
        URL.revokeObjectURL(renderedBlobUrlRef.current);
        renderedBlobUrlRef.current = null;
      }
    };
  }, []);

  // Switching content type invalidates a rendered design for the old type.
  useEffect(() => {
    if (renderedBlobUrlRef.current) {
      URL.revokeObjectURL(renderedBlobUrlRef.current);
      renderedBlobUrlRef.current = null;
    }
    setRenderedImage(null);
    renderedBodyRef.current = null;
    setRenderError(null);
  }, [contentType]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setGeneratedContent(null);
    setGenError(null);
    // Fresh generation invalidates any previously rendered design.
    if (renderedBlobUrlRef.current) {
      URL.revokeObjectURL(renderedBlobUrlRef.current);
      renderedBlobUrlRef.current = null;
    }
    setRenderedImage(null);
    renderedBodyRef.current = null;
    setRenderError(null);
    setFairHousingWarning(null);
    setActiveTab("result");

    try {
      const apiDetails = buildApiDetails(details, templateDescription, propertyPhotos, agentName, logoImage, agentPhoto);
      const apiContentType = mapContentType(contentType);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: apiContentType, details: apiDetails }),
      });
      const data = await res.json();
      if (data.success && data.data?.content) {
        setGeneratedContent(data.data.content);
        setFairHousingWarning(data.data.fairHousing ?? null);
        trackEvent("content_generated", { content_type: contentType });
        // Refresh usage + saved-properties grid (server upserts history on every generate).
        void refreshUsage();
        void loadSavedProperties();
      } else {
        setGenError(data.error || "No content was generated. Please try again with more property details.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setGenError(`Generation failed: ${message}. Please try again.`);
    } finally {
      setIsGenerating(false);
    }
  }, [details, contentType, propertyPhotos, agentName, logoImage, agentPhoto]);

  const handleReloadSaved = useCallback(async (id: string) => {
    setSavedPanelMsg(null);
    try {
      const res = await fetch(`/api/properties/${encodeURIComponent(id)}`, { credentials: "include" });
      const data = await res.json();
      if (data.success && data.property) {
        const prop = data.property as SavedPropertyDetail;
        applySavedDetailsToForm(prop.details, setDetails);
        const contents = (data.contents ?? []) as SavedContentRow[];
        if (contents.length > 0) {
          setGeneratedContent(contents[0].content);
          const apiType = contents[0].content_type;
          const formType = (Object.keys(CONTENT_TYPE_LABELS) as string[]).includes(apiType)
            ? ((apiType === "social-media-post" ? "social-media" : apiType) as FormContentType)
            : contentType;
          setContentType(formType);
        }
        setActiveTab("result");
        setSavedPanelMsg(`Loaded "${prop.address}".`);
        setTimeout(() => setSavedPanelMsg(null), 2500);
      } else {
        setSavedPanelMsg(data.error || "Failed to load property.");
      }
    } catch {
      setSavedPanelMsg("Failed to load property.");
    }
  }, [contentType]);

  const handleCopy = useCallback(async () => {
    if (!generatedContent) return;
    try {
      await navigator.clipboard.writeText(generatedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = generatedContent;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [generatedContent]);

  const handleDownload = useCallback(() => {
    if (!generatedContent) return;
    const ext = contentType === "social-media" ? "txt" : "md";
    const filename = `${details.address || "listing"}-${contentType}.${ext}`.replace(/[^a-zA-Z0-9.-]/g, "_");
    const blob = new Blob([generatedContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [generatedContent, contentType, details.address]);


  const handleRefine = useCallback(async () => {
    const instruction = refineInstruction.trim();
    if (!instruction || !generatedContent || isRefining) return;
    setIsRefining(true);
    setRefineError(null);
    try {
      const apiContentType = mapContentType(contentType);
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: apiContentType,
          currentContent: generatedContent,
          instruction,
        }),
      });
      const data = await res.json();
      if (data.success && data.content) {
        setGeneratedContent(data.content);
        setRefineInstruction("");
        trackEvent("content_refined", { content_type: contentType });
      } else {
        setRefineError(data.error || "Failed to refine content. Please try again.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setRefineError(`Refinement failed: ${message}. Please try again.`);
    } finally {
      setIsRefining(false);
    }
  }, [refineInstruction, generatedContent, isRefining, contentType]);

  // Render designed output — POST the current textarea value (plus the AI image,
  // and the optional native brand style) to /api/render and display the returned
  // PNG. The uploaded-raster/region-editor path was retired (owner decision,
  // rev 35) — native templates and the from-scratch DesignDoc editor remain.
  const handleRender = useCallback(
    async (styleOverride?: string, fieldOverrides?: NativeEditorValue) => {
    if (!generatedContent && !fieldOverrides?.body) return;
    if (isRendering) return;
    setIsRendering(true);
    setRenderError(null);
    // Revoke a previous blob URL so we don't leak object URLs on re-render.
    if (renderedBlobUrlRef.current) {
      URL.revokeObjectURL(renderedBlobUrlRef.current);
      renderedBlobUrlRef.current = null;
    }
    // The ENTIRE render body (payload construction + fetch) is wrapped in
    // try/finally so setIsRendering(false) runs on EVERY exit path — success,
    // HTTP/graphical error, abort, or even a synchronous throw in payload
    // construction. Previously a throw while building the payload (e.g. an
    // unguarded .trim() on a non-string value) happened *before* the try/finally
    // and *before* the fetch/abort were set up, leaving the button stuck on
    // "Rendering flyer…" forever with no request and no abort armed — the exact
    // 7-minute hang observed in the field. That can no longer happen.
    try {
      const renderType = contentType === "social-media" ? "social" : "flyer";
      // In-place edits (NativeInlineEditor) pass fieldOverrides so the raster
      // refresh uses the edited values immediately — independent of the async
      // setState commits also made to keep the source form in sync.
      const title =
        (typeof (fieldOverrides?.title ?? details.address) === "string"
          ? (fieldOverrides?.title ?? details.address).trim()
          : "") || "Your Next Home";
      const effBody = fieldOverrides?.body ?? generatedContent ?? "";
      const effAgentName = fieldOverrides?.agentName ?? agentName;
      const payload: Record<string, unknown> = {
        type: renderType,
        title,
        body: effBody, // CURRENT textarea value (may include user edits)
        ...(typeof effAgentName === "string" && effAgentName.trim()
          ? { agentName: effAgentName.trim() }
          : {}),
        // R5 structured listing data — price/beds/baths/sqft/agentPhone are the
        // render-contract names (spec §5); blanks are omitted so nothing is fabricated.
        ...buildStructuredData({
          price: fieldOverrides?.price ?? details.price,
          beds: fieldOverrides?.beds ?? details.bedrooms,
          baths: fieldOverrides?.baths ?? details.bathrooms,
          sqft: fieldOverrides?.sqft ?? details.sqft,
          agentPhone: fieldOverrides?.agentPhone ?? agentPhone, // R6 agent-contact state
        }),
        ...(brandedTemplate ? { brandedTemplate } : {}),
        // Social "first property photo as background" default (owner request): send the
        // first property photo as the bg when rendering a native social post with no AI
        // image. socialPhoto auto-adds a legibility scrim so text stays readable.
        // Honored unless photo-less Classic chosen explicitly.
        ...((generatedImage || (renderType === "social" && propertyPhotos[0] && brandedTemplate !== "social-classic"))
          ? { imageDataUrl: generatedImage || propertyPhotos[0] } : {}),
        ...((() => {
          // Resolve brandStyle ONLY from genuine strings. A non-string (e.g. the
          // DOM click-event object, if the handler were ever wired directly as
          // onClick) must never reach .trim() — that throws "trim is not a
          // function" before /api/render fires. Prefer the first non-empty string.
          const candidates = [styleOverride, suggestionStyle, templateDescription];
          for (const c of candidates) {
            if (typeof c === "string" && c.trim()) return { brandStyle: c.trim() };
          }
          return {};
        })()),
        // Disclosure + EHO footer (task 834b0e71) — user-supplied only; blanks
        // omitted so nothing is fabricated server-side. EHO is DEFAULT-ON in
        // the renderer, so only an explicit off is sent.
        ...(agentBrokerage.trim() ? { brokerageName: agentBrokerage.trim() } : {}),
        ...(jurisdiction ? { jurisdiction } : {}),
        ...(agentLicense.trim() ? { agentLicense: agentLicense.trim() } : {}),
        ...(brokerName.trim() ? { brokerName: brokerName.trim() } : {}),
        ...(brokerLicense.trim() ? { brokerLicense: brokerLicense.trim() } : {}),
        ...(narMember ? { narMember: true } : {}),
        ...(ehoFooter ? {} : { ehoFooter: false }),
      };
      // Native /api/render can be slow on a cold serverless function (the host's
      // upstream cutoff is ~30s). We bound the spinner with a client-side timeout,
      // and auto-retry once on a cold-start timeout/5xx so a slow first render
      // succeeds on the (now-warm) retry instead of leaving the user hanging on
      // "Rendering flyer…". Warm renders complete in ~1-3s, far under this timeout.
      const MAX_ATTEMPTS = 2;
      const TIMEOUT_MS = 45_000;
      const RETRY_DELAY_MS = 1_500;
      let timedOut = false;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          // Briefly pause so a cold function can boot before the retry.
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
        const controller = new AbortController();
        renderAbortRef.current?.abort();
        renderAbortRef.current = controller;
        const timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, TIMEOUT_MS);
        const done = (fn: () => void) => {
          clearTimeout(timeoutId);
          if (renderAbortRef.current === controller) renderAbortRef.current = null;
          fn();
          setIsRendering(false);
        };

        try {
        const res = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify(payload),
        });
        const contentTypeHeader = res.headers.get("content-type") || "";
        if (res.ok && contentTypeHeader.includes("image/")) {
          // Backend returned the PNG directly — make a blob URL for display.
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          renderedBlobUrlRef.current = url;
          setRenderedImage(url);
          setRenderWarnings([]);
          renderedBodyRef.current = fieldOverrides?.body ?? generatedContent;
          trackEvent("content_rendered", { content_type: contentType, render_type: renderType });
          done(() => {});
          return;
        }
        // Fall back to JSON (e.g. { success, imageDataUrl } or { error }).
        const data = await res.json().catch(() => null);
        const imageDataUrl = data?.imageDataUrl || data?.data?.imageDataUrl;
        if (res.ok && imageDataUrl) {
          setRenderedImage(imageDataUrl);
          setRenderWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
          renderedBodyRef.current = fieldOverrides?.body ?? generatedContent;
          trackEvent("content_rendered", { content_type: contentType, render_type: renderType });
          done(() => {});
          return;
        }
        // Transient cold-start failure (timeout / 5xx / 429) → retry once.
        const transient =
          controller.signal.aborted || res.status === 408 || res.status === 429 || res.status >= 500;
        if (transient && attempt < MAX_ATTEMPTS) {
          clearTimeout(timeoutId);
          continue;
        }
        done(() =>
          setRenderError(
            (data?.error as string) ||
              (res.ok
                ? "The render service returned an unexpected response."
                : `Render failed (${res.status}). Please try again.`),
          ),
        );
        return;
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        // Cold-start timeout → retry once (a warm retry usually succeeds fast).
        if (aborted && timedOut && attempt < MAX_ATTEMPTS) {
          clearTimeout(timeoutId);
          continue;
        }
        done(() =>
          setRenderError(
            aborted
              ? "Render is taking longer than usual and timed out. Please try again — the first render after a pause can be slower as the server warms up."
              : `Render failed: ${err instanceof Error ? err.message : "An unexpected error occurred."} Please try again.`,
          ),
        );
        return;
      }
    }
    } catch (err) {
        // Only reached if a synchronous error escaped the retry loop (e.g.
        // payload construction threw). surface it and bail out — the finally
        // still guarantees the spinner is reset.
        setRenderError(
          `Render failed: ${err instanceof Error ? err.message : "An unexpected error occurred."} Please try again.`,
        );
    } finally {
      // Unconditional safety net: whatever happens in the try path, the button
      // is ALWAYS re-enabled. This is what guarantees "Rendering flyer…" can
      // never stick forever, even when an abort wouldn't propagate.
      setIsRendering(false);
    }
  }, [generatedContent, isRendering, contentType, details, agentName, agentPhone, agentBrokerage, agentLicense, brokerName, brokerLicense, jurisdiction, narMember, ehoFooter, generatedImage, templateDescription, suggestionStyle, brandedTemplate]);


  // In-place editing of the native rendered flyer/social (NativeInlineEditor).
  // Commits the edited fields to the source-form state (so the inputs + AI
  // textarea reflect the change and a later manual Re-render keeps it), then
  // immediately re-renders with those same values as handleRender fieldOverrides
  // so the raster refresh is not subject to React's async setState timing.
  const commitNativeEdits = useCallback(
    (changes: NativeEditorValue) => {
      if (!changes || Object.keys(changes).length === 0) return;
      setDetails((prev) => ({
        ...prev,
        ...(changes.title != null ? { address: changes.title } : {}),
        ...(changes.price != null ? { price: changes.price } : {}),
        ...(changes.beds != null ? { bedrooms: changes.beds } : {}),
        ...(changes.baths != null ? { bathrooms: changes.baths } : {}),
        ...(changes.sqft != null ? { sqft: changes.sqft } : {}),
      }));
      if (changes.agentName != null) setAgentName(changes.agentName);
      if (changes.agentPhone != null) setAgentPhone(changes.agentPhone);
      if (changes.body != null) setGeneratedContent(changes.body);
      void handleRender(undefined, changes);
    },
    [handleRender],
  );


  // Suggestion box (prompt under the rendered image) → apply a resolved,
  // renderer-supported style and immediately re-render so the change shows.
  const applySuggestionStyle = useCallback(
    (brandStyle: string) => {
      setSuggestionStyle(brandStyle);
      void handleRender(brandStyle);
    },
    [handleRender],
  );
  const handlePropertyPhotoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Reset so selecting the same file again re-triggers change
    e.target.value = "";
    if (files.length === 0) return;

    const remaining = MAX_PROPERTY_PHOTOS - propertyPhotos.length;
    if (remaining <= 0) {
      alert(`You can upload up to ${MAX_PROPERTY_PHOTOS} property photos.`);
      return;
    }

    files.slice(0, remaining).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        alert("Please select image files only.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Resize large images to max 1024px dimension before storing
        const img = new Image();
        img.onload = () => {
          let finalUrl = dataUrl;
          if (img.width > 1024 || img.height > 1024) {
            const canvas = document.createElement("canvas");
            const scale = Math.min(1024 / img.width, 1024 / img.height);
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            finalUrl = canvas.toDataURL("image/jpeg", 0.85);
          }
          // Enforce cap at add time (multiple files load async)
          setPropertyPhotos((prev) =>
            prev.length >= MAX_PROPERTY_PHOTOS ? prev : [...prev, finalUrl],
          );
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }, [propertyPhotos.length]);

  const handleRemovePropertyPhoto = useCallback((index: number) => {
    setPropertyPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Resize large images to max 1024px dimension before storing
      const img = new Image();
      img.onload = () => {
        if (img.width <= 1024 && img.height <= 1024) {
          setLogoImage(dataUrl);
          setLogoImagePreview(dataUrl);
        } else {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1024 / img.width, 1024 / img.height);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const resized = canvas.toDataURL("image/jpeg", 0.85);
          setLogoImage(resized);
          setLogoImagePreview(resized);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveLogo = useCallback(() => {
    setLogoImage(null);
    setLogoImagePreview(null);
  }, []);

  const handleAgentPhotoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Resize large images to max 1024px dimension before storing
      const img = new Image();
      img.onload = () => {
        if (img.width <= 1024 && img.height <= 1024) {
          setAgentPhoto(dataUrl);
          setAgentPhotoPreview(dataUrl);
        } else {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1024 / img.width, 1024 / img.height);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const resized = canvas.toDataURL("image/jpeg", 0.85);
          setAgentPhoto(resized);
          setAgentPhotoPreview(resized);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveAgentPhoto = useCallback(() => {
    setAgentPhoto(null);
    setAgentPhotoPreview(null);
  }, []);


  const toggleFeature = (feature: string) => {
    setDetails((prev) => ({
      ...prev,
      features: prev.features.includes(feature)
        ? prev.features.filter((f) => f !== feature)
        : [...prev.features, feature],
    }));
  };

  const addCustomFeature = () => {
    if (customFeature.trim() && !details.features.includes(customFeature.trim())) {
      setDetails((prev) => ({
        ...prev,
        features: [...prev.features, customFeature.trim()],
      }));
      setCustomFeature("");
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0a1a0a]">
        <div className="flex items-center gap-2 text-sm text-emerald-300/50">
          <svg className="h-4 w-4 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-dvh bg-[#0a1a0a]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-emerald-900/30 bg-[#0a1a0a]/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2 group">
            <RelevateMark className="h-7 w-7 transition-transform duration-300 group-hover:scale-110" />
            <span className="text-base font-bold text-emerald-100">Relevate</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-emerald-300/50 sm:inline">AI Content Studio</span>
            {usage && (
              <span
                className={`hidden rounded-full px-3 py-1 text-xs font-medium sm:inline ${
                  usage.unlimited
                    ? "bg-emerald-900/50 text-emerald-300/80"
                    : usage.remaining === 0
                      ? "bg-red-900/40 text-red-300"
                      : "bg-emerald-900/50 text-emerald-300/80"
                }`}
                title={usage.unlimited ? "Your plan includes unlimited listings" : "Listings remaining this month"}
              >
                {usage.unlimited ? "∞ Unlimited" : usage.label}
              </span>
            )}
            <span className="hidden text-sm text-emerald-300/60 sm:inline">{user.email}</span>
            <span className="badge-shimmer rounded-full bg-emerald-900/50 px-3 py-1 text-xs font-medium text-emerald-300/80 capitalize">
              {user.subscription_tier === "demo" ? "⭐ Demo" : user.subscription_tier}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-lg wood-button-dark px-4 py-2 text-sm font-medium text-emerald-200/80 shadow-sm"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Tab Navigation */}
      <div className="border-b border-emerald-900/30 bg-[#0a1a0a]/80 sm:hidden">
        <div className="flex">
          <button
            onClick={() => setActiveTab("input")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              activeTab === "input"
                ? "border-b-2 border-emerald-500 text-emerald-100"
                : "text-emerald-300/40 hover:text-emerald-200/60"
            }`}
          >
            Property Details
          </button>
          <button
            onClick={() => setActiveTab("result")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              activeTab === "result"
                ? "border-b-2 border-emerald-500 text-emerald-100"
                : "text-emerald-300/40 hover:text-emerald-200/60"
            }`}
          >
            Results
          </button>
        </div>
      </div>

      {/* Welcome back (owner-requested) */}
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-emerald-100 sm:text-2xl">
              Welcome back, {firstNameOf(user.name)} 👋
            </h1>
            <p className="mt-1 text-sm text-emerald-300/50">
              {usage
                ? usage.unlimited
                  ? "Your plan includes unlimited listings this month."
                  : `You have ${usage.label}.`
                : "Ready to create professional marketing content."}
            </p>
          </div>
          <button
            onClick={handleOpenSaved}
            className="rounded-lg wood-button-dark px-4 py-2 text-sm font-medium text-emerald-200/80 shadow-sm"
          >
            {savedOpen ? "Hide Saved" : `Saved Properties${savedProps.length > 0 ? ` (${savedProps.length})` : ""}`}
          </button>
        </div>
      </div>
      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {savedOpen && (
          <div className="mb-6 rounded-xl border border-emerald-800/30 bg-[#0a1a0a]/60 p-5 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-emerald-100">Saved Properties</h2>
                <p className="mt-0.5 text-xs text-emerald-300/50">
                  Every generated listing is saved here automatically. Click a card to reload it; delete to remove it and its content.
                </p>
              </div>
              {savedPanelMsg && <span className="text-xs text-emerald-300/70">{savedPanelMsg}</span>}
            </div>
            {savedLoading ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg bg-emerald-900/20" />
                ))}
              </div>
            ) : savedProps.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-emerald-800/40 px-4 py-6 text-center text-sm text-emerald-300/40">
                No saved properties yet — generate content for a listing and it will appear here automatically.
              </p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {savedProps.map((p) => (
                  <div
                    key={p.id}
                    className="group flex flex-col justify-between rounded-lg border border-emerald-800/40 bg-[#050f05]/60 p-4 transition hover:border-emerald-600/50"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => void handleReloadSaved(p.id)}
                          className="min-w-0 flex-1 text-left"
                          title="Load this property and its latest content"
                        >
                          <span className="block truncate text-sm font-semibold text-emerald-100 group-hover:text-emerald-50">
                            {p.address}
                          </span>
                          <span className="mt-0.5 block text-xs text-emerald-300/40">
                            {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {p.content_types.length > 0
                              ? ` · ${p.content_types.map((t) => CONTENT_TYPE_LABELS[t] ?? t).join(", ")}`
                              : " · no content"}
                          </span>
                        </button>
                        <button
                          onClick={() => void handleDeleteSaved(p.id)}
                          disabled={deletingId === p.id}
                          aria-label={`Delete saved property ${p.address}`}
                          className="shrink-0 rounded-md p-1.5 text-emerald-300/40 transition hover:bg-red-900/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Delete this saved property"
                        >
                          {deletingId === p.id ? (
                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left Column — Input Panel */}
          <div className={`lg:col-span-2 ${activeTab === "result" ? "hidden sm:hidden lg:block" : ""}`}>
            <div className="rounded-xl border border-emerald-800/30 bg-[#0a1a0a]/60 p-6 shadow-sm backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-emerald-100">Property Details</h2>
              <p className="mt-1 text-sm text-emerald-300/50">
                Enter the listing details to generate professional marketing content.
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-emerald-200/80">Property Address</label>
                  <input
                    type="text"
                    value={details.address}
                    onChange={(e) => setDetails((p) => ({ ...p, address: e.target.value }))}
                    placeholder="123 Main Street, City, State"
                    className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">Bedrooms</label>
                    <input
                      type="number"
                      min="0"
                      value={details.bedrooms}
                      onChange={(e) => setDetails((p) => ({ ...p, bedrooms: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">Bathrooms</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={details.bathrooms}
                      onChange={(e) => setDetails((p) => ({ ...p, bathrooms: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">Sq Ft</label>
                    <input
                      type="text"
                      value={details.sqft}
                      onChange={(e) => setDetails((p) => ({ ...p, sqft: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-emerald-200/80">Price</label>
                  <input
                    type="text"
                    value={details.price}
                    onChange={(e) => setDetails((p) => ({ ...p, price: e.target.value }))}
                    onBlur={(e) => {
                      const formatted = formatPrice(e.target.value);
                      if (formatted !== e.target.value) {
                        setDetails((p) => ({ ...p, price: formatted }));
                      }
                    }}
                    placeholder="$450,000"
                    className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-emerald-200/80">Key Features</label>
                  <p className="text-xs text-emerald-300/40">Select features or add your own</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {COMMON_FEATURES.map((feature) => (
                      <button
                        key={feature}
                        onClick={() => toggleFeature(feature)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
                          details.features.includes(feature)
                            ? "bg-emerald-700 text-emerald-100 shadow-sm"
                            : "bg-emerald-900/30 text-emerald-300/50 hover:bg-emerald-800/40 hover:text-emerald-200/70"
                        }`}
                      >
                        {feature}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={customFeature}
                      onChange={(e) => setCustomFeature(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCustomFeature()}
                      placeholder="Add custom feature..."
                      className="min-w-0 flex-1 rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-1.5 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                    />
                    <button
                      onClick={addCustomFeature}
                      className="rounded-lg wood-button-dark px-3 py-1.5 text-sm font-medium text-emerald-200/80"
                    >
                      Add
                    </button>
                  </div>
                  {details.features.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {details.features.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-800/30 bg-emerald-900/20 px-2.5 py-1 text-xs font-medium text-emerald-200/80"
                        >
                          {f}
                          <button
                            onClick={() => toggleFeature(f)}
                            className="text-emerald-500 hover:text-emerald-300"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-emerald-200/80">Selling Points</label>
                  <textarea
                    value={details.sellingPoints}
                    onChange={(e) => setDetails((p) => ({ ...p, sellingPoints: e.target.value }))}
                    placeholder="Describe what makes this property special — move-in ready, great location, natural light, recently renovated, etc."
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none resize-y"
                  />
                </div>
              </div>

              {/* Listing-photo auto-fill (R6): upload a Realtor.com/Zillow/brokerage
                  listing page → vision extracts property + agent → fills the form
                  (all fields editable, low-confidence flagged). */}
              <ListingPhotoFill onApply={applyListingAnalysis} className="mt-6" />
              {/* Property Photos Section */}
              <details className="mt-6 rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/40 p-4">
                <summary className="cursor-pointer text-sm font-medium text-emerald-200/80 select-none">
                  📷 Property Photos (optional)
                </summary>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">
                      Upload up to {MAX_PROPERTY_PHOTOS} photos of the property
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePropertyPhotoUpload}
                      className="mt-1 block w-full text-sm text-emerald-300/50 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-800/40 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-emerald-100 hover:file:bg-emerald-700/50"
                    />
                    <p className="mt-1 text-xs text-emerald-300/40">
                      AI will use your photos to describe the real home and match generated images.
                    </p>
                  </div>
                  {propertyPhotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {propertyPhotos.map((photo, i) => (
                        <div key={i} className="relative">
                          <img
                            src={photo}
                            alt={`Property photo ${i + 1}`}
                            className="h-20 w-full rounded-lg border border-emerald-800/30 object-cover"
                          />
                          <button
                            onClick={() => handleRemovePropertyPhoto(i)}
                            aria-label={`Remove photo ${i + 1}`}
                            className="absolute right-1 top-1 rounded-full bg-red-900/80 px-1.5 py-0.5 text-xs font-medium leading-none text-red-100 hover:bg-red-800"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-emerald-300/40">
                    Photos are resized to 1024px max before upload. Max 3 photos.
                  </p>
                </div>
              </details>

              {/* Agent & Logo Section */}
              <details className="mt-6 rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/40 p-4">
                <summary className="cursor-pointer text-sm font-medium text-emerald-200/80 select-none">
                  👤 Agent & Logo (optional)
                </summary>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">Agent Name</label>
                    <input
                      type="text"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder='e.g. "Sarah Mitchell"'
                      maxLength={100}
                      className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                    />
                    <p className="mt-1 text-xs text-emerald-300/40">
                      Used in flyer contact sections, "About the Agent", email signatures, and social posts.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">Agent Phone</label>
                    <input
                      type="tel"
                      value={agentPhone}
                      onChange={(e) => setAgentPhone(e.target.value)}
                      placeholder='e.g. "(864) 555-0134"'
                      maxLength={32}
                      className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                    />
                    <p className="mt-1 text-xs text-emerald-300/40">
                      Appears in the flyer/social CTA band. Auto-filled from listing photos when visible.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">Agent Email</label>
                    <input
                      type="email"
                      value={agentEmail}
                      onChange={(e) => setAgentEmail(e.target.value)}
                      placeholder="agent@brokerage.com"
                      maxLength={120}
                      className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">Brokerage / Company</label>
                    <input
                      type="text"
                      value={agentBrokerage}
                      onChange={(e) => setAgentBrokerage(e.target.value)}
                      placeholder="e.g. Mitchell Realty"
                      maxLength={120}
                      className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">State / Jurisdiction</label>
                    <select
                      value={jurisdiction}
                      onChange={(e) => setJurisdiction(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 focus-ring-forest outline-none"
                    >
                      <option value="">Not set</option>
                      {US_STATES.map(([code, name]) => (
                        <option key={code} value={code}>
                          {name} ({code})
                        </option>
                      ))}
                    </select>
                    {jurisdiction === "FL" && (
                      <p className="mt-1 text-xs text-amber-300/70">
                        Florida: the licensed brokerage firm name is required in advertising (Fla. Admin. Code 61J2-10.025) — make sure Brokerage / Company above is filled in.
                      </p>
                    )}
                    {jurisdiction === "CA" && (
                      <p className="mt-1 text-xs text-sky-300/70">
                        California: agent name, DRE licence number and responsible broker identity are rendered when supplied (B&amp;P Code §10140.6). Confirm applicability with your responsible broker.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-emerald-200/80">Agent Licence #</label>
                      <input
                        type="text"
                        value={agentLicense}
                        onChange={(e) => setAgentLicense(e.target.value)}
                        placeholder="e.g. SL312345678"
                        maxLength={40}
                        className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-emerald-200/80">Responsible Broker</label>
                      <input
                        type="text"
                        value={brokerName}
                        onChange={(e) => setBrokerName(e.target.value)}
                        placeholder="e.g. Marta Reyes"
                        maxLength={120}
                        className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-emerald-200/80">Broker Licence #</label>
                      <input
                        type="text"
                        value={brokerLicense}
                        onChange={(e) => setBrokerLicense(e.target.value)}
                        placeholder="e.g. BR98765432"
                        maxLength={40}
                        className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                      />
                    </div>
                    <div className="flex flex-col justify-end gap-2 pb-1">
                      <label className="flex items-center gap-2 text-xs text-emerald-200/70">
                        <input type="checkbox" checked={narMember} onChange={(e) => setNarMember(e.target.checked)} className="accent-emerald-500" />
                        I am an NAR member — render REALTOR® after my name
                      </label>
                      <label className="flex items-center gap-2 text-xs text-emerald-200/70">
                        <input type="checkbox" checked={ehoFooter} onChange={(e) => setEhoFooter(e.target.checked)} className="accent-emerald-500" />
                        Equal Housing Opportunity footer (recommended)
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-emerald-300/40">
                    Licence and brokerage details appear in the small disclosure strip on rendered flyers and social posts — only fields you fill in are rendered, nothing is invented. The Equal Housing Opportunity footer is a RECOMMENDED industry convention, not a legal requirement (the federal requirement is the 11×14 fair-housing poster displayed at your office). Saved in this browser and reused on future renders.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">
                      Logo (optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="mt-1 block w-full text-sm text-emerald-300/50 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-800/40 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-emerald-100 hover:file:bg-emerald-700/50"
                    />
                    {logoImagePreview && (
                      <div className="mt-3 flex items-start gap-3">
                        <img
                          src={logoImagePreview}
                          alt="Logo preview"
                          className="h-20 w-20 rounded-lg border border-emerald-800/30 bg-[#050f05]/60 object-contain"
                        />
                        <button
                          onClick={handleRemoveLogo}
                          className="rounded-lg border border-red-800/40 bg-red-900/20 px-2.5 py-1 text-xs font-medium text-red-300/70 hover:bg-red-900/40"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">
                      Realtor photo / headshot (optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAgentPhotoUpload}
                      className="mt-1 block w-full text-sm text-emerald-300/50 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-800/40 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-emerald-100 hover:file:bg-emerald-700/50"
                    />
                    {agentPhotoPreview && (
                      <div className="mt-3 flex items-start gap-3">
                        <img
                          src={agentPhotoPreview}
                          alt="Realtor photo preview"
                          className="h-20 w-20 rounded-lg border border-emerald-800/30 object-cover"
                        />
                        <button
                          onClick={handleRemoveAgentPhoto}
                          className="rounded-lg border border-red-800/40 bg-red-900/20 px-2.5 py-1 text-xs font-medium text-red-300/70 hover:bg-red-900/40"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-emerald-300/40">
                    Your logo and headshot are used in flyers, emails, and social posts so your branding renders correctly.
                  </p>
                </div>
              </details>

              {/* Template / Brand Style Section */}
              <details className="mt-6 rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/40 p-4">
                <summary className="cursor-pointer text-sm font-medium text-emerald-200/80 select-none">
                  🎨 Template / Brand Style (optional)
                </summary>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-emerald-200/80">
                      Describe your template or brand style
                    </label>
                    <textarea
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      placeholder='e.g. "modern minimalist, navy + gold, lots of white space, serif headings"'
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none resize-y"
                    />
                    <p className="mt-1 text-xs text-emerald-300/40">
                      Describe colors, fonts, layout, and vibe. Your generated content will match this style.
                    </p>
                  </div>
                </div>
              </details>

              <div className="mt-8">
                <h3 className="text-sm font-medium text-emerald-200/80">Content Type</h3>
                <div className="mt-3 grid gap-2">
                  {CONTENT_TYPES.map((ct) => (
                    <button
                      key={ct.value}
                      onClick={() => setContentType(ct.value)}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-200 ${
                        contentType === ct.value
                          ? "border-emerald-600/60 bg-emerald-900/30 shadow-[0_0_10px_rgba(74,140,63,0.15)]"
                          : "border-emerald-800/30 hover:border-emerald-600/40 hover:bg-emerald-900/10"
                      }`}
                    >
                      <span className="text-lg">{ct.icon}</span>
                      <div>
                        <span className={`font-medium ${contentType === ct.value ? "text-emerald-100" : "text-emerald-300/70"}`}>{ct.label}</span>
                        <p className="text-xs text-emerald-300/40">{ct.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="mt-6 w-full rounded-lg wood-button px-6 py-3 text-sm font-semibold text-emerald-100 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                    Generate Content
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Right Column — Results Panel */}
          <div className={`lg:col-span-3 ${activeTab === "input" ? "hidden sm:hidden lg:block" : ""}`}>
            <div className="rounded-xl border border-emerald-800/30 bg-[#0a1a0a]/60 p-6 shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-emerald-100">Generated Content</h2>
                {generatedContent && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-1.5 text-xs font-medium text-emerald-300/70 transition-all duration-200 hover:border-emerald-600/50 hover:bg-emerald-900/20 hover:text-emerald-100"
                    >
                      {copied ? (
                        <>
                          <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-1.5 text-xs font-medium text-emerald-300/70 transition-all duration-200 hover:border-emerald-600/50 hover:bg-emerald-900/20 hover:text-emerald-100"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download
                    </button>
                  </div>
                )}
              </div>


              <div ref={resultRef} className="mt-4 min-h-[400px]">
                {fairHousingWarning && (
                  <div
                    className={`mb-4 rounded-lg border p-3 ${fairHousingWarning.flagged ? "border-amber-700/50 bg-amber-950/30" : "border-emerald-800/40 bg-emerald-950/20"}`}
                    data-fair-housing-warning
                    role="alert"
                  >
                    <p className={`text-sm font-semibold ${fairHousingWarning.flagged ? "text-amber-200" : "text-emerald-200"}`}>
                      {fairHousingWarning.flagged
                        ? "⚠ Fair Housing risk pattern detected — review before publishing"
                        : "Fair Housing check: the first draft tripped the guardrail and was rewritten"}
                    </p>
                    {(fairHousingWarning.hits ?? []).length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {(fairHousingWarning.hits ?? []).map((h) => (
                          <li key={h.matched} className="text-xs leading-snug text-emerald-200/80">
                            <span className="font-medium text-amber-200/90">{h.label}</span> — matched:{" "}
                            <span className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11px]">{h.matched}</span>
                            <span className="block text-[11px] text-emerald-300/50">{h.note}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-[11px] leading-snug text-emerald-300/50">
                      These matches are risk patterns, not regulatory text. A clean result does not mean the content is compliant —
                      your broker and your state commission have final say.
                    </p>
                  </div>
                )}
                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="h-12 w-12 animate-pulse rounded-full bg-emerald-900/30" />
                    <div className="mt-4 h-4 w-48 animate-pulse rounded bg-emerald-900/20" />
                    <div className="mt-3 h-3 w-64 animate-pulse rounded bg-emerald-900/10" />
                    <div className="mt-8 grid w-full max-w-md gap-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-3 animate-pulse rounded bg-emerald-900/10" style={{ width: `${60 + i * 8}%` }} />
                      ))}
                    </div>
                  </div>
                ) : genError ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-900/30 text-red-400">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-emerald-100">Generation Failed</h3>
                    <p className="mt-2 max-w-sm text-sm text-emerald-300/50">{genError}</p>
                    <button
                      onClick={handleGenerate}
                      className="mt-6 rounded-lg wood-button px-4 py-2 text-sm font-semibold text-emerald-100 shadow-sm"
                    >
                      Try Again
                    </button>
                  </div>
                ) : generatedContent ? (
                  <>
                    <div className="rounded-lg border border-emerald-800/30 bg-[#050f05]/60 p-4 sm:p-6">
                      <textarea
                        value={generatedContent}
                        onChange={(e) => setGeneratedContent(e.target.value)}
                        aria-label="Generated content (editable)"
                        spellCheck={false}
                        className="h-72 min-h-72 w-full resize-y whitespace-pre-wrap bg-transparent font-sans text-sm leading-relaxed text-emerald-200/80 placeholder-emerald-600/50 focus:outline-none"
                      />
                      <p className="mt-2 border-t border-emerald-800/20 pt-2 text-xs text-emerald-300/40">
                        ✏️ This content is editable — make changes, then copy or download.
                      </p>
                    </div>

                    {/* Refine box — revise the content already in the box */}
                    <div className="mt-4 border-t border-emerald-800/20 pt-4">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleRefine();
                        }}
                        className="flex gap-2"
                      >
                        <input
                          type="text"
                          value={refineInstruction}
                          onChange={(e) => setRefineInstruction(e.target.value)}
                          disabled={isRefining || isGenerating}
                          placeholder="Tell Relevate what to change — e.g. 'make it more luxurious', 'shorter', 'emphasize the pool'…"
                          className="min-w-0 flex-1 rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-3 py-2 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <button
                          type="submit"
                          disabled={isRefining || isGenerating || refineInstruction.trim().length === 0}
                          className="inline-flex items-center gap-2 rounded-lg wood-button px-4 py-2 text-sm font-semibold text-emerald-100 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isRefining ? (
                            <>
                              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Refining…
                            </>
                          ) : (
                            <>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                              </svg>
                              Refine
                            </>
                          )}
                        </button>
                      </form>
                      {refineError && (
                        <p className="mt-2 text-xs text-red-400/80">{refineError}</p>
                      )}
                      <p className="mt-1.5 text-xs text-emerald-300/40">
                        The AI will revise the content above — including any edits you've made — based on your instruction.
                      </p>
                    </div>

                    {/* Render designed output — flyer / social post (server-rendered PNG) */}
                    {(contentType === "open-house-flyer" || contentType === "social-media") && (
                      <div className="mt-4 border-t border-emerald-800/20 pt-4">
                          <>
                            <BrandedTemplateSelector
                              value={brandedTemplate}
                              onChange={setBrandedTemplate}
                              format={contentType === "social-media" ? "social" : "flyer"}
                              disabled={isRendering || isGenerating || isRefining}
                              className="mb-4"
                            />
                            <div className="flex flex-wrap items-center gap-3">
                              <DesignedRenderButton
                                loading={isRendering}
                                hasRendered={Boolean(renderedImage)}
                                onClick={() => handleRender()}
                                disabled={isGenerating || isRefining}
                                label={contentType === "open-house-flyer" ? "Render designed flyer" : "Render social post"}
                                reRenderLabel="Re-render"
                                loadingLabel={contentType === "open-house-flyer" ? "Rendering flyer…" : "Rendering post…"}
                              />
                              <span className="text-xs text-emerald-300/40">
                                {contentType === "open-house-flyer"
                                  ? "Turn your flyer text into a designed, print-ready graphic."
                                  : "Turn your post text into a designed, share-ready graphic."}
                              </span>
                            </div>
                            {/* Native branded path: the rendered preview is editable
                                IN PLACE — NativeInlineEditor lays scaled hit-targets
                                over the R5 text slots so a click edits that field and
                                re-renders via the same /api/render. The from-scratch
                                editor (below) covers custom blank-canvas designs. */}
                            {renderedImage && renderedBodyRef.current !== generatedContent && (
                              <p className="mt-2 text-xs text-amber-300/70">
                                You've edited the text — click "Re-render" to update the design.
                              </p>
                            )}
                            <DesignedErrorBanner
                              message={renderError}
                              onDismiss={() => setRenderError(null)}
                              className="mt-3"
                            />
                            {renderWarnings.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {renderWarnings.map((w, i) => (
                                  <div
                                    key={i}
                                    className={
                                      w.level === "warning"
                                        ? "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                                        : "rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200"
                                    }
                                  >
                                    {w.message}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="mt-3">
                              <NativeInlineEditor
                                imageUrl={renderedImage}
                                loading={isRendering}
                                format={contentType === "social-media" ? "social" : "flyer"}
                                title={contentType === "open-house-flyer" ? "Designed Flyer" : "Designed Social Post"}
                                alt={contentType === "open-house-flyer" ? "Designed open house flyer" : "Designed social post"}
                                emptyLabel={
                                  contentType === "open-house-flyer"
                                    ? "Render a designed flyer to preview it here."
                                    : "Render a designed social post to preview it here."
                                }
                                values={{
                                  title: details.address,
                                  price: details.price,
                                  beds: details.bedrooms,
                                  baths: details.bathrooms,
                                  sqft: details.sqft,
                                  body: generatedContent ?? "",
                                  agentName,
                                  agentPhone,
                                }}
                                onCommit={commitNativeEdits}
                                footer={
                                  renderedImage ? (
                                    <DesignedDownloadButton
                                      imageUrl={renderedImage}
                                      filename={
                                        contentType === "open-house-flyer"
                                          ? "relevate-flyer.png"
                                          : "relevate-social.png"
                                      }
                                    >
                                      Download PNG
                                    </DesignedDownloadButton>
                                  ) : undefined
                                }
                              />
                            </div>
                            {renderedImage && (
                              <div className="mt-3">
                                <SuggestionBox
                                  type={contentType === "social-media" ? "social" : "flyer"}
                                  currentStyle={suggestionStyle || templateDescription}
                                  onApplyStyle={applySuggestionStyle}
                                />
                              </div>
                            )}
                            {/* From-scratch (blank canvas) design editor - strategic pivot */}
                            <div className="mt-4 pt-4">
                              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-700/40 bg-[#0a1a0a]/40 px-4 py-3">
                                <div>
                                  <div className="text-sm font-semibold text-emerald-100">Design from scratch</div>
                                  <div className="mt-0.5 text-xs text-emerald-300/60">Build a flyer or social post on a blank white canvas - add text, images and shapes, then position, resize, rotate, style and layer them freely.</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {(["flyer","social","socialPortrait"] as DesignPresetId[]).map((p) => {
                                    const pre = DESIGN_PRESETS[p];
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => { setDesignPreset(p); setDesignDoc(null); }}
                                        className={"rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors " + (designPreset === p ? "border-emerald-500 bg-emerald-700/60 text-white" : "border-emerald-800/40 text-emerald-200/70 hover:bg-emerald-900/40")}
                                      >
                                        {pre.label}{" "}<span className="opacity-60">{pre.width}×{pre.height}</span>
                                      </button>
                                    );
                                  })}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!designDoc) setDesignDoc(createBlankDesign(designPreset, contentType === "social-media" ? "Social post" : "Open house flyer"));
                                      setDesignEditorOpen((v) => !v);
                                    }}
                                    className="rounded-lg wood-button px-4 py-1.5 text-xs font-semibold text-emerald-100 shadow-sm"
                                  >
                                    {designEditorOpen ? "Close editor" : designDoc ? "Resume editing" : "Open design editor"}
                                  </button>
                                </div>
                              </div>
                              {/* Save as template + my templates */}
                              <button
                                type="button"
                                onClick={() => { if (savedDesigns.length === 0) loadSavedDesigns(); }}
                                className="mt-3 rounded-lg border border-emerald-700/40 px-3 py-1 text-xs text-emerald-200/70 hover:bg-emerald-900/40"
                              >
                                My Design Templates ({savedDesigns.length})
                              </button>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <input
                                  value={designTemplateName}
                                  onChange={(e) => setDesignTemplateName(e.target.value)}
                                  placeholder="Template name"
                                  className="min-w-0 flex-1 rounded-lg border border-emerald-800/40 bg-[#050f05]/70 px-3 py-2 text-xs text-emerald-100 placeholder-emerald-600/50 outline-none focus:border-emerald-500"
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveDesignTemplate}
                                  disabled={designTemplateSaving || !designDoc}
                                  className="rounded-lg wood-button px-4 py-2 text-xs font-semibold text-emerald-100 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {designTemplateSaving ? "Saving…" : "Save as template"}
                                </button>
                              </div>
                              {designTemplateMsg && (
                                <p className="mt-2 text-xs text-emerald-200/80">{designTemplateMsg}</p>
                              )}
                              {savedDesigns.length > 0 && (
                                <div className="mt-3">
                                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300/50">My templates</div>
                                  <ul className="space-y-1.5">
                                    {savedDesigns.map((t) => (
                                      <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/40 px-3 py-2">
                                        <div className="min-w-0">
                                          <div className="truncate text-xs font-medium text-emerald-100">{t.name}</div>
                                          <div className="text-[10px] text-emerald-300/40">{t.width}×{t.height}</div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <button type="button" onClick={() => handleOpenDesignTemplate(t.id)} className="rounded border border-emerald-700/40 bg-emerald-900/30 px-2 py-1 text-[11px] text-emerald-200/90 hover:bg-emerald-800/40">Open &amp; Edit</button>
                                          <button type="button" onClick={() => handleDeleteDesignTemplate(t.id)} className="rounded border border-red-900/50 px-2 py-1 text-[11px] text-red-300/80 hover:bg-red-900/30">Delete</button>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {/* Render the custom design to PNG via /api/render-design. Applies to
                                  every preset (flyer, social, socialPortrait) — renderDesignDoc uses the
                                  doc's own canvas size, so both flyer 1275×1650 and social 1080×1080 are
                                  covered by this single action. */}
                              <div className="mt-3">
                                <button
                                  type="button"
                                  onClick={handleRenderDesign}
                                  disabled={isDesignRendering || !designDoc}
                                  className="w-full rounded-lg wood-button px-4 py-2 text-xs font-semibold text-emerald-100 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isDesignRendering
                                    ? "Rendering design…"
                                    : designPreset === "flyer"
                                      ? "Render designed flyer (PNG)"
                                      : "Render designed social post (PNG)"}
                                </button>
                                <DesignedErrorBanner
                                  message={designRenderError}
                                  onDismiss={() => setDesignRenderError(null)}
                                  className="mt-3"
                                />
                                <div className="mt-3">
                                  <DesignedOutputCard
                                    imageUrl={designRenderedImage}
                                    loading={isDesignRendering}
                                    title={designPreset === "flyer" ? "Designed Flyer (from scratch)" : "Designed Social Post (from scratch)"}
                                    alt={designPreset === "flyer" ? "Rendered custom flyer design" : "Rendered custom social post design"}
                                    emptyLabel="Edit your design above, then click “Render designed flyer/social post” to preview your custom design as a PNG."
                                    footer={
                                      designRenderedImage ? (
                                        <DesignedDownloadButton
                                          imageUrl={designRenderedImage}
                                          filename={designPreset === "flyer" ? "relevate-custom-flyer.png" : "relevate-custom-social.png"}
                                        >
                                          Download PNG
                                        </DesignedDownloadButton>
                                      ) : undefined
                                    }
                                  />
                                </div>
                              </div>
                              {designEditorOpen && (
                                <div className="mt-3 rounded-lg border border-emerald-800/30 bg-[#061206]/80 p-3">
                                  <DesignCanvasEditor
                                    doc={designDoc ?? createBlankDesign(designPreset, contentType === "social-media" ? "Social post" : "Open house flyer")}
                                    onChange={(next) => setDesignDoc(next)}
                                    className="rounded-lg"
                                  />
                                </div>
                              )}
                            </div>
                          </>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-900/30 text-emerald-500">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-emerald-100">Ready to create content</h3>
                    <p className="mt-2 max-w-sm text-sm text-emerald-300/50">
                      Fill in the property details on the left, select a content type, and click "Generate Content" to create professional marketing materials powered by AI.
                    </p>
                    <div className="mt-6 grid grid-cols-2 gap-3 text-left text-xs text-emerald-300/40">
                      <div className="rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/60 p-3">
                        <div className="font-medium text-emerald-200/80">📝 Property Description</div>
                        <div className="mt-0.5">SEO-optimized MLS listing copy</div>
                      </div>
                      <div className="rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/60 p-3">
                        <div className="font-medium text-emerald-200/80">🏠 Open House Flyer</div>
                        <div className="mt-0.5">Print-ready flyer content</div>
                      </div>
                      <div className="rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/60 p-3">
                        <div className="font-medium text-emerald-200/80">📱 Social Media</div>
                        <div className="mt-0.5">Posts for all platforms</div>
                      </div>
                      <div className="rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/60 p-3">
                        <div className="font-medium text-emerald-200/80">✉️ Email Campaign</div>
                        <div className="mt-0.5">Professional client emails</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}