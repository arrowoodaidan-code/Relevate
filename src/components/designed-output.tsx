/**
 * Designed-output UI components for the Relevate content studio.
 *
 * Renders designed graphics (PNG flyers / social posts) produced by the
 * design renderer (Satori/sharp) inside the dark-forest design system.
 *
 * Components:
 *  - DesignedOutputCard      — themed card that shows the rendered PNG
 *                              (max-width ~500px) with a wood-border glow,
 *                              loading placeholder, and empty state.
 *  - DesignedDownloadButton  — one-click download with a proper filename.
 *  - DesignedRenderButton    — primary amber/wood button with loading
 *                              shimmer + "Render designed flyer"/"Re-render".
 *  - RenderErrorBanner       — inline error banner (dismissable).
 *  - downloadImage           — shared helper the parent can call directly.
 *
 * Props follow the lead's integration contract: imageDataUrl, loading,
 * onRender, filename, children/label. (imageUrl / onClick are accepted as
 * deprecated aliases.)
 *
 * All exports live in this single file so the fullstack engineer can import
 * them without touching other shared files.
 */
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Download any image (same-origin URL, blob URL, or data URL) as a file.
 * Used by DesignedDownloadButton and exported for direct use.
 */
export async function downloadImage(
  imageUrl: string,
  filename: string,
): Promise<void> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Normalise a title into a clean filename slug. */
export function slugifyFilename(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "relevate-designed-output"
  );
}

/* ------------------------------------------------------------------ */
/* DesignedOutputCard                                                  */
/* ------------------------------------------------------------------ */

export interface DesignedOutputCardProps {
  /** Data URL (or same-origin/blob URL) of the rendered PNG. */
  imageDataUrl?: string | null;
  /** @deprecated use imageDataUrl */
  imageUrl?: string | null;
  /** Card header title, e.g. "Designed Flyer". */
  title?: string;
  /** Show the rendering placeholder (spinner + shimmer) while generating. */
  loading?: boolean;
  /** Alt text for the image. */
  alt?: string;
  /** Label shown in the empty state (no image, not loading). */
  emptyLabel?: string;
  /** Extra content in the card footer (e.g. the download button). */
  footer?: ReactNode;
  /** Extra class names for the card shell. */
  className?: string;
}

export function DesignedOutputCard({
  imageDataUrl,
  imageUrl,
  title = "Designed Output",
  loading = false,
  alt = "Rendered design preview",
  emptyLabel = "Render a designed flyer to preview it here.",
  footer,
  className,
}: DesignedOutputCardProps) {
  const src = imageDataUrl ?? imageUrl ?? null;
  return (
    <div
      className={cn(
        "rounded-xl border border-[#5c3d2e]/40 bg-[#0a1a0a]/70 p-5 shadow-sm",
        "shadow-[0_0_24px_rgba(92,61,46,0.12)] transition-all duration-300",
        "hover:border-[#8a5a3b]/50 hover:shadow-[0_0_32px_rgba(92,61,46,0.22)]",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-emerald-100">{title}</h3>
        {src && !loading && (
          <span className="badge-shimmer rounded-full bg-amber-900/40 px-2.5 py-0.5 text-[10px] font-medium text-amber-300/80">
            PNG
          </span>
        )}
      </div>

      <div className="relative overflow-hidden rounded-lg border border-amber-900/30 bg-[#050f05]/70">
        {loading ? (
          /* ---- Loading placeholder: pulsing panel + shimmer sweep ---- */
          <div
            className="relative flex aspect-[4/5] w-full max-w-[500px] items-center justify-center"
            role="status"
            aria-label="Rendering designed output"
          >
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#12260f] via-[#0a1a0a] to-[#1a2e15]"
              style={{ backgroundSize: "200% 200%" }}
            />
            <div
              className="absolute inset-0 animate-pulse-soft opacity-60"
              style={{
                background:
                  "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 55%, transparent 70%)",
                backgroundSize: "250% 100%",
              }}
            />
            <div className="relative flex flex-col items-center gap-3 text-center">
              <div className="wood-button pointer-events-none h-10 w-10 rounded-full p-2.5 opacity-80">
                <svg
                  className="h-full w-full animate-spin text-amber-100"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-90"
                    fill="currentColor"
                    d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                  />
                </svg>
              </div>
              <p className="text-xs font-medium text-emerald-200/70">
                Rendering designed flyer…
              </p>
            </div>
          </div>
        ) : src ? (
          /* ---- Rendered PNG preview (max-width ~500px) ---- */
          <div className="flex justify-center p-3">
            <img
              src={src}
              alt={alt}
              className="animate-grow-in h-auto w-full max-w-[500px] rounded-md shadow-lg shadow-black/40 ring-1 ring-amber-900/20"
              loading="lazy"
            />
          </div>
        ) : (
          /* ---- Empty state ---- */
          <div className="flex aspect-[4/5] w-full max-w-[500px] items-center justify-center p-8 text-center">
            <div className="flex flex-col items-center gap-2 text-emerald-200/40">
              <svg
                className="h-8 w-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                  stroke="currentColor"
                />
                <circle cx="9" cy="9" r="2" stroke="currentColor" />
                <path
                  d="m21 15-3.5-3.5L9 20"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="text-xs">{emptyLabel}</p>
            </div>
          </div>
        )}
      </div>

      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DesignedDownloadButton                                              */
/* ------------------------------------------------------------------ */

export interface DesignedDownloadButtonProps {
  /** Source image to download (data URL, same-origin URL, or blob:). */
  imageDataUrl?: string | null;
  /** @deprecated use imageDataUrl */
  imageUrl?: string | null;
  /** Base filename (extension is forced to .png). */
  filename?: string;
  /** Disable the button (e.g. while loading or no image). */
  disabled?: boolean;
  /** Custom download handler; defaults to downloadImage(). */
  onDownload?: () => void;
  /** Override the button label entirely. */
  children?: ReactNode;
  className?: string;
}

export function DesignedDownloadButton({
  imageDataUrl,
  imageUrl,
  filename = "relevate-designed-flyer.png",
  disabled,
  onDownload,
  children,
  className,
}: DesignedDownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const src = imageDataUrl ?? imageUrl ?? null;
  const canDownload = Boolean(src) && !disabled && !downloading;

  const handleClick = useCallback(async () => {
    if (!src) return;
    setError(null);
    if (onDownload) {
      onDownload();
      return;
    }
    setDownloading(true);
    try {
      const safeName = filename.endsWith(".png")
        ? filename
        : `${filename}.png`;
      await downloadImage(src, safeName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [src, filename, onDownload]);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={!canDownload}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-amber-800/40 px-3.5 py-2",
          "text-xs font-medium text-amber-300/80 transition-all duration-300",
          "hover:border-amber-600/60 hover:bg-amber-900/20 hover:text-amber-100",
          "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-amber-800/40 disabled:hover:bg-transparent disabled:hover:text-amber-300/80",
          className,
        )}
      >
        {downloading ? (
          <>
            <svg
              className="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-90"
                fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
              />
            </svg>
            Downloading…
          </>
        ) : (
          <>
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {children ?? "Download PNG"}
          </>
        )}
      </button>
      {error && <span className="text-[10px] text-red-400/80">{error}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DesignedRenderButton                                                */
/* ------------------------------------------------------------------ */

export interface DesignedRenderButtonProps {
  /** Render in flight: show spinner + shimmer, disable clicks. */
  loading?: boolean;
  /** Whether an output already exists (switches label to "Re-render"). */
  hasRendered?: boolean;
  /** Fired when the user clicks render. */
  onRender?: () => void;
  /** @deprecated use onRender */
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  /** Custom labels; defaults to "Render designed flyer" / "Re-render". */
  label?: string;
  reRenderLabel?: string;
  loadingLabel?: string;
}

export function DesignedRenderButton({
  loading = false,
  hasRendered = false,
  onRender,
  onClick,
  disabled,
  className,
  label = "Render designed flyer",
  reRenderLabel = "Re-render",
  loadingLabel = "Rendering…",
}: DesignedRenderButtonProps) {
  const text = loading
    ? loadingLabel
    : hasRendered
      ? reRenderLabel
      : label;

  return (
    <button
      type="button"
      onClick={onRender ?? onClick}
      disabled={loading || disabled}
      className={cn(
        "wood-button inline-flex items-center gap-2 rounded-lg px-4 py-2.5",
        "text-sm font-semibold text-amber-50",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {loading ? (
        <>
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
            />
          </svg>
          {text}
        </>
      ) : (
        <>
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="M12 5v14m0 0 6-6m-6 6-6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {text}
        </>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* RenderErrorBanner                                                   */
/* ------------------------------------------------------------------ */

export interface RenderErrorBannerProps {
  /** Error text; when null/undefined/empty the banner renders nothing. */
  message?: string | null;
  /** Optional dismiss handler — shows a close button when provided. */
  onDismiss?: () => void;
  className?: string;
}

export function RenderErrorBanner({
  message,
  onDismiss,
  className,
}: RenderErrorBannerProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        "animate-fade-in-up flex items-start gap-3 rounded-lg border border-red-900/50",
        "bg-red-950/30 px-4 py-3 text-sm text-red-200/90",
        className,
      )}
    >
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" />
        <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
      </svg>
      <p className="flex-1 leading-relaxed">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="shrink-0 rounded p-0.5 text-red-300/60 transition hover:text-red-100"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="M6 6l12 12M18 6 6 18"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* R5 branded templates (no-template mode)                             */
/* ------------------------------------------------------------------ */

/**
 * R5 branded-mode layout ids — the 4 real-estate-style templates the
 * no-template renderer dispatches on (spec: shared/r5-branded-design-spec.md §3).
 * Sent to /api/render as the optional `brandedTemplate` field; when absent the
 * renderer auto-selects by format + photo presence.
 */
export type BrandedTemplateId =
  | "flyer-hero"
  | "flyer-classic"
  | "social-photo"
  | "social-classic";

export interface BrandedTemplateOption {
  id: BrandedTemplateId;
  /** Short pill label, e.g. "Hero Photo". */
  label: string;
  /** Full name, e.g. "Flyer — Hero Photo". */
  name: string;
  /** One-line description shown under the selector. */
  description: string;
  /** Which output format this layout applies to. */
  format: "flyer" | "social";
  /** Static thumbnail (public/templates/<id>.png) for the visual gallery. */
  previewUrl: string;
}

export const BRANDED_TEMPLATES: readonly BrandedTemplateOption[] = [
  {
    id: "flyer-hero",
    label: "Hero Photo",
    name: "Flyer — Hero Photo",
    description: "Full-bleed hero photo, FOR SALE ribbon, price band and key-facts strip.",
    format: "flyer",
    previewUrl: "/templates/flyer-hero.png",
  },
  {
    id: "flyer-classic",
    label: "Classic",
    name: "Flyer — Classic",
    description: "No-photo layout: price chip, serif address, highlights grid and wood frame.",
    format: "flyer",
    previewUrl: "/templates/flyer-classic.png",
  },
  {
    id: "social-photo",
    label: "Photo",
    name: "Social — Photo",
    description: "Photo-forward square with JUST LISTED ribbon and overlay headline.",
    format: "social",
    previewUrl: "/templates/social-photo.png",
  },
  {
    id: "social-classic",
    label: "Classic",
    name: "Social — Classic",
    description: "No-photo panel: pill badge, gold price and agent band.",
    format: "social",
    previewUrl: "/templates/social-classic.png",
  },
];

/**
 * Structured listing data the R5 branded renderer displays verbatim (spec §5).
 * Exact field names are the render-contract contract shared with the renderer
 * track (A) and fullstack's R6 auto-fill. All fields optional — the renderer
 * never fabricates: absent price omits the band, absent facts fall back to a
 * best-effort regex over the body copy.
 */
export interface RenderStructuredData {
  price?: string;
  beds?: string;
  baths?: string;
  sqft?: string;
  agentPhone?: string;
}

/** Map form values onto the render contract, omitting anything blank. */
export function buildStructuredData(input: {
  price?: string | null;
  beds?: string | null;
  baths?: string | null;
  sqft?: string | null;
  agentPhone?: string | null;
}): RenderStructuredData {
  const data: RenderStructuredData = {};
  if (typeof input.price === "string" && input.price.trim()) data.price = input.price.trim();
  if (typeof input.beds === "string" && input.beds.trim()) data.beds = input.beds.trim();
  if (typeof input.baths === "string" && input.baths.trim()) data.baths = input.baths.trim();
  if (typeof input.sqft === "string" && input.sqft.trim()) data.sqft = input.sqft.trim();
  if (typeof input.agentPhone === "string" && input.agentPhone.trim()) {
    data.agentPhone = input.agentPhone.trim();
  }
  return data;
}

export interface BrandedTemplateSelectorProps {
  /** Currently selected layout; "" (default) = renderer auto-picks. */
  value: BrandedTemplateId | "";
  onChange: (id: BrandedTemplateId | "") => void;
  /** Restrict options to one output format ("flyer" | "social"). */
  format?: "flyer" | "social";
  disabled?: boolean;
  className?: string;
}

/**
 * R5 template selector — dark-forest themed segmented control for the 4
 * branded layouts. "Auto" lets the renderer pick by format + photo presence;
 * choosing a layout overrides the auto-dispatch for that render.
 */
export function BrandedTemplateSelector({
  value,
  onChange,
  format,
  disabled = false,
  className,
}: BrandedTemplateSelectorProps) {
  const options = BRANDED_TEMPLATES.filter((t) => !format || t.format === format);
  const isActive = (id: BrandedTemplateId | "") => value === id;
  const activeDesc = value
    ? BRANDED_TEMPLATES.find((t) => t.id === value)?.description
    : "Auto picks the best layout for your photo and format.";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-200/70">
          Design Layout
        </span>
        <span className="text-[10px] text-emerald-300/40">branded mode</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("")}
          className={cn(
            "rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-200",
            isActive("")
              ? "wood-button border-amber-700/60 text-emerald-50 shadow-sm"
              : "border-emerald-800/40 bg-[#0d1f0d]/60 text-emerald-200/70 hover:border-emerald-600/40 hover:text-emerald-100",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          Auto
        </button>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            title={opt.name}
            onClick={() => onChange(opt.id)}
            className={cn(
              "group flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-all duration-200",
              isActive(opt.id)
                ? "wood-button border-amber-700/60 text-emerald-50 shadow-sm"
                : "border-emerald-800/40 bg-[#0d1f0d]/60 text-emerald-200/70 hover:border-emerald-600/40 hover:text-emerald-100",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <img
              src={opt.previewUrl}
              alt={opt.name}
              loading="lazy"
              className={cn(
                "h-16 w-auto rounded border border-emerald-900/50 object-contain transition-opacity",
                isActive(opt.id) ? "opacity-100" : "opacity-75 group-hover:opacity-100",
              )}
            />
            <span className="text-xs font-medium">{opt.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-emerald-300/40">{activeDesc}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Backward-compat aliases                                             */
/* ------------------------------------------------------------------ */

/** @deprecated use RenderErrorBanner */
export const DesignedErrorBanner = RenderErrorBanner;
/** @deprecated use RenderErrorBannerProps */
export type DesignedErrorBannerProps = RenderErrorBannerProps;
