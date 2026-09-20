import { useEffect, useRef } from "react";
import type { CheckoutHandoff } from "~/lib/product-checkout";

type Props = {
  /** Non-null while the confirmation is open. Nothing has navigated or been charged yet. */
  handoff: CheckoutHandoff | null;
  /** What the visitor is about to buy, e.g. "Starter — $39/mo". Shown so the plan is named. */
  planLabel: string;
  onCancel: () => void;
};

/**
 * Explicit, labelled handoff when the current host cannot start a payment.
 *
 * Why this exists: checkout works on the product host, but the marketing host is built
 * without a Stripe key. The old code silently set `window.location.href` to the product
 * host, so a buyer on the branded domain was teleported to a raw platform hostname with no
 * explanation. This dialog names the destination, says nothing was charged, and leaves the
 * decision to the visitor. The Continue control is a real link, not a scripted redirect.
 */
export function CheckoutHandoffDialog({ handoff, planLabel, onCancel }: Props) {
  const continueRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (!handoff) return;
    continueRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handoff, onCancel]);

  if (!handoff) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-handoff-title"
        className="w-full max-w-md rounded-xl border border-emerald-700/40 bg-[#0a1a0a] p-6 shadow-2xl"
      >
        <h2
          id="checkout-handoff-title"
          className="text-lg font-semibold text-emerald-100"
        >
          Checkout opens on a different address
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-emerald-200/70">
          This page can&rsquo;t start a payment, so subscribing to{" "}
          <span className="font-semibold text-emerald-100">{planLabel}</span> continues on{" "}
          <span className="rounded bg-emerald-900/60 px-1.5 py-0.5 font-mono text-xs text-emerald-100">
            {handoff.host}
          </span>
          .
        </p>

        <p className="mt-3 text-sm leading-relaxed text-emerald-200/60">
          That is a different domain from the one you are on now. You&rsquo;ll be taken to that
          site&rsquo;s pricing page, where the same plan is available. Nothing has been charged
          yet, and nothing has been submitted.
        </p>

        <p className="mt-3 text-xs leading-relaxed text-emerald-300/40">
          Reason reported by this page: {handoff.reason}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-emerald-700/40 px-4 py-2.5 text-sm font-medium text-emerald-200/80 transition hover:border-emerald-600/60 hover:text-emerald-100"
          >
            Stay on this page
          </button>
          <a
            ref={continueRef}
            href={handoff.url}
            rel="noreferrer"
            className="rounded-lg wood-button px-4 py-2.5 text-center text-sm font-semibold text-emerald-100"
          >
            Continue to checkout on {handoff.host}
          </a>
        </div>
      </div>
    </div>
  );
}
