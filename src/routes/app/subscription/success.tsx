import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Navigation, RelevateMark } from "~/components";
import { trackEvent } from "~/lib/analytics";

export const Route = createFileRoute("/app/subscription/success")({
  component: SubscriptionSuccessPage,
});

function SubscriptionSuccessPage() {
  useEffect(() => {
    trackEvent("subscription_paid");
  }, []);
  return (
    <div className="min-h-dvh bg-[#0a1a0a]">
      <Navigation transparent={false} />

      <main className="relative mx-auto max-w-2xl px-6 pb-24 pt-16 text-center sm:pt-24">
        {/* Success icon */}
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-400/30 bg-emerald-950/60">
          <svg
            className="h-10 w-10 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        <h1 className="animate-fade-in-down font-serif text-3xl font-bold text-emerald-50 sm:text-4xl">
          Thanks — your payment went through
        </h1>

        <p className="mt-6 animate-fade-in-up text-lg leading-relaxed text-emerald-200/80">
          We&rsquo;re finishing your Relevate account now. You&rsquo;ll normally
          have full access within a few minutes — if the dashboard still looks
          locked after that, refresh this page. Still locked? Reply to your Stripe
          receipt and we&rsquo;ll activate your account for you.
        </p>

        <p className="mt-4 animate-fade-in-up text-base leading-relaxed text-emerald-200/70">
          Sign in with the email address you used at checkout — that&rsquo;s how we
          match your payment to your account.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            to="/app"
            className="wood-btn inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-500"
          >
            <RelevateMark className="h-5 w-5" />
            Go to Dashboard
          </Link>
        </div>

        <p className="mt-8 text-sm text-emerald-400/50">
          Your Stripe receipt is your confirmation — we don&rsquo;t send a separate
          confirmation email. Any question about your plan? Reply to that receipt
          and it reaches us.
        </p>
      </main>
    </div>
  );
}
