/**
 * ListingPhotoFill (R6) — additive "Fill from listing photo" control.
 *
 * Lets an agent upload photo(s) of a listing-service page (Realtor.com/Zillow/
 * brokerage site), vision-extracts the property + agent/company details via
 * POST /api/analyze-listing, auto-fills the generation form (through the
 * onApply callback), and flags low-confidence fields in amber so the user can
 * verify. All filled form fields remain editable — this component only writes
 * them once.
 *
 * Self-contained on purpose: it owns its upload/preview/loading/error state and
 * does not modify PropertyInputForm or designed-output.
 */
import { useCallback, useRef, useState } from "react";
import type { ListingAnalysis } from "~/lib/listing-analysis";
import { lowConfidenceFields } from "~/lib/listing-analysis";

const MAX_LISTING_PHOTOS = 3;

const FIELD_LABELS: Record<string, string> = {
  address: "Address",
  price: "Price",
  beds: "Bedrooms",
  baths: "Bathrooms",
  sqft: "Sq Ft",
  keyFeatures: "Key features",
  description: "Description",
  agentName: "Agent name",
  agentPhone: "Agent phone",
  agentEmail: "Agent email",
  agentBrokerage: "Brokerage",
};

interface ListingPhotoFillProps {
  /** Called once with the extracted analysis so the parent can fill its form. */
  onApply: (analysis: ListingAnalysis) => void;
  className?: string;
}

function resizeImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        if (img.width <= 1024 && img.height <= 1024) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement("canvas");
        const scale = Math.min(1024 / img.width, 1024 / img.height);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = dataUrl;
  });
}

export function ListingPhotoFill({ onApply, className }: ListingPhotoFillProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ListingAnalysis | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [filled, setFilled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length === 0) return;
    const remaining = MAX_LISTING_PHOTOS - photos.length;
    if (remaining <= 0) {
      setError(`You can upload up to ${MAX_LISTING_PHOTOS} listing photos.`);
      return;
    }
    setError(null);
    setResult(null);
    setFilled(false);
    const accepted = files
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, remaining);
    if (accepted.length !== files.length) {
      setError("Please select image files only.");
    }
    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        resizeImage(reader.result as string)
          .then((dataUrl) =>
            setPhotos((prev) =>
              prev.length >= MAX_LISTING_PHOTOS ? prev : [...prev, dataUrl],
            ),
          )
          .catch(() => setError("Could not read that image."));
      };
      reader.readAsDataURL(file);
    });
  }, [photos.length]);

  const handleRemove = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
    setFilled(false);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (photos.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ images: photos }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.analysis) {
        setError(
          data.error ||
            "Could not read the listing photos. Try clearer photos of the listing page.",
        );
        return;
      }
      const analysis = data.analysis as ListingAnalysis;
      setResult(analysis);
      setFlags(lowConfidenceFields(analysis));
      setFilled(true);
      onApply(analysis);
    } catch {
      setError("Listing photo analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [photos, onApply]);

  return (
    <div className={className}>
      <div className="rounded-lg border border-emerald-800/30 bg-[#0a1a0a]/40 p-4">
        <div className="flex items-start gap-2">
          <span className="text-base leading-none" aria-hidden>
            📋
          </span>
          <div>
            <p className="text-sm font-medium text-emerald-200/80">
              Fill from listing photo
            </p>
            <p className="mt-0.5 text-xs text-emerald-300/40">
              Upload a photo of a Realtor.com / Zillow / brokerage listing page and
              Relevate will auto-fill the property and agent fields below. Everything
              stays editable — check the amber flags for anything we weren't sure of.
            </p>
          </div>
        </div>

        <div className="mt-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            className="block w-full text-sm text-emerald-300/50 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-800/40 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-emerald-100 hover:file:bg-emerald-700/50"
          />
          <p className="mt-1 text-xs text-emerald-300/40">
            Up to {MAX_LISTING_PHOTOS} photos of the listing page. Screenshots work
            best — the clearer the text, the more we can extract.
          </p>
        </div>

        {photos.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((photo, i) => (
              <div key={i} className="relative">
                <img
                  src={photo}
                  alt={`Listing photo ${i + 1}`}
                  className="h-20 w-full rounded-lg border border-emerald-800/30 bg-[#050f05]/60 object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute right-1 top-1 rounded-full bg-red-900/80 px-1.5 py-0.5 text-xs font-medium leading-none text-red-100 hover:bg-red-800"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={photos.length === 0 || loading}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-800/40 bg-amber-900/30 px-3 py-1.5 text-sm font-medium text-amber-200 hover:bg-amber-900/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border border-amber-300/40 border-t-amber-200" />
              Reading listing…
            </>
          ) : (
            <>⚡ Fill form from listing photo</>
          )}
        </button>

        {error && (
          <p className="mt-3 rounded-lg border border-red-800/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        {filled && result && (
          <div className="mt-3 space-y-2 text-xs">
            <p className="text-emerald-200/80">
              ✓ Filled the form from the listing photo. Review the values below —
              every field in the form is still editable.
            </p>
            <div className="rounded-lg border border-emerald-800/30 bg-[#050f05]/60 px-3 py-2">
              <p className="font-medium text-emerald-200/90">Extracted</p>
              <ul className="mt-1 space-y-0.5 text-emerald-300/70">
                {result.property.address && <li>• {result.property.address}</li>}
                {result.property.price && <li>• {result.property.price}</li>}
                {(result.property.beds || result.property.baths || result.property.sqft) && (
                  <li>
                    •{" "}
                    {[
                      result.property.beds && `${result.property.beds} bed`,
                      result.property.baths && `${result.property.baths} bath`,
                      result.property.sqft && `${result.property.sqft} sq ft`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </li>
                )}
                {result.agent.name && <li>• Agent: {result.agent.name}</li>}
                {result.agent.phone && <li>• Phone: {result.agent.phone}</li>}
                {result.agent.email && <li>• Email: {result.agent.email}</li>}
                {result.agent.brokerage && <li>• Brokerage: {result.agent.brokerage}</li>}
                {result.property.keyFeatures.length > 0 && (
                  <li>• {result.property.keyFeatures.slice(0, 4).join(", ")}{result.property.keyFeatures.length > 4 ? "…" : ""}</li>
                )}
              </ul>
            </div>
            {flags.length > 0 && (
              <div
                className="rounded-lg border border-amber-800/40 bg-amber-900/20 px-3 py-2"
                role="status"
              >
                <p className="font-medium text-amber-200">
                  ⚠ Please verify — the photo wasn't fully legible for:
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-amber-300/80">
                  {flags.map((field) => (
                    <li key={field}>
                      <span
                        className="cursor-help border-b border-dotted border-amber-500/50"
                        title="This field may be missing or hard to read in the photo — check it before generating."
                      >
                        {FIELD_LABELS[field] ?? field}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-amber-300/60">
                  Fields we couldn't read were left blank; fields we filled with low
                  confidence are listed above. Update them in the form as needed.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
