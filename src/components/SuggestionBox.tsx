import { useState } from "react";
import { trackEvent } from "~/lib/analytics";

interface SuggestionBoxProps {
  /** "flyer" | "social" — which rendered asset this box sits under. */
  type: "flyer" | "social";
  /** The currently-active brandStyle (so the resolver can report real changes). */
  currentStyle?: string;
  /**
   * Called with a resolved renderer-supported brandStyle when the suggestion is
   * applied — the parent re-renders /api/render with this style.
   */
  onApplyStyle: (brandStyle: string) => void;
}

type Status =
  | { kind: "applied"; text: string }
  | { kind: "error"; text: string }
  | { kind: "idle" }
  | { kind: "busy" };

const PLACEHOLDERS: Record<"flyer" | "social", string> = {
  flyer: "Suggest a change… e.g. “coastal blue theme”, “gold luxury”",
  social: "Suggest a change… e.g. “modern silver”, “rose blush”",
};

/**
 * A prompt box under the rendered image. It maps a natural-language suggestion
 * to a renderer-supported style change (via /api/resolve-render-suggestion) and,
 * when the renderer CAN apply it, tells the parent to re-render with that style.
 * It is NOT decorative: unsupported suggestions return an honest reason instead
 * of pretending to apply a change.
 */
export function SuggestionBox({ type, currentStyle, onApplyStyle }: SuggestionBoxProps) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const suggestion = text.trim();
    if (!suggestion) {
      setStatus({ kind: "error", text: "Type a suggestion first." });
      return;
    }
    setStatus({ kind: "busy" });
    try {
      const res = await fetch("/api/resolve-render-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ suggestion, currentStyle: currentStyle ?? "", type }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        if (data.changed === false) {
          setStatus({ kind: "applied", text: `${data.applied} (already the active style.)` });
        } else {
          onApplyStyle(String(data.brandStyle));
          trackEvent("render_suggestion_applied", { type, brandStyle: data.brandStyle });
          setStatus({ kind: "applied", text: String(data.applied) });
        }
      } else {
        setStatus({
          kind: "error",
          text: String(data?.reason || data?.error || "Couldn't apply that suggestion."),
        });
      }
    } catch {
      setStatus({ kind: "error", text: "Something went wrong. Please try again." });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border border-emerald-800/40 bg-[#0a1a0a]/60 p-4"
    >
      <label className="mb-1.5 block text-xs font-semibold text-emerald-200/80">
        Suggest an image change
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDERS[type]}
          className="w-full rounded-lg border border-emerald-800/40 bg-[#071307]/80 px-3 py-2 text-sm text-emerald-100 placeholder:text-emerald-400/40 focus:border-emerald-600 focus:outline-none"
          aria-label="Suggest an image change"
        />
        <button
          type="submit"
          disabled={status.kind === "busy" || !text.trim()}
          className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-600 disabled:opacity-50"
        >
          {status.kind === "busy" ? "Applying…" : "Apply"}
        </button>
      </div>

      {/* Honest feedback: what was applied, or why it couldn't be. */}
      {status.kind === "applied" && (
        <p className="mt-2 text-xs text-emerald-300/90">
          <span className="font-semibold text-emerald-400">✓</span> {status.text}{" "}
          <span className="text-emerald-400/60">The image has been re-rendered.</span>
        </p>
      )}
      {status.kind === "error" && (
        <p className="mt-2 text-xs text-amber-300/90">{status.text}</p>
      )}
      {status.kind === "idle" && (
        <p className="mt-2 text-[11px] text-emerald-400/50">
          This applies a style/theme the design tool supports (e.g. an accent color). Layout and
          text-size changes aren't individually adjustable yet.
        </p>
      )}
    </form>
  );
}
