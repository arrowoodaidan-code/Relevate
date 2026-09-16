import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RelevateMark } from "~/components";
import { trackEvent } from "~/lib/analytics";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
});

function DemoPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    trackEvent("demo_viewed");
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("busy");
    setError("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, brokerage, source: "schedule-a-demo" }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      trackEvent("demo_requested", { email });
      setStatus("success");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-dvh bg-[#0a1a0a] font-['Inter',system-ui,sans-serif]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 group">
          <RelevateMark className="h-8 w-8 transition-transform duration-300 group-hover:scale-110" />
          <span className="text-lg font-bold text-emerald-100">Relevate</span>
        </Link>
        <Link to="/signup" className="text-sm font-medium text-emerald-300/70 transition hover:text-emerald-100">
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-lg px-6 pb-24 pt-10 sm:pt-16">
        <div className="rounded-2xl border border-emerald-800/30 bg-[#0a1a0a]/80 p-8 shadow-sm backdrop-blur-sm">
          {status === "success" ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-900/40 text-emerald-400">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h1 className="font-serif text-2xl font-bold text-emerald-50">Request received!</h1>
              <p className="mt-3 text-sm text-emerald-300/70">
                Thanks, {name.trim().split(" ")[0] || "there"} — we've got your demo request. Our team
                will reach out to schedule a walkthrough soon.
              </p>
              <Link
                to="/"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-500"
              >
                Back to Relevate
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-serif text-2xl font-bold text-emerald-50">Schedule a Demo</h1>
              <p className="mt-2 text-sm text-emerald-300/60">
                See Relevate in action. Tell us a bit about you and we'll be in touch.
              </p>
              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label htmlFor="demo-name" className="block text-sm font-medium text-emerald-200/80">Full name</label>
                  <input
                    id="demo-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Jane Agent"
                    className="mt-1.5 w-full rounded-lg border border-emerald-800/40 bg-[#071307]/80 px-3 py-2.5 text-sm text-emerald-100 placeholder:text-emerald-400/40 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="demo-email" className="block text-sm font-medium text-emerald-200/80">Work email</label>
                  <input
                    id="demo-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="jane@brokerage.com"
                    className="mt-1.5 w-full rounded-lg border border-emerald-800/40 bg-[#071307]/80 px-3 py-2.5 text-sm text-emerald-100 placeholder:text-emerald-400/40 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="demo-brokerage" className="block text-sm font-medium text-emerald-200/80">
                    Brokerage <span className="text-emerald-400/40">(optional)</span>
                  </label>
                  <input
                    id="demo-brokerage"
                    type="text"
                    value={brokerage}
                    onChange={(e) => setBrokerage(e.target.value)}
                    placeholder="Acme Realty"
                    className="mt-1.5 w-full rounded-lg border border-emerald-800/40 bg-[#071307]/80 px-3 py-2.5 text-sm text-emerald-100 placeholder:text-emerald-400/40 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                {status === "error" && (
                  <p className="rounded-lg border border-amber-700/40 bg-amber-950/40 px-3 py-2 text-sm text-amber-300/90">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={status === "busy"}
                  className="w-full rounded-lg wood-button px-6 py-3 text-sm font-semibold text-emerald-100 shadow-md disabled:opacity-60"
                >
                  {status === "busy" ? "Sending…" : "Request a Demo"}
                </button>
                <p className="text-[11px] leading-relaxed text-emerald-400/40">
                  Prefer to start now? <Link to="/signup" className="text-emerald-300/80 underline">Create a free account</Link>{" "}
                  and explore Relevate on your own.
                </p>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
