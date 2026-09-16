import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FeatureCard, Navigation, RelevateLockup } from "~/components";
import { canonical, seoMeta } from "~/lib/seo";
import { trackEvent } from "~/lib/analytics";
import { startCheckout } from "~/lib/product-checkout";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: seoMeta({
      title: "Relevate — AI-Powered Marketing for Real Estate Agents",
      description:
        "Generate property descriptions, open house flyers, social media posts, and email campaigns in seconds. Save hours per listing with AI-powered marketing that sells.",
      path: "/",
    }),
    links: [canonical("/")],
  }),
});

/* --- Scenic background: forest hills --- */
function ScenicHillsSVG() {
  return (
    <svg viewBox="0 0 1440 400" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
      {/* Farthest hills */}
      <path d="M0 300 Q180 180 360 260 Q540 340 720 230 Q900 120 1080 220 Q1260 320 1440 240 L1440 400 L0 400Z" fill="currentColor" opacity="0.3" />
      {/* Mid hills */}
      <path d="M0 340 Q240 250 480 310 Q720 370 960 280 Q1200 190 1440 300 L1440 400 L0 400Z" fill="currentColor" opacity="0.25" />
      {/* Foreground ground */}
      <path d="M0 380 Q360 350 720 370 Q1080 390 1440 360 L1440 400 L0 400Z" fill="currentColor" opacity="0.15" />
    </svg>
  );
}

/* --- Scenic background: pine trees (single) --- */
function PineTreeSVG({ height = 120, width = 40 }: { height?: number; width?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 40 120" fill="currentColor" opacity="0.6">
      <path d="M20 0 L20 0 L2 40 L14 40 L0 70 L16 70 L4 100 L36 100 L24 70 L40 70 L26 40 L38 40 Z" />
      <rect x="17" y="100" width="6" height="20" opacity="0.3" />
    </svg>
  );
}

const features = [
  {
    title: "Property Descriptions",
    description:
      "Generate compelling, SEO-optimized listing descriptions that highlight every selling point. Just input the details, and we'll craft the narrative.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 013.375 3.375M9 15l2.25 2.25L15 12" />
      </svg>
    ),
  },
  {
    title: "Open House Flyers",
    description:
      "Create beautiful, print-ready open house flyers with all the key details, photos, and your branding. Ready to share in minutes.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    title: "Social Media Posts",
    description:
      "Craft platform-optimized posts for Instagram, Facebook, LinkedIn, and more. Professional captions, hashtags, and visuals that drive engagement.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
      </svg>
    ),
  },
  {
    title: "Email Campaigns",
    description:
      "Build professional email campaigns for your listings, newsletters, and client outreach. AI-powered subject lines and content that convert.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    title: "Listing Summaries",
    description:
      "Get quick, shareable listing summaries for your website, MLS, and client presentations. Key features at a glance, written to impress.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    ),
  },
  {
    title: "Consistent Branding",
    description:
      "Maintain your brand voice across every asset. Set your preferences once, and every piece of content matches your style and tone.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
  },
];

const steps = [
  {
    step: "01",
    title: "Enter your listing details",
    description:
      "Fill in the basics — address, price, bedrooms, standout features. Or import directly from the MLS.",
    color: "bg-gradient-to-br from-emerald-800 to-emerald-700 text-emerald-100",
  },
  {
    step: "02",
    title: "Choose your assets",
    description:
      "Select what you need: property description, flyer, social posts, email campaign, or all of the above.",
    color: "bg-gradient-to-br from-emerald-700 to-emerald-600 text-emerald-100",
  },
  {
    step: "03",
    title: "Publish in minutes",
    description:
      "Review, customize, and export. Your professional marketing materials are ready to share with buyers and sellers.",
    color: "bg-gradient-to-br from-emerald-600 to-emerald-700 text-emerald-100",
  },
];

function Home() {
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  useEffect(() => {
    trackEvent("landing_viewed");
  }, []);

  async function handleSubscribe(priceLookupKey: string) {
    setCheckoutLoading(priceLookupKey);
    try {
      await startCheckout(priceLookupKey, {
        onAnalytics: () => trackEvent("checkout_started", { plan: priceLookupKey }),
      });
    } catch (err: any) {
      alert(err.message || "Failed to start checkout. Please try again.");
      setCheckoutLoading(null);
    }
  }

  return (
    <div className="min-h-dvh bg-[#0a1a0a] font-['Inter',system-ui,sans-serif]">
      <Navigation />

      {/* ===== Product Hunt Launch Banner ===== */}
      <a
        href="/pricing"
        className="block bg-gradient-to-r from-amber-700/80 via-amber-600/70 to-amber-700/80 px-4 py-2.5 text-center text-sm font-medium text-amber-50 transition-colors hover:from-amber-600/80 hover:via-amber-500/70 hover:to-amber-600/80"
      >
        <span className="inline-flex items-center gap-2">
          🚀 We&rsquo;re live on Product Hunt!{" "}
          <span className="font-bold underline underline-offset-2">Save 50%</span>{" "}
          with code{" "}
          <code className="rounded bg-amber-900/40 px-1.5 py-0.5 font-mono text-xs text-amber-100">
            LAUNCH50
          </code>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </span>
      </a>

      {/* ===== Scenic Forest Parallax Background ===== */}
      {/* Scroll-based parallax layers (z-index: -1) */}
      <div className="parallax-scene">
        {/* Layer 0: Farthest — rolling hills silhouette */}
        <div className="parallax-layer parallax-layer-depth-0 text-[#0a1a0a]">
          <div className="scenic-hills">
            <ScenicHillsSVG />
          </div>
        </div>

        {/* Layer 1: Mid-distance — small pine trees */}
        <div className="parallax-layer parallax-layer-depth-1 text-[#0d1f0d]">
          <div className="absolute bottom-0 left-[5%]">
            <PineTreeSVG height={70} width={25} />
          </div>
          <div className="absolute bottom-0 left-[15%]">
            <PineTreeSVG height={60} width={22} />
          </div>
          <div className="absolute bottom-0 left-[35%]">
            <PineTreeSVG height={80} width={28} />
          </div>
          <div className="absolute bottom-0 left-[55%]">
            <PineTreeSVG height={65} width={24} />
          </div>
          <div className="absolute bottom-0 left-[75%]">
            <PineTreeSVG height={55} width={20} />
          </div>
          <div className="absolute bottom-0 right-[5%]">
            <PineTreeSVG height={75} width={26} />
          </div>
        </div>

        {/* Layer 2: Closer — larger pine trees */}
        <div className="parallax-layer parallax-layer-depth-2 text-[#0d1f0d]">
          <div className="absolute -bottom-5 left-[2%]">
            <PineTreeSVG height={140} width={45} />
          </div>
          <div className="absolute -bottom-5 left-[22%]">
            <PineTreeSVG height={120} width={40} />
          </div>
          <div className="absolute -bottom-5 left-[42%]">
            <PineTreeSVG height={160} width={50} />
          </div>
          <div className="absolute -bottom-5 left-[62%]">
            <PineTreeSVG height={110} width={38} />
          </div>
          <div className="absolute -bottom-5 right-[5%]">
            <PineTreeSVG height={150} width={48} />
          </div>
        </div>

        {/* Layer 3: Fog/mist layer */}
        <div className="parallax-layer parallax-layer-depth-3">
          <div className="parallax-mist" />
        </div>

        {/* Layer 3b: Celestial glow — moon/sun that shifts on scroll */}
        <div className="parallax-layer parallax-layer-depth-3">
          <div className="celestial-glow" id="celestial-glow" />
        </div>

        {/* Layer 4: Fireflies */}
        <div className="parallax-layer parallax-layer-depth-3">
          <div className="firefly" style={{ top: '15%', left: '10%', '--duration': '5s', '--delay': '0s' } as React.CSSProperties} />
          <div className="firefly" style={{ top: '30%', left: '25%', '--duration': '7s', '--delay': '1s' } as React.CSSProperties} />
          <div className="firefly" style={{ top: '20%', left: '50%', '--duration': '6s', '--delay': '0.5s' } as React.CSSProperties} />
          <div className="firefly" style={{ top: '40%', left: '70%', '--duration': '8s', '--delay': '2s' } as React.CSSProperties} />
          <div className="firefly" style={{ top: '25%', left: '85%', '--duration': '5.5s', '--delay': '1.5s' } as React.CSSProperties} />
          <div className="firefly" style={{ top: '50%', left: '40%', '--duration': '6.5s', '--delay': '0.8s' } as React.CSSProperties} />
          <div className="firefly" style={{ top: '60%', left: '15%', '--duration': '7.5s', '--delay': '2.5s' } as React.CSSProperties} />
          <div className="firefly" style={{ top: '45%', left: '60%', '--duration': '4.5s', '--delay': '1.2s' } as React.CSSProperties} />
        </div>

        {/* Layer 5: Falling leaves */}
        <div className="parallax-layer parallax-layer-depth-4">
          <div className="falling-leaf" style={{ left: '5%', '--duration': '10s', '--delay': '0s' } as React.CSSProperties}>🍂</div>
          <div className="falling-leaf" style={{ left: '20%', '--duration': '12s', '--delay': '3s' } as React.CSSProperties}>🍃</div>
          <div className="falling-leaf" style={{ left: '40%', '--duration': '8s', '--delay': '1.5s' } as React.CSSProperties}>🍂</div>
          <div className="falling-leaf" style={{ left: '60%', '--duration': '11s', '--delay': '5s' } as React.CSSProperties}>🍃</div>
          <div className="falling-leaf" style={{ left: '80%', '--duration': '9s', '--delay': '2s' } as React.CSSProperties}>🍂</div>
          <div className="falling-leaf" style={{ left: '90%', '--duration': '13s', '--delay': '4s' } as React.CSSProperties}>🍃</div>
        </div>
      </div>

      {/* Decorative floating elements with mouse parallax */}
      <div className="parallax-container pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <svg className="parallax-leaf absolute left-[8%] top-[12%] h-5 w-5 animate-float-slow text-emerald-700/15" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <svg className="parallax-leaf absolute right-[12%] top-[22%] h-4 w-4 animate-float text-emerald-600/10" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <div className="parallax-dot absolute left-[18%] top-[50%] h-8 w-8 animate-float-slow rounded-full bg-emerald-800/10" />
        <svg className="parallax-leaf absolute right-[22%] top-[60%] h-5 w-5 animate-float text-emerald-700/10" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <div className="parallax-dot absolute left-[5%] top-[75%] h-3 w-3 animate-float-slow rounded-full bg-emerald-700/10" />
        <svg className="parallax-leaf absolute right-[5%] top-[35%] h-6 w-6 animate-float text-emerald-600/15" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <div className="parallax-dot absolute left-[45%] top-[20%] h-4 w-4 animate-float-slow rounded-full bg-amber-900/10" />
        <div className="parallax-dot absolute right-[40%] top-[85%] h-5 w-5 animate-float rounded-full bg-emerald-800/10" />
      </div>

      {/* Hero Section — Dark Forest */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-950 via-emerald-950/80 to-emerald-900/50 px-6 pb-24 pt-16 sm:pb-32 sm:pt-24">
        {/* Full-width scenic forest background image */}
        <picture>
          <source srcSet="/forest-background.webp" type="image/webp" />
          <img
            src="/forest-background.png"
            alt=""
            aria-hidden="true"
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover object-center opacity-55"
          />
        </picture>
        {/* Readability scrim over the photo */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1a0a]/75 via-[#0a1a0a]/40 to-emerald-950/70" />
        <div className="absolute inset-0 wood-texture-dark opacity-30" />
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-800/20 blur-3xl" />
        <div className="absolute -right-32 top-1/3 h-80 w-80 rounded-full bg-amber-900/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-emerald-700/20 blur-3xl" />

        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 animate-fade-in-down inline-flex items-center gap-2 rounded-full border border-emerald-700/30 bg-emerald-950/60 px-4 py-1.5 text-sm font-medium text-emerald-200/80 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-500" />
              AI-powered marketing for real estate professionals
            </div>

            <h1 className="animate-fade-in-up text-4xl font-extrabold tracking-tight text-emerald-100 sm:text-5xl lg:text-6xl">
              Turn your listings into{" "}
              <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-amber-300 bg-clip-text text-transparent">
                marketing that sells
              </span>
            </h1>

            <p className="animate-fade-in-up mt-6 text-lg leading-relaxed text-emerald-200/60 sm:text-xl stagger-1">
              Generate property descriptions, open house flyers, social media posts,
              email campaigns, and listing summaries in seconds. All in one place.
              Save hours per listing and get consistent, professional content every time.
            </p>

            <div className="animate-fade-in-up mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row stagger-2">
              <a
                href="/signup"
                className="w-full rounded-lg wood-button px-8 py-3.5 text-base font-semibold text-emerald-100 shadow-md sm:w-auto"
              >
                Start Free Trial
                <svg className="ml-2 inline-block h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
              <a
                href="#features"
                className="w-full rounded-lg wood-button-dark px-8 py-3.5 text-base font-semibold text-emerald-200/80 shadow-sm sm:w-auto"
              >
                See Features
              </a>
            </div>

            <div className="animate-fade-in-up mt-12 flex items-center justify-center gap-8 text-sm text-emerald-300/50 stagger-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                No credit card required
              </div>
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Cancel anytime
              </div>
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                5 free listings to start
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section — Dark */}
      <section id="features" className="forest-section relative px-6 py-24 sm:py-32">
        <div className="absolute inset-0 wood-texture-dark opacity-20" />
        <div className="relative mx-auto max-w-7xl">
          <div className="animate-on-scroll mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-700/30 bg-emerald-950/60 px-4 py-1 text-xs font-medium text-emerald-200/80 backdrop-blur-sm">
              Everything you need
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-emerald-100 sm:text-4xl">
              Everything you need to market every listing
            </h2>
            <p className="mt-4 text-lg text-emerald-200/60">
              Stop juggling templates and rewriting the same content. Relevate does
              the heavy lifting so you can focus on closing deals.
            </p>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <div key={feature.title} className={`animate-on-scroll stagger-${Math.min(i + 1, 6)}`}>
                <FeatureCard
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section — Dark Alt */}
      <section id="how-it-works" className="forest-section-alt relative px-6 py-24 sm:py-32">
        <div className="absolute inset-0 wood-texture-dark opacity-15" />
        <div className="relative mx-auto max-w-7xl">
          <div className="animate-on-scroll mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-700/30 bg-emerald-950/60 px-4 py-1 text-xs font-medium text-emerald-200/80 backdrop-blur-sm">
              Simple process
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-emerald-100 sm:text-4xl">
              How it works
            </h2>
            <p className="mt-4 text-lg text-emerald-200/60">
              From listing details to polished marketing assets in three simple steps.
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.step} className={`animate-on-scroll stagger-${i + 1} relative text-center`}>
                {i < steps.length - 1 && (
                  <div className="absolute left-[60%] top-7 hidden h-0.5 w-[80%] bg-gradient-to-r from-emerald-600/30 to-emerald-700/20 md:block" />
                )}
                <div
                  className={`step-glow mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl text-lg font-bold shadow-sm ${s.color}`}
                >
                  {s.step}
                </div>
                <h3 className="text-xl font-semibold text-emerald-100">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-emerald-200/60">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* CTA Section — Dark with Wood */}
      <section id="cta" className="relative overflow-hidden px-6 py-24 sm:py-32" style={{
        background: 'linear-gradient(135deg, #0a1a0a 0%, #1a2e1a 50%, #0d1f0d 100%)',
      }}>
        <div className="absolute inset-0 wood-texture-dark opacity-30" />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-800/30 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-amber-900/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-[20%] top-[20%] h-3 w-3 animate-float-slow rounded-full bg-emerald-500/20" />
          <div className="absolute right-[30%] top-[60%] h-4 w-4 animate-float rounded-full bg-emerald-400/15" />
          <div className="absolute left-[40%] top-[80%] h-2 w-2 animate-float-slow rounded-full bg-emerald-500/20" />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <div className="animate-on-scroll mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-emerald-100 sm:text-4xl">
              Ready to save hours on every listing?
            </h2>
            <p className="mt-4 text-lg text-emerald-200/70">
              Join thousands of agents who use Relevate to create professional marketing
              materials in minutes. Start your free trial today — no credit card required.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button
                onClick={() => handleSubscribe("starter_monthly")}
                disabled={checkoutLoading === "starter_monthly"}
                className="w-full rounded-lg wood-button px-8 py-3.5 text-base font-semibold text-emerald-100 shadow-md sm:w-auto disabled:opacity-60"
              >
                {checkoutLoading === "starter_monthly" ? "Redirecting..." : "Start Your Free Trial"}
                <svg className="ml-2 inline-block h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
              <a
                href="/demo"
                className="w-full rounded-lg wood-button-dark px-8 py-3.5 text-base font-semibold text-emerald-200/80 shadow-sm sm:w-auto"
              >
                Schedule a Demo
              </a>
            </div>
            <p className="mt-6 text-sm text-emerald-300/50">
              Free 14-day trial. 5 free listings included. Cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* Footer — Dark */}
      <footer className="relative bg-[#050f05] px-6 py-12">
        <div className="absolute inset-0 wood-texture-dark opacity-10" />
        <div className="relative mx-auto max-w-7xl">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <RelevateLockup className="h-8 w-auto" />
            </div>
            <nav className="flex gap-8 text-sm text-emerald-300/50">
              <a href="#features" className="transition hover:text-emerald-100">
                Features
              </a>
              <a href="#how-it-works" className="transition hover:text-emerald-100">
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
    </div>
  );
}