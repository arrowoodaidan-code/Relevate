import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ComplianceScopeLine, LegalLinks, Navigation, RelevateLockup } from "~/components";
import { canonical, seoMeta } from "~/lib/seo";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: seoMeta({
      title: "Privacy Policy — Relevate",
      description:
        "What Relevate collects when you use the AI marketing assistant for real estate agents, why, and who processes it — Stripe for payments, OpenAI for generation, a managed Postgres database for records.",
      path: "/privacy",
    }),
    links: [canonical("/privacy")],
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

function PrivacyPage() {
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
            Privacy Policy
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
          <p className="text-sm leading-relaxed text-emerald-200/70 sm:text-base">
            This policy explains what Relevate collects when you create an account or use the service, why we
            collect it, who processes it, and how to reach us about it. &quot;Relevate&quot; and &quot;we&quot;
            mean Relevate, the operator of the AI marketing assistant for real estate agents.
          </p>

          <Section title="What we collect">
            <p>
              When you create an account: your email address, and a hash of your password — your password itself is
              not stored.
            </p>
            <p>
              When you use the service: the listing details and photographs you upload, the content the service
              generates for you, usage records such as what you generated and when, and the customer and
              subscription identifiers Stripe creates for your billing.
            </p>
          </Section>

          <Section title="Why we collect it">
            <p>
              To create and secure your account; to generate the assets you request; to process the photographs you
              upload into those assets; to bill subscriptions through Stripe; and to keep a record of what was
              generated so it can be edited and downloaded again.
            </p>
          </Section>

          <Section title="Who processes it">
            <p>
              <strong className="font-semibold text-emerald-100">Stripe</strong> processes payments and holds your
              payment details. Card numbers never reach Relevate — payment happens on Stripe&apos;s own checkout.
            </p>
            <p>
              <strong className="font-semibold text-emerald-100">OpenAI</strong> produces the generated text and
              images. Your prompts and listing details are sent to OpenAI to produce that output.
            </p>
            <p>
              <strong className="font-semibold text-emerald-100">The managed database provider</strong> hosts the
              Postgres database where account, listing, and generated-content records are stored.
            </p>
          </Section>

          <Section title="What we do not collect">
            <p>
              There is no analytics tool, no advertising tracker, and no third-party session recording on the site
              — landing-page behaviour is not measured. We do not sell personal data. Relevate never stores card
              numbers.
            </p>
          </Section>

          <Section title="Retention">
            <p>
              Account, listing, and generated-content records are kept for as long as your account is active. When
              you ask us to delete them, they are deleted.
            </p>
          </Section>

          <Section title="Your choices">
            <p>
              You can ask for a copy of your records, ask us to correct them, or ask us to delete them. Write to{" "}
              <a href="mailto:relevate-3ec45a01@ctomail.io" className="text-emerald-300 underline transition hover:text-emerald-100">
                relevate-3ec45a01@ctomail.io
              </a>{" "}
              from your account email so we can confirm the request is yours.
            </p>
          </Section>

          <Section title="Children">
            <p>
              The service is for real estate professionals and is not directed at children. Do not create an
              account for anyone under 13.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              This policy may be updated from time to time. The current version is always on this page, and the
              effective date at the top changes when the policy does.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about this policy:{" "}
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
