import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ComplianceScopeLine, LegalLinks, Navigation, RelevateLockup } from "~/components";
import { canonical, seoMeta } from "~/lib/seo";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: seoMeta({
      title: "Terms of Service — Relevate",
      description:
        "The terms that govern Relevate, the AI marketing assistant for real estate agents: accounts, billing through Stripe, acceptable use, and the rule that generated output is a draft the agent must review.",
      path: "/terms",
    }),
    links: [canonical("/terms")],
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

function TermsPage() {
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
            Terms of Service
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
            These Terms of Service (&quot;Terms&quot;) govern your use of Relevate, the AI marketing assistant for
            real estate agents. In these Terms, &quot;Relevate&quot;, &quot;we&quot;, &quot;us&quot; and
            &quot;our&quot; mean Relevate, the operator of the service, and &quot;you&quot; means the agent or
            brokerage that creates an account or uses the service.
          </p>

          <Section title="Acceptance">
            <p>
              By creating an account or using Relevate you agree to these Terms. If you do not agree with them, do
              not create an account and do not use the service.
            </p>
          </Section>

          <Section title="What the service is">
            <p>
              Relevate is an AI marketing assistant for real estate agents. It generates property descriptions, open
              house flyers, social media posts, email campaigns, listing summaries, and images from the listing
              details and photographs you provide.
            </p>
            <p>
              Generated text and images are produced by third-party AI models — currently OpenAI. Your prompts and
              listing details are sent to that provider in order to produce the output you ask for.
            </p>
          </Section>

          <Section title="Accounts">
            <p>
              You are responsible for the listing information you enter: it must be accurate and describe a property
              you are authorized to market. Keep your password safe, and write to us promptly at the address below
              if you believe an unauthorized person has used your account. One account per person or brokerage
              entity. You are responsible for activity that happens in your account.
            </p>
          </Section>

          <Section title="Free trial">
            <p>
              A new account starts with a 14-day trial of the Starter tier: up to 5 listings during the trial
              month, with no payment card required. When the trial window ends or the listing allotment is spent,
              content generation stops and the app offers the current Starter plan.
            </p>
          </Section>

          <Section title="Subscriptions, billing and renewal">
            <p>
              Paid subscriptions are billed by Stripe. Relevate never sees or stores your card number — payment
              details go directly to Stripe. The current prices are: Starter $39 per month or $435.24 per year; Pro
              $79 per month or $881.64 per year; Team $199 per month or $2,220.84 per year. A subscription renews
              automatically at the end of each billing period until it is cancelled.
            </p>
          </Section>

          <Section title="Cancellation and refunds">
            <p>
              You can cancel a subscription at any time, and it stays active until the end of the period you have
              already paid for. There is no refund for a partially used period. If you are charged twice for the
              same subscription, or a charge was made in error, the duplicate or erroneous charge is refunded in
              full when you write to us at the address below.
            </p>
          </Section>

          <Section title="Acceptable use">
            <p>
              You agree not to use the service to create content that discriminates or violates the Fair Housing
              Act, to create unlawful content of any kind, or to resell, scrape, or provide bulk automated access
              to the service. You also agree not to use the service in a way that infringes anyone else&apos;s
              rights.
            </p>
          </Section>

          <Section title="AI output is a draft you must review">
            <p>
              Content Relevate generates is a draft. It can be wrong, incomplete, or unsuitable for a particular
              listing, and it is not checked by a person before it reaches you. You review every asset before you
              publish it, and you remain responsible for what you publish and for meeting your own licensing
              obligations — including the rules of your brokerage, your real estate commission, and any MLS you
              belong to.
            </p>
          </Section>

          <Section title="Compliance output">
            <p>
              Relevate&apos;s compliance checks cover federal law and South Carolina only. Rule text is quoted from
              the sources it cites, and the items a listing is missing are flagged. That output is a research aid,
              not legal advice, and Relevate never certifies compliance. Nothing the service produces is a legal
              opinion or a statement that a listing or advertisement is lawful.
            </p>
          </Section>

          <Section title="Ownership">
            <p>
              The content Relevate generates for you belongs to you. Relevate retains all rights in the service
              itself — its software, templates, and design.
            </p>
          </Section>

          <Section title="Disclaimers">
            <p>
              The service is provided &quot;as is&quot; and &quot;as available&quot;. Relevate makes no promise
              about the accuracy of generated content, the availability of the service, or the outcome of any
              marketing you publish. No lawyer reviewed the service&apos;s output, and nothing in the service is
              legal advice.
            </p>
          </Section>

          <Section title="Limitation of liability">
            <p>
              To the fullest extent the law allows, Relevate is not liable to you for indirect, incidental,
              special, consequential, or punitive damages, or for lost profits, lost listings, or lost business,
              arising from your use of or inability to use the service. Relevate&apos;s total liability for any
              claim relating to the service is the amount you paid Relevate for the service in the twelve months
              before the claim arose.
            </p>
          </Section>

          <Section title="Termination">
            <p>
              You can stop using the service at any time. Relevate can suspend or end an account that violates
              these Terms, or where the law requires it. When an account ends, its records are handled as
              described in the Privacy Policy.
            </p>
          </Section>

          <Section title="Governing law">
            <p>
              These Terms are governed by the laws of the State of South Carolina, without regard to its
              conflict-of-law rules. The state and federal courts located in South Carolina have jurisdiction over
              any dispute arising out of these Terms or the service.
            </p>
          </Section>

          <Section title="Changes to these Terms">
            <p>
              Relevate may update these Terms from time to time. The updated version applies when it is posted on
              this page with a new effective date. Continuing to use the service after a change means you accept
              the updated Terms.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about these Terms:{" "}
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
