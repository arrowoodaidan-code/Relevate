import { useEffect, useRef } from "react";
import type { CheckoutUnavailable } from "~/lib/product-checkout";

type Props = {
  /** Non-null while the notice is open. Nothing has navigated and nothing has been charged. */
  unavailable: CheckoutUnavailable | null;
  /** Close the notice. The visitor stays exactly where they were. */
  onClose: () => void;
  /** Start checkout again on THIS host with a plan that works here (e.g. monthly). */
  onRetry: (planKey: string, planLabel: string) => void;
  /** True while the retry request is in flight. */
  retrying?: boolean;
};

/**
 * Honest, in-place notice that this page cannot start a payment.
 *
 * History: the first version of this dialog offered to CONTINUE checkout on another host
 * (`site-gray-five-32.vercel.app`). That was the wrong default — that host bills into a separate
 * Stripe account this team cannot see, so a payment made there is money we cannot reconcile.
 * This version routes nobody anywhere: it states the reason, confirms nothing was charged, and
 * offers only what actually works on the host the visitor is already on.
 */
export function CheckoutUnavailableDialog({ unavailable, onClose, onRetry, retrying }: Props) {
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!unavailable) return;
    primaryRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [unavailable, onClose]);

  if (!unavailable) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-unavailable-title"
        className="w-full max-w-md rounded-xl border border-emerald-700/40 bg-[#0a1a0a] p-6 shadow-2xl"
      >
        <h2 id="checkout-unavailable-title" className="text-lg font-semibold text-emerald-100">
          Checkout isn&rsquo;t available from this page
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-emerald-200/70">
          {unavailable.reason}
        </p>

        <p className="mt-3 text-sm leading-relaxed text-emerald-200/70">
          We could not start a payment for{" "}
          <span className="font-semibold text-emerald-100">{unavailable.planLabel}</span> on this
          page. <span className="font-semibold text-emerald-100">Nothing has been charged</span> and
          nothing has been submitted.
        </p>

        {unavailable.fallback ? (
          <div className="mt-5 rounded-lg border border-emerald-700/30 bg-emerald-950/40 p-4">
            <p className="text-sm leading-relaxed text-emerald-200/80">
              This page can take{" "}
              <span className="font-semibold text-emerald-100">
                {unavailable.fallback.planLabel}
              </span>{" "}
              instead. {unavailable.fallback.note}
            </p>
            <button
              ref={primaryRef}
              type="button"
              disabled={retrying}
              onClick={() =>
                onRetry(unavailable.fallback!.planKey, unavailable.fallback!.planLabel)
              }
              className="mt-3 w-full rounded-lg wood-button px-4 py-2.5 text-sm font-semibold text-emerald-100 disabled:opacity-60 sm:w-auto"
            >
              {retrying
                ? "Opening checkout…"
                : `Subscribe ${unavailable.fallback.planLabel} instead`}
            </button>
          </div>
        ) : (
          <p className="mt-5 text-sm leading-relaxed text-emerald-200/70">
            You can try again in a moment, or contact us and we&rsquo;ll set your plan up directly.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-emerald-700/40 px-4 py-2.5 text-sm font-medium text-emerald-200/80 transition hover:border-emerald-600/60 hover:text-emerald-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
