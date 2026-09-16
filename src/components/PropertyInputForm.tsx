import { useState } from "react";
import { cn } from "~/lib/utils";

export interface PropertyData {
  address: string;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  price: string;
  listingStatus: string;
  features: string[];
  description: string;
  /** Optional — displayed in flyer/social contact sections (R5). */
  agentPhone?: string;
}

/** Backward-compatible alias used by the components barrel (index.ts). */
export type PropertyInputFormData = PropertyData;

interface PropertyInputFormProps {
  onSubmit: (data: PropertyData) => void;
  className?: string;
  initialData?: Partial<PropertyData>;
  submitLabel?: string;
}

const propertyTypes = [
  "Single Family Home",
  "Condo",
  "Townhouse",
  "Multi-Family",
  "Land",
  "Commercial",
  "Luxury Estate",
  "Other",
];

const listingStatuses = [
  "Active",
  "Pending",
  "Sold",
  "Coming Soon",
  "For Rent",
];

export function PropertyInputForm({
  onSubmit,
  className,
  initialData,
  submitLabel = "Generate Content",
}: PropertyInputFormProps) {
  const [address, setAddress] = useState(initialData?.address || "");
  const [propertyType, setPropertyType] = useState(initialData?.propertyType || "");
  const [bedrooms, setBedrooms] = useState(initialData?.bedrooms || "");
  const [bathrooms, setBathrooms] = useState(initialData?.bathrooms || "");
  const [squareFeet, setSquareFeet] = useState(initialData?.squareFeet || "");
  const [price, setPrice] = useState(initialData?.price || "");
  const [listingStatus, setListingStatus] = useState(initialData?.listingStatus || "");
  const [features, setFeatures] = useState<string[]>(initialData?.features || []);
  const [featureInput, setFeatureInput] = useState("");
  const [description, setDescription] = useState(initialData?.description || "");
  const [agentPhone, setAgentPhone] = useState(initialData?.agentPhone || "");

  const handleAddFeature = () => {
    const trimmed = featureInput.trim();
    if (trimmed && !features.includes(trimmed)) {
      setFeatures([...features, trimmed]);
      setFeatureInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddFeature();
    }
  };

  const removeFeature = (feature: string) => {
    setFeatures(features.filter((f) => f !== feature));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      address,
      propertyType,
      bedrooms,
      bathrooms,
      squareFeet,
      price,
      listingStatus,
      features,
      description,
      agentPhone,
    });
  };

  const inputClass = "w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-4 py-2.5 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none";

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-5", className)}>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-emerald-200/80">Property Address</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, City, State"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-emerald-200/80">
          Agent Phone <span className="text-emerald-400/50">(optional)</span>
        </label>
        <input
          type="tel"
          value={agentPhone}
          onChange={(e) => setAgentPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-emerald-300/40">
          Shown in the contact section of designed flyers and social posts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-emerald-200/80">Property Type</label>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className={inputClass}
            required
          >
            <option value="" disabled>Select type</option>
            {propertyTypes.map((t) => (
              <option key={t} value={t} className="bg-[#0a1a0a]">{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-emerald-200/80">Listing Status</label>
          <select
            value={listingStatus}
            onChange={(e) => setListingStatus(e.target.value)}
            className={inputClass}
            required
          >
            <option value="" disabled>Select status</option>
            {listingStatuses.map((s) => (
              <option key={s} value={s} className="bg-[#0a1a0a]">{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-emerald-200/80">Bedrooms</label>
          <input
            type="number"
            value={bedrooms}
            onChange={(e) => setBedrooms(e.target.value)}
            placeholder="3"
            min="0"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-emerald-200/80">Bathrooms</label>
          <input
            type="number"
            value={bathrooms}
            onChange={(e) => setBathrooms(e.target.value)}
            placeholder="2"
            min="0"
            step="0.5"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-emerald-200/80">Sq. Ft.</label>
          <input
            type="number"
            value={squareFeet}
            onChange={(e) => setSquareFeet(e.target.value)}
            placeholder="1,800"
            min="0"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-emerald-200/80">Price ($)</label>
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="450,000"
            className={inputClass}
            required
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-emerald-200/80">Key Features</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={featureInput}
            onChange={(e) => setFeatureInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Hardwood floors, granite counters..."
            className={cn(inputClass, "flex-1")}
          />
          <button
            type="button"
            onClick={handleAddFeature}
            className="rounded-lg wood-button-dark px-4 py-2.5 text-sm font-medium text-emerald-200/80"
          >
            Add
          </button>
        </div>
        {features.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {features.map((feature) => (
              <span
                key={feature}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-800/30 bg-emerald-900/20 px-3 py-1 text-xs text-emerald-200/80"
              >
                {feature}
                <button
                  type="button"
                  onClick={() => removeFeature(feature)}
                  className="text-emerald-500 hover:text-emerald-300"
                  aria-label={`Remove ${feature}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-emerald-200/80">Property Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description or notes about the property..."
          rows={3}
          className={cn(inputClass, "resize-y")}
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-lg wood-button px-6 py-3 text-sm font-semibold text-emerald-100 shadow-sm"
      >
        {submitLabel}
      </button>
    </form>
  );
}