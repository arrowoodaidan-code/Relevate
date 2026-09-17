import { createFileRoute } from "@tanstack/react-router";
import { Navigation, RelevateLockup, RelevateMark } from "~/components";
import { canonical, seoMeta } from "~/lib/seo";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: seoMeta({
      title: "About Relevate — AI Marketing Assistant for Real Estate Agents",
      description:
        "Relevate is the AI-powered marketing assistant for real estate agents: property descriptions, open house flyers, social posts, email campaigns, listing summaries, and AI images — all in one place. Meet the founder and schedule a free demo.",
      path: "/about",
    }),
    links: [canonical("/about")],
  }),
});

/* --- What Relevate does --- */
const capabilities = [
  {
    title: "Property Descriptions",
    description:
      "Compelling, SEO-optimized listing descriptions that highlight every selling point — written in seconds, not hours.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 013.375 3.375M9 15l2.25 2.25L15 12" />
      </svg>
    ),
  },
  {
    title: "Open House Flyers",
    description:
      "Beautiful, print-ready flyers with all the key details and your branding — plus designed graphics that look professionally produced.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    title: "Social Media Posts",
    description:
      "Platform-optimized posts for Instagram, Facebook, and LinkedIn — captions, hashtags, and matching visuals that drive engagement.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
      </svg>
    ),
  },
  {
    title: "Email Campaigns",
    description:
      "Professional email campaigns for listings, newsletters, and client outreach — with subject lines that get opened.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    title: "Listing Summaries",
    description:
      "Quick, shareable summaries for your website, MLS, and client presentations — key features at a glance, written to impress.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    ),
  },
  {
    title: "AI Images",
    description:
      "Generate matching images for your listings and marketing assets — no photographer or design software required.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
];

/* --- Why it saves agents hours --- */
const timeSavers = [
  {
    step: "01",
    title: "Enter your listing details once",
    description:
      "Address, price, bedrooms, standout features. That's the only input Relevate needs to start creating.",
    color: "bg-gradient-to-br from-emerald-800 to-emerald-700 text-emerald-100",
  },
  {
    step: "02",
    title: "Relevate drafts everything",
    description:
      "Property descriptions, flyers, social posts, emails, listing summaries — every asset generated from the same details, in your brand voice.",
    color: "bg-gradient-to-br from-emerald-700 to-emerald-600 text-emerald-100",
  },
  {
    step: "03",
    title: "You review and publish",
    description:
      "Everything is editable, so you stay in control. Export polished, professional marketing materials in minutes instead of hours.",
    color: "bg-gradient-to-br from-emerald-600 to-emerald-700 text-emerald-100",
  },
];

function AboutPage() {
  return (
    <div className="min-h-dvh bg-[#0a1a0a] font-['Inter',system-ui,sans-serif]">
      <Navigation />

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-950 via-emerald-950/80 to-emerald-900/50 px-6 pb-20 pt-16 sm:pt-24">
        <picture>
          <source srcSet="/forest-background.webp" type="image/webp" />
          <img
            src="/forest-background.png"
            alt=""
            aria-hidden="true"
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover object-center opacity-40"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1a0a]/80 via-[#0a1a0a]/50 to-emerald-950/70" />
        <div className="absolute inset-0 wood-texture-dark opacity-25" />
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-800/20 blur-3xl" />
        <div className="absolute -right-32 top-1/3 h-80 w-80 rounded-full bg-amber-900/15 blur-3xl" />

        <div className="relative mx-auto max-w-3xl text-center">
          <div className="animate-fade-in-down mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-700/30 bg-emerald-950/60 px-4 py-1.5 text-sm font-medium text-emerald-200/80 backdrop-blur-sm">
            <RelevateMark className="h-4 w-4" />
            About Relevate
          </div>
          <h1 className="animate-fade-in-up text-4xl font-extrabold tracking-tight text-emerald-100 sm:text-5xl">
            The AI marketing assistant built{" "}
            <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-amber-300 bg-clip-text text-transparent">
              for real estate agents
            </span>
          </h1>
          <p className="animate-fade-in-up mt-6 text-lg leading-relaxed text-emerald-200/60 sm:text-xl stagger-1">
            Relevate generates property descriptions, open house flyers, social media
            posts, email campaigns, listing summaries, and matching AI images — all
            in one place. Agents save hours per listing and ship consistent,
            professional content that sells.
          </p>
          <div className="animate-fade-in-up mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row stagger-2">
            <a
              href="/signup"
              className="w-full rounded-lg wood-button px-8 py-3.5 text-base font-semibold text-emerald-100 shadow-md sm:w-auto"
            >
              Create a free account
            </a>
            <a
              href="/demo"
              className="w-full rounded-lg wood-button-dark px-8 py-3.5 text-base font-semibold text-emerald-200/80 shadow-sm sm:w-auto"
            >
              Schedule a Demo
            </a>
          </div>
        </div>
      </section>

      {/* ===== What Relevate is ===== */}
      <section className="forest-section relative px-6 py-24 sm:py-28">
        <div className="absolute inset-0 wood-texture-dark opacity-20" />
        <div className="relative mx-auto max-w-7xl">
          <div className="animate-on-scroll mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-700/30 bg-emerald-950/60 px-4 py-1 text-xs font-medium text-emerald-200/80 backdrop-blur-sm">
              Everything in one place
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-emerald-100 sm:text-4xl">
              One tool for every marketing asset your listing needs
            </h2>
            <p className="mt-4 text-lg text-emerald-200/60">
              Stop juggling templates, rewriting the same copy, and waiting on
              designers. Relevate does the heavy lifting so you can focus on closing
              deals.
            </p>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((cap, i) => (
              <div
                key={cap.title}
                className={`animate-on-scroll stagger-${Math.min(i + 1, 6)} group rounded-2xl border border-emerald-800/30 bg-[#0d1f0d]/80 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-600/40 hover:shadow-[0_8px_40px_rgba(16,185,129,0.12)]`}
              >
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-800 to-emerald-700 text-emerald-100 shadow-sm">
                  {cap.icon}
                </div>
                <h3 className="text-lg font-semibold text-emerald-100">{cap.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-emerald-200/60">
                  {cap.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== How it saves hours ===== */}
      <section className="forest-section-alt relative px-6 py-24 sm:py-28">
        <div className="absolute inset-0 wood-texture-dark opacity-15" />
        <div className="relative mx-auto max-w-7xl">
          <div className="animate-on-scroll mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-700/30 bg-emerald-950/60 px-4 py-1 text-xs font-medium text-emerald-200/80 backdrop-blur-sm">
              Hours back, every week
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-emerald-100 sm:text-4xl">
              From listing details to polished assets in minutes
            </h2>
            <p className="mt-4 text-lg text-emerald-200/60">
              Every listing comes with a pile of marketing work. Relevate turns that
              from a multi-hour project into a quick review-and-publish flow.
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {timeSavers.map((s, i) => (
              <div key={s.step} className={`animate-on-scroll stagger-${i + 1} relative text-center`}>
                {i < timeSavers.length - 1 && (
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
          <div className="animate-on-scroll mx-auto mt-16 max-w-3xl rounded-2xl border border-emerald-700/30 bg-gradient-to-br from-emerald-950/80 to-[#0d1f0d]/80 p-8 text-center">
            <h3 className="text-2xl font-bold text-emerald-100">
              Built for agents and small brokerages
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-emerald-200/60">
              Whether you're an individual agent listing ten properties a year or a
              brokerage marketing a whole portfolio, Relevate keeps your content
              consistent, on-brand, and ready to publish — without a dedicated
              marketing team.
            </p>
          </div>
        </div>
      </section>

      {/* ===== Contact / Schedule a Demo ===== */}
      <section id="contact" className="relative overflow-hidden px-6 py-24 sm:py-28" style={{
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

        <div className="relative mx-auto max-w-3xl">
          <div className="animate-on-scroll mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-700/30 bg-emerald-950/60 px-4 py-1 text-xs font-medium text-emerald-200/80 backdrop-blur-sm">
              Let&rsquo;s talk
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-emerald-100 sm:text-4xl">
              Schedule a free demo
            </h2>
            <p className="mt-4 text-lg text-emerald-200/70">
              See Relevate in action with your own listings. Call or email Aidan to
              set up a free demo — no commitment, no pressure, just a walkthrough
              of what Relevate can do for your business.
            </p>
          </div>

          <div className="animate-on-scroll mt-12 rounded-2xl border border-emerald-700/30 bg-[#0d1f0d]/80 p-8 shadow-[0_8px_40px_rgba(0,0,0,0.35)] sm:p-10">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-700 to-emerald-600 shadow-lg">
                <span className="text-3xl font-extrabold text-emerald-100">A</span>
              </div>
              <div className="text-center sm:text-left">
                <h3 className="text-xl font-bold text-emerald-100">Aidan Arrowood</h3>
                <p className="mt-1 text-sm font-medium text-amber-300/90">
                  Founder &amp; Main Marketing Agent
                </p>
                <div className="mt-5 flex flex-col items-center gap-3 sm:items-start">
                  <a
                    href="tel:+18432504438"
                    className="group inline-flex items-center gap-3 text-emerald-200/80 transition-colors hover:text-emerald-100"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-900/50 text-emerald-300">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                    </span>
                    <span className="text-base font-medium">843-250-4438</span>
                  </a>
                  <a
                    href="mailto:relevaterealestate.auto@gmail.com"
                    className="group inline-flex items-center gap-3 text-emerald-200/80 transition-colors hover:text-emerald-100"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-900/50 text-emerald-300">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    </span>
                    <span className="text-base font-medium break-all">relevaterealestate.auto@gmail.com</span>
                  </a>
                </div>
              </div>
            </div>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 border-t border-emerald-800/40 pt-8 sm:flex-row">
              <a
                href="/demo"
                className="w-full rounded-lg wood-button px-6 py-3 text-sm font-semibold text-emerald-100 shadow-md sm:w-auto"
              >
                Schedule a Demo
                <svg className="ml-2 inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
              <a
                href="/signup"
                className="w-full rounded-lg wood-button-dark px-6 py-3 text-sm font-semibold text-emerald-200/80 shadow-sm sm:w-auto"
              >
                Or create a free account
              </a>
            </div>
          </div>
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
    </div>
  );
}
