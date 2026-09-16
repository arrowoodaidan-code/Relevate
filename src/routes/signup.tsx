import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RelevateMark } from "~/components";
import { trackEvent } from "~/lib/analytics";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    trackEvent("signup_started");
    // Bound the request with an AbortController so a cold serverless instance
    // (first signup after a pause pays ~30s warm-up, and a cold DB-backed
    // request can exceed the host's upstream cutoff and get cut mid-stream)
    // can never leave the button stuck on "Creating account..." forever. On
    // timeout we surface a clear, recoverable message instead.
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Non-2xx (e.g. the host's 503 "Upstream unavailable" on a cold
        // instance, or a 4xx validation error) is not a JSON success envelope.
        setError(
          res.status === 503
            ? "The server is warming up. Please try again — it should only take a moment."
            : "Signup failed (status " + res.status + "). Please try again.",
        );
        return;
      }
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Signup failed");
        return;
      }
      trackEvent("user_signed_up", { email });
      navigate({ to: "/app" });
    } catch (err: any) {
      if (err && (err.name === "AbortError" || err.code === 20)) {
        setError(
          "Creating your account is taking longer than usual (the server is warming up). Please try again.",
        );
      } else {
        setError(
          err && err.message
            ? err.message
            : "Network error. Please try again.",
        );
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#0a1a0a]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2 group">
          <RelevateMark className="h-8 w-8 transition-transform duration-300 group-hover:scale-110" />
          <span className="text-lg font-bold text-emerald-100">Relevate</span>
        </a>
      </div>

      <div className="mx-auto max-w-md px-6 pb-24 pt-8">
        <div className="rounded-2xl border border-emerald-800/30 bg-[#0a1a0a]/80 p-8 shadow-sm backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-emerald-100">Create your account</h1>
          <p className="mt-2 text-sm text-emerald-300/50">Start creating professional marketing materials in minutes.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-emerald-200/80">Full name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-4 py-2.5 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                placeholder="Jane Smith"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-emerald-200/80">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-4 py-2.5 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                placeholder="jane@example.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-emerald-200/80">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-4 py-2.5 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-emerald-200/80">Confirm password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-emerald-800/40 bg-[#050f05]/60 px-4 py-2.5 text-sm text-emerald-100 placeholder-emerald-600/50 focus-ring-forest outline-none"
                placeholder="Repeat your password"
                minLength={6}
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-900/30 px-4 py-3 text-sm text-red-300 border border-red-800/30">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg wood-button px-6 py-3 text-sm font-semibold text-emerald-100 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-emerald-300/50">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-emerald-400 hover:text-emerald-300 transition">Log in</a>
          </p>
        </div>
      </div>
    </div>
  );
}