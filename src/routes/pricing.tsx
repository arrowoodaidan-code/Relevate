import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckoutHandoffDialog, Navigation, PricingCard, RelevateLockup } from "~/components";
import { canonical, seoMeta } from "~/lib/seo";
import { trackEvent } from "~/lib/analytics";
import { readCheckoutIntent, startCheckout, type CheckoutHandoff } from "~/lib/product-checkout";
import { annualPriceDisplay, monthlyPriceDisplay } from "~/lib/pricing-display";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: seoMeta({
      title: "Pricing — Relevate | AI Marketing Assistant for Real Estate Agents",
      description:
        "Simple, transparent pricing for Relevate, the AI marketing assistant for real estate agents. Starter $39/mo, Pro $79/mo, Team $199/mo. Upgrade anytime — save 50% for 3 months with code LAUNCH50.",
      path: "/pricing",
    }),
    links: [canonical("/pricing")],
  }),
});

/* --- Pricing plans (owner final: Starter $39 / Pro $79 / Team $199 monthly; annual = 7% off) ---
 * Each plan carries both a MONTHLY price and a YEARLY (pay-upfront full annual) price.
 * Amounts are NOT written here: both come from src/lib/pricing-display.ts, which reads the
 * Stripe price record in src/lib/stripe-prices.ts. Annual = 93% of 12 × monthly, printed with
 * its exact cents:
 *   Starter $435.24/yr ($36.27/mo) · Pro $881.64/yr ($73.47/mo) · Team $2,220.84/yr ($185.07/mo)
 */
type BillingCycle = "monthly" | "yearly";

const pricingPlans = [
  {
    name: "Starter",
    description: "For individual agents getting started",
    ctaText: "Subscribe",
    monthly: monthlyPriceDisplay("starter_monthly"),
    yearly: annualPriceDisplay("starter_annual", "starter_monthly"),
    features: [
      { text: "Up to 5 listings/month", included: true },
      { text: "Basic templates", included: true },
      { text: "Property descriptions", included: true },
      { text: "Open house flyers", included: true },
      { text: "Social media posts", included: true },
      { text: "Email support", included: true },
    ],
  },
  {
    name: "Pro",
    description: "For serious agents with growing businesses",
    highlighted: true,
    ctaText: "Subscribe",
    monthly: monthlyPriceDisplay("pro"),
    yearly: annualPriceDisplay("pro_annual", "pro"),
    features: [
      { text: "Up to 20 listings/month", included: true },
      { text: "All asset types", included: true },
      { text: "Email campaigns", included: true },
      { text: "Listing summaries", included: true },
      { text: "Priority support", included: true },
      { text: "Custom branding options", included: true },
    ],
  },
  {
    name: "Team",
    description: "For brokerages and teams",
    ctaText: "Subscribe",
    monthly: monthlyPriceDisplay("team"),
    yearly: annualPriceDisplay("team_annual", "team"),
    features: [
      { text: "Unlimited listings", included: true },
      { text: "Multi-agent seats", included: true },
      { text: "Branded templates", included: true },
      { text: "Advanced analytics", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "API access", included: true },
    ],
  },
];

/* The bottom CTA band always subscribes to Starter MONTHLY, whatever the cycle toggle says,
 * so its label names that plan and its real price — it is not a trial of anything. */
const STARTER_MONTHLY = monthlyPriceDisplay("starter_monthly");

/** Human label for a plan key, e.g. "Starter (yearly)" — used by the handoff banner. */
function planLabelForPriceKey(priceLookupKey: string): string {
  const plan = pricingPlans.find(
    (p) =>
      p.monthly.priceLookupKey === priceLookupKey ||
      p.yearly.priceLookupKey === priceLookupKey,
  );
  const cycle = priceLookupKey.endsWith("_annual") ? "yearly" : "monthly";
  return plan ? `${plan.name} (${cycle})` : priceLookupKey;
}

function PricingPage() {
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [handoff, setHandoff] = useState<CheckoutHandoff | null>(null);
  const [handoffPlanLabel, setHandoffPlanLabel] = useState("");
  /** Set while this page is continuing a checkout the buyer confirmed on the other host. */
  const [continuing, setContinuing] = useState<string | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    trackEvent("pricing_viewed");
    /* A handoff from the other host arrives as ?plan=<key>&start=1: select the matching
     * billing cycle and begin checkout here, so the buyer does not have to find the same
     * plan and click Subscribe a second time. Read in an effect (not during render) so the
     * server and client markup stay identical. */
    const intent = readCheckoutIntent(window.location.search);
    if (intent.plan) {
      setBillingCycle(intent.plan.endsWith("_annual") ? "yearly" : "monthly");
    }
    if (intent.autoStart && intent.plan && !autoStarted.current) {
      autoStarted.current = true;
      const label = planLabelForPriceKey(intent.plan);
      setContinuing(label);
      void handleSubscribe(intent.plan, label);
    }
  }, []);

  async function handleSubscribe(priceLookupKey: string, planLabel: string) {
    setCheckoutLoading(priceLookupKey);
    try {
      const result = await startCheckout(priceLookupKey, {
        onAnalytics: () =>
          trackEvent("checkout_started", { plan: priceLookupKey, billing: billingCycle }),
      });
      /* This host cannot take a payment: nothing navigated and nothing was charged. Show the
       * visitor the destination host and let them decide — never redirect silently. */
      if (result.outcome === "handoff") {
        setHandoffPlanLabel(planLabel);
        setHandoff(result);
        trackEvent("checkout_handoff_shown", {
          plan: priceLookupKey,
          billing: billingCycle,
          host: result.host,
        });
      }
    } catch (err: any) {
      alert(err.message || "Failed to start checkout. Please try again.");
    } finally {
      setCheckoutLoading(null);
      setContinuing(null);
    }
  }

  return (
    <div className="min-h-dvh bg-[#0a1a0a] font-['Inter',system-ui,sans-serif]">
      <Navigation />
      {/* Shown only while this page is finishing a checkout the buyer confirmed elsewhere. */}
      {continuing && (
        <div className="border-b border-emerald-700/40 bg-emerald-950/90 px-4 py-3 text-center text-sm text-emerald-100">
          Continuing your checkout for{" "}
          <span className="font-semibold">{continuing}</span>… If nothing happens in a few
          seconds, choose the plan below.
        </div>
      )}
      {/* ===== Page header ===== */}
      <section className="relative overflow-hidden px-6 pb-16 pt-24 sm:pt-32">
        <div className="absolute inset-0 wood-texture-dark opacity-10" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-800/25 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-900/20 blur-3xl" />
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="animate-on-scroll mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-700/30 bg-emerald-950/60 px-4 py-1 text-xs font-medium text-emerald-200/80 backdrop-blur-sm">
            Pricing
          </div>
          <h1 className="animate-on-scroll text-4xl font-bold tracking-tight text-emerald-100 sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="animate-on-scroll mt-4 text-lg text-emerald-200/60">
            Choose the plan that fits your business. Upgrade anytime.
          </p>
          <p className="animate-on-scroll mt-3 text-sm text-amber-300/70">
            🚀 Launch offer: save 50% for 3 months with code{" "}
            <code className="rounded bg-amber-900/40 px-1.5 py-0.5 font-mono text-xs text-amber-100">
              LAUNCH50
            </code>
          </p>
        </div>
      </section>

      {/* ===== Pricing section ===== */}
      <section id="pricing" className="forest-section relative px-6 py-16 sm:py-20">
        <div className="absolute inset-0 wood-texture-dark opacity-15" />
        <div className="relative mx-auto max-w-7xl">
          {/* Billing-cycle toggle */}
          <div className="mb-10 flex justify-center">
            <div className="inline-flex items-center rounded-full border border-emerald-700/40 bg-emerald-950/60 p-1 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 ${
                  billingCycle === "monthly"
                    ? "bg-emerald-700 text-emerald-50 shadow"
                    : "text-emerald-300/70 hover:text-emerald-100"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 ${
                  billingCycle === "yearly"
                    ? "bg-emerald-700 text-emerald-50 shadow"
                    : "text-emerald-300/70 hover:text-emerald-100"
                }`}
              >
                Yearly
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-3">
            {pricingPlans.map((plan, i) => {
              const pricing =
                billingCycle === "yearly" ? plan.yearly : plan.monthly;
              return (
                <div key={plan.name} className={`animate-on-scroll stagger-${i + 1}`}>
                  <PricingCard
                    name={plan.name}
                    description={plan.description}
                    price={pricing.price}
                    period={pricing.period}
                    priceSub={pricing.priceSub}
                    highlighted={plan.highlighted}
                    features={plan.features}
                    onCtaClick={() =>
                      handleSubscribe(
                        pricing.priceLookupKey,
                        `${plan.name} — ${pricing.price}${pricing.period}`,
                      )
                    }
                    ctaText={
                      checkoutLoading === pricing.priceLookupKey
                        ? "Opening checkout…"
                        : plan.ctaText
                    }
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-10 text-center text-sm text-emerald-300/40">
            {billingCycle === "yearly"
              ? "Yearly plans are billed once, up front, for the full year."
              : "Prices are per month, billed monthly."}{" "}
            Every plan is a paid subscription billed through Stripe — a payment card is
            required at checkout. Cancel anytime.
          </p>
        </div>
      </section>

      {/* ===== CTA band ===== */}
      <section className="relative overflow-hidden px-6 py-20" style={{
        background: 'linear-gradient(135deg, #0a1a0a 0%, #1a2e1a 50%, #0d1f0d 100%)',
      }}>
        <div className="absolute inset-0 wood-texture-dark opacity-30" />
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="animate-on-scroll text-3xl font-bold tracking-tight text-emerald-100 sm:text-4xl">
            Ready to save hours on every listing?
          </h2>
          <p className="animate-on-scroll mt-4 text-lg text-emerald-200/70">
            Relevate turns each listing into professional marketing materials in minutes.
          </p>
          <div className="animate-on-scroll mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={() =>
                handleSubscribe(
                  "starter_monthly",
                  `Starter — ${STARTER_MONTHLY.price}${STARTER_MONTHLY.period}`,
                )
              }
              disabled={checkoutLoading === "starter_monthly"}
              className="w-full rounded-lg wood-button px-8 py-3.5 text-base font-semibold text-emerald-100 shadow-md sm:w-auto disabled:opacity-60"
            >
              {checkoutLoading === "starter_monthly"
                ? "Opening checkout…"
                : `Subscribe to Starter — ${STARTER_MONTHLY.price}${STARTER_MONTHLY.period}`}
            </button>
            <a
              href="/demo"
              className="w-full rounded-lg wood-button-dark px-8 py-3.5 text-base font-semibold text-emerald-200/80 shadow-sm sm:w-auto"
            >
              Schedule a Demo
            </a>
          </div>
          <p className="animate-on-scroll mt-6 text-sm text-emerald-300/50">
            Starter is {STARTER_MONTHLY.price}
            {STARTER_MONTHLY.period}, billed monthly through Stripe until you cancel. Not
            ready to subscribe?{" "}
            <a href="/signup" className="underline hover:text-emerald-100">
              Create a free account
            </a>{" "}
            or{" "}
            <a href="/demo" className="underline hover:text-emerald-100">
              book a demo
            </a>
            .
          </p>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="relative bg-[#050f05] px-6 py-12">
        <div className="absolute inset-0 wood-texture-dark opacity-10" />
        <div className="relative mx-auto max-w-7xl">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <RelevateLockup className="h-8 w-auto" />
            </div>
            <nav className="flex flex-wrap justify-center gap-6 text-sm text-emerald-300/50 sm:gap-8">
              <a href="/#features" className="transition hover:text-emerald-100">
                Features
              </a>
              <a href="/#how-it-works" className="transition hover:text-emerald-100">
                How It Works
              </a>
              <a href="/pricing" className="transition hover:text-emerald-100">
                Pricing
              </a>
              <a href="/blog" className="transition hover:text-emerald-100">
                Blog
              </a>
              <a href="/about" className="transition hover:text-emerald-100">
                About
              </a>
            </nav>
            <p className="text-sm text-emerald-300/30">
              &copy; {new Date().getFullYear()} Relevate. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Explicit, labelled handoff when this host cannot start a payment (never a silent
        * cross-host redirect). Cancelling leaves the visitor exactly where they were. */}
      <CheckoutHandoffDialog
        handoff={handoff}
        planLabel={handoffPlanLabel}
        onCancel={() => setHandoff(null)}
      />
    </div>
  );
}
