import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Navigation, RelevateMark } from "~/components";
import { trackEvent } from "~/lib/analytics";

export const Route = createFileRoute("/app/subscription/success")({
  component: SubscriptionSuccessPage,
  /* Read the checkout reference Stripe appends, and never lose it: validateSearch keeps
   * ?session_id=… in the URL rather than dropping it in a redirect. */
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
});

function SubscriptionSuccessPage() {
  const { session_id } = Route.useSearch();
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
          We&rsquo;re setting up your Relevate account now — that part is done by
          hand, not automatically, so it can take a little while. When it&rsquo;s
          ready, sign in with the email address you used at checkout. Want an
          update sooner? Reply to your Stripe receipt and we&rsquo;ll tell you
          where it stands.
        </p>

        {/* Being signed out here is normal — a buyer returning from Stripe may have no session on
            this device — and this page cannot tie a checkout reference to an account by itself.
            Say that plainly instead of sending them to /login with no context. Copy stays as
            strong as it was: no "your subscription is active", no promised email. */}
        <p className="mt-4 animate-fade-in-up text-base leading-relaxed text-emerald-200/70">
          This page can&rsquo;t tell on its own which account a checkout belongs to, and you
          don&rsquo;t need to be signed in to read it. Sign in with the email address you used at
          checkout and we&rsquo;ll match the payment to your account.
          {session_id ? (
            <>
              {" "}
              Your checkout reference is{" "}
              <code className="rounded bg-emerald-950/60 px-1.5 py-0.5 font-mono text-xs text-emerald-100">
                {session_id}
              </code>{" "}
              — quote it if you reply to your Stripe receipt.
            </>
          ) : null}
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
