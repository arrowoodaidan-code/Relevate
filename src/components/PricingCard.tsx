import { cn } from "~/lib/utils";

interface PricingFeature {
  text: string;
  included: boolean;
}

interface PricingCardProps {
  name: string;
  description: string;
  price: string;
  period?: string;
  priceSub?: string;
  features: PricingFeature[];
  ctaText?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  /** Renders a non-clickable CTA. Use when the plan genuinely cannot be bought here yet. */
  ctaDisabled?: boolean;
  /** One honest line under the CTA explaining why. */
  ctaNote?: string;
  highlighted?: boolean;
  className?: string;
}

export function PricingCard({
  name,
  description,
  price,
  period = "/mo",
  priceSub,
  features,
  ctaText = "Get Started",
  ctaHref = "#cta",
  onCtaClick,
  ctaDisabled = false,
  ctaNote,
  highlighted = false,
  className,
}: PricingCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl border p-8 shadow-sm transition-all duration-300 glow-border-hover",
        highlighted
          ? "border-emerald-600/50 bg-[#0d1f0d]/80"
          : "border-emerald-800/30 bg-[#0a1a0a]/60",
        className,
      )}
    >
      {highlighted && (
        <div className="badge-shimmer absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-800 to-emerald-700 px-4 py-1 text-xs font-semibold text-emerald-100 shadow-sm">
          Most Popular
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-xl font-bold text-emerald-100">{name}</h3>
        <p className="mt-1 text-sm text-emerald-300/60">{description}</p>
      </div>

      <div className="mb-6">
        <span className="text-4xl font-bold text-emerald-100">{price}</span>
        <span className="ml-1 text-sm text-emerald-300/60">{period}</span>
        {priceSub && (
          <div className="mt-1 text-xs font-medium text-amber-300/80">{priceSub}</div>
        )}
      </div>

      <ul className="mb-8 flex-1 space-y-3">
        {features.map((feature) => (
          <li key={feature.text} className="flex items-center gap-3">
            {feature.included ? (
              <svg className="h-5 w-5 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="h-5 w-5 shrink-0 text-emerald-700" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.22 5.22a.75.75 0 011.06 0L10 8.94l3.72-3.72a.75.75 0 111.06 1.06L11.06 10l3.72 3.72a.75.75 0 11-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 01-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 010-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span className={cn("text-sm", feature.included ? "text-emerald-200/80" : "text-emerald-600")}>
              {feature.text}
            </span>
          </li>
        ))}
      </ul>

      {ctaDisabled ? (
        <>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="w-full cursor-not-allowed rounded-lg border border-emerald-900/50 bg-emerald-950/40 px-5 py-3 text-sm font-semibold text-emerald-300/50"
          >
            {ctaText}
          </button>
          {ctaNote ? (
            <p className="mt-2 text-center text-xs leading-relaxed text-emerald-300/50">{ctaNote}</p>
          ) : null}
        </>
      ) : onCtaClick ? (
        <button
          type="button"
          onClick={onCtaClick}
          className={cn(
            "w-full rounded-lg px-5 py-3 text-sm font-semibold shadow-sm transition-all duration-300",
            highlighted
              ? "wood-button text-emerald-100"
              : "wood-button-dark text-emerald-200/80",
          )}
        >
          {ctaText}
        </button>
      ) : (
        <a
          href={ctaHref}
          className={cn(
            "w-full rounded-lg px-5 py-3 text-center text-sm font-semibold shadow-sm transition-all duration-300",
            highlighted
              ? "wood-button text-emerald-100"
              : "wood-button-dark text-emerald-200/80",
          )}
        >
          {ctaText}
        </a>
      )}
    </div>
  );
}