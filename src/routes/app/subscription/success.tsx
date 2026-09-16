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
          Welcome to Relevate!
        </h1>

        <p className="mt-6 animate-fade-in-up text-lg leading-relaxed text-emerald-200/80">
          Your subscription is active. You now have full access to Relevate's
          AI-powered marketing tools — generate property descriptions, open house
          flyers, social media posts, email campaigns, and listing summaries in
          seconds.
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
          A confirmation email will arrive shortly. If you have any questions,
          reach out to our support team.
        </p>
      </main>
    </div>
  );
}
