import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RelevateMark } from "~/components";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Login failed");
        return;
      }
      navigate({ to: "/app" });
    } catch (err: any) {
      setError(err.message || "Network error. Please try again.");
    } finally {
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

      <div className="mx-auto max-w-md px-6 pb-24 pt-12">
        <div className="rounded-2xl border border-emerald-800/30 bg-[#0a1a0a]/80 p-8 shadow-sm backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-emerald-100">Welcome back</h1>
          <p className="mt-2 text-sm text-emerald-300/50">Log in to continue creating marketing materials.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
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
                placeholder="Enter your password"
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
              {loading ? "Logging in..." : "Log in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-emerald-300/50">
            Don't have an account?{" "}
            <a href="/signup" className="font-medium text-emerald-400 hover:text-emerald-300 transition">Sign up</a>
          </p>
        </div>
      </div>
    </div>
  );
}