import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ComplianceScopeLine, LegalLinks, Navigation, RelevateLockup } from "~/components";
import { canonical, seoMeta } from "~/lib/seo";

export const Route = createFileRoute("/legal")({
  component: LegalNoticesPage,
  head: () => ({
    meta: seoMeta({
      title: "Compliance & Legal Notices — Relevate",
      description:
        "Relevate's compliance scope: federal law and South Carolina only. What the compliance checklist is, what it is not — not legal advice, not a certification — and the rules it does not check.",
      path: "/legal",
    }),
    links: [canonical("/legal")],
  }),
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-10 first:mt-0">
      <h2 className="text-xl font-semibold text-emerald-100 sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-emerald-200/70 sm:text-base">{children}</div>
    </div>
  );
}

function LegalNoticesPage() {
  return (
    <div className="min-h-dvh bg-[#0a1a0a] font-['Inter',system-ui,sans-serif]">
      <Navigation />

      {/* ===== Heading ===== */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-950 via-emerald-950/80 to-emerald-900/50 px-6 pb-14 pt-16 sm:pt-20">
        <div className="absolute inset-0 wood-texture-dark opacity-20" />
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="animate-fade-in-down mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-700/30 bg-emerald-950/60 px-4 py-1.5 text-sm font-medium text-emerald-200/80 backdrop-blur-sm">
            <RelevateLockup className="h-4 w-auto" />
            Legal
          </div>
          <h1 className="animate-fade-in-up text-4xl font-extrabold tracking-tight text-emerald-100 sm:text-5xl">
            Compliance &amp; Legal Notices
          </h1>
          <p className="animate-fade-in-up mt-4 text-sm text-emerald-200/60 sm:text-base">
            Effective November 25, 2026
          </p>
        </div>
      </section>

      {/* ===== Body ===== */}
      <section className="forest-section relative px-6 py-16 sm:py-20">
        <div className="absolute inset-0 wood-texture-dark opacity-15" />
        <div className="relative mx-auto max-w-3xl text-center sm:text-left">
          {/* The site's single statement of compliance scope, shared verbatim with every footer. */}
          <div className="rounded-2xl border border-emerald-800/30 bg-[#0d1f0d]/80 p-5">
            <ComplianceScopeLine className="text-center sm:text-left" />
          </div>

          <Section title="Why the scope is this narrow">
            <p>
              Every rule the product shows has to be checked against its primary source before it is shown to an
              agent. That work has been done for the federal fair-housing advertising requirements and for the
              South Carolina requirements in scope, and not yet for any other state. Rather than show rules we
              cannot trace, the product speaks only where it can. If coverage is later widened, it happens here
              first — never silently.
            </p>
          </Section>

          <Section title="How the compliance output works">
            <p>
              The in-app checklist shows the rule text quoted from the sources it cites, and flags the items a
              listing is missing. It tells you what the cited rule says and what your draft does not yet address;
              the decision about what to publish stays with you.
            </p>
          </Section>

          <Section title="What this is not">
            <p>
              Compliance output in Relevate is not legal advice. It is not a certification, and Relevate does not
              certify that any listing, asset, or campaign is lawful. It is not a substitute for your own broker
              or counsel. If you have a legal question about a listing or an advertisement, ask your broker or a
              lawyer.
            </p>
          </Section>

          <Section title="The Equal Housing Opportunity mark">
            <p>
              The Equal Housing Opportunity slogan and logotype trace to Title VIII of the Civil Rights Act of 1968
              — the Fair Housing Act — and to HUD&apos;s guidance on advertising housing. Where the mark appears in
              an asset you produce with Relevate, using it correctly and honestly is your obligation as the
              advertiser. Showing the mark does not by itself satisfy the requirements of the Fair Housing Act.
            </p>
          </Section>

          <Section title="Rules Relevate does not check">
            <p>
              Your brokerage&apos;s own marketing rules, requirements from the South Carolina Real Estate
              Commission, and the rules of any MLS you belong to can impose requirements Relevate does not check.
              Those obligations remain yours, and meeting them is part of publishing a listing or an
              advertisement.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about these notices:{" "}
              <a href="mailto:relevate-3ec45a01@ctomail.io" className="text-emerald-300 underline transition hover:text-emerald-100">
                relevate-3ec45a01@ctomail.io
              </a>
              .
            </p>
          </Section>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="relative bg-[#050f05] px-6 py-12">
        <div className="absolute inset-0 wood-texture-dark opacity-10" />
        <div className="relative mx-auto max-w-3xl">
          <ComplianceScopeLine className="text-center sm:text-left" />
          <LegalLinks className="mt-3 sm:justify-start" />
        </div>
      </footer>
    </div>
  );
}
