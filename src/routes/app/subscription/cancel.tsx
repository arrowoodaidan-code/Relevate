import { createFileRoute, Link } from "@tanstack/react-router";
import { Navigation } from "~/components";

export const Route = createFileRoute("/app/subscription/cancel")({
  component: SubscriptionCancelPage,
});

function SubscriptionCancelPage() {
  return (
    <div className="min-h-dvh bg-[#0a1a0a]">
      <Navigation transparent={false} />

      <main className="relative mx-auto max-w-2xl px-6 pb-24 pt-16 text-center sm:pt-24">
        {/* Info icon */}
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-400/30 bg-amber-950/60">
          <svg
            className="h-10 w-10 text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>

        <h1 className="animate-fade-in-down font-serif text-3xl font-bold text-emerald-50 sm:text-4xl">
          No worries — you can try again anytime
        </h1>

        <p className="mt-6 animate-fade-in-up text-lg leading-relaxed text-emerald-200/80">
          Your subscription wasn't completed. This could be due to a declined card,
          a closed browser window, or just a change of heart. No charges have been
          made, and you can come back whenever you're ready.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            to="/"
            className="wood-btn inline-flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-950/60 px-6 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-900/60"
          >
            Back to Plans
          </Link>
          <Link
            to="/app"
            className="wood-btn inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-500"
          >
            Go to Dashboard
          </Link>
        </div>

        <p className="mt-8 text-sm text-emerald-400/50">
          Questions about plans or pricing? Head back to the homepage and scroll
          to the FAQ section, or contact our team.
        </p>
      </main>
    </div>
  );
}
