/**
 * Public base-URL resolution for customer-facing links (checkout success/cancel redirects,
 * future magic links).
 *
 * WHY THIS EXISTS
 * A live Stripe Checkout Session created on 2026-09-23 came back with
 * `success_url: https://ip-10-110-103-223.us-west-2.prod.aws.beamlit.net/app/subscription/success…`
 * — an internal AWS hostname with no public DNS record. A paying customer would have been
 * redirected to a page that cannot load. Cause: the endpoint preferred `process.env.VERCEL_URL`,
 * which on this platform is the internal hostname of the machine serving the request.
 *
 * RULE — a URL a buyer is sent to must be reachable by the buyer:
 *   1. an explicitly configured public base URL wins (`PUBLIC_APP_URL`, `APP_BASE_URL`,
 *      `SITE_BASE_URL`);
 *   2. otherwise the host the request itself arrived on (`x-forwarded-host`, else `Host`), because
 *      the session is created on the host the buyer is already using, so the two always agree;
 *   3. platform-provided hostnames (`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`) only as a last
 *      resort — and only if they pass the public-hostname test;
 *   4. otherwise there is NO base URL, and the caller must fail honestly instead of emitting a
 *      dead link (see `create-checkout-session.ts`: it throws before creating a session, so no
 *      money is taken and no customer is stranded).
 *
 * This module is deliberately dependency-free (no imports) so both the server code and the
 * verification gate can execute the real logic.
 */

/** Names of environment variables that may hold an explicitly configured public base URL. */
export const PUBLIC_BASE_URL_ENV_NAMES = ["PUBLIC_APP_URL", "APP_BASE_URL", "SITE_BASE_URL"] as const;

/** Platform-provided hostnames, only used when nothing better exists AND they are public. */
export const PLATFORM_HOST_ENV_NAMES = ["VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;

/**
 * True when a hostname addresses something only the platform itself can reach:
 * an IP literal, `localhost`, a single-label name, a `.internal`/`.local`/`.svc` name, or the
 * IP-encoded machine names cloud providers hand out (e.g. `ip-10-110-103-223.us-west-2…`).
 */
export function isInternalHostname(rawHost: string): boolean {
  const host = stripHost(rawHost);
  if (!host) return true;

  // IPv4 literal, with or without a port.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  // IPv6 literal.
  if (host.startsWith("[") || host.includes(":")) return true;

  const labels = host.split(".");
  if (labels.length < 2) return true; // "localhost", "mybox"
  if (labels.some((l) => l.length === 0)) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  for (const suffix of [".local", ".localdomain", ".internal", ".svc", ".cluster.local", ".test", ".invalid", ".example"]) {
    if (host.endsWith(suffix)) return true;
  }
  // Cloud machine names that encode a private IP: ip-10-110-103-223.<region>…
  if (/^ip-\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}\b/.test(host)) return true;
  return false;
}

/** True when a hostname is a public DNS name a customer's browser can resolve and reach. */
export function isPublicHostname(rawHost: string): boolean {
  const host = stripHost(rawHost);
  if (!host || isInternalHostname(host)) return false;
  // A public hostname has a registrable domain: at least two labels, the last alphabetic.
  const labels = host.split(".");
  return labels.length >= 2 && /^[a-z]{2,}$/i.test(labels[labels.length - 1]);
}

/** Strip a scheme, path, query and a non-default port; lower-case the result. */
export function stripHost(raw: string): string {
  let value = (raw ?? "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("://")) {
    try {
      value = new URL(value).hostname;
    } catch {
      return "";
    }
  }
  value = value.replace(/[/?#].*$/, "");
  value = value.replace(/\.$/, "");
  // Drop a port unless it is a loopback/dev port, which we keep for readability of errors.
  const portMatch = value.match(/:(\d+)$/);
  if (portMatch) value = value.slice(0, -portMatch[0].length);
  return value;
}

/** First value of a comma-separated proxy header (`x-forwarded-host: a, b`). */
function firstHeaderValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.split(",")[0]!.trim();
}

export type BaseUrlInput = {
  /** Request headers of the request that is creating the link. */
  headers?: Headers | Record<string, string | undefined | null> | null;
  /** Environment to read (defaults to `process.env`). Injected for tests. */
  env?: Record<string, string | undefined>;
};

function headerValue(headers: BaseUrlInput["headers"], name: string): string {
  if (!headers) return "";
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? "";
  }
  const record = headers as Record<string, string | undefined | null>;
  const direct = record[name] ?? record[name.toLowerCase()];
  return direct ?? "";
}

/**
 * Resolve the public base URL a customer-facing link should use, or `null` when none can be
 * established (the caller must then fail honestly rather than build a dead link).
 */
export function resolvePublicBaseUrl(input: BaseUrlInput = {}): string | null {
  const env = input.env ?? (typeof process !== "undefined" ? process.env : {});

  // 1. An explicit configuration always wins.
  for (const name of PUBLIC_BASE_URL_ENV_NAMES) {
    const candidate = (env[name] ?? "").trim();
    if (candidate && isPublicHostname(candidate)) {
      return `https://${stripHost(candidate)}`;
    }
  }

  // 2. The host this request arrived on (what the buyer is actually using).
  //    Loopback is allowed here only for local development.
  const forwardedHost = firstHeaderValue(headerValue(input.headers, "x-forwarded-host"));
  const hostHeader = firstHeaderValue(headerValue(input.headers, "host"));
  const requestHost = stripHost(forwardedHost || hostHeader);
  if (requestHost) {
    const isLoopback = requestHost === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(requestHost);
    if (isPublicHostname(requestHost)) {
      const proto = firstHeaderValue(headerValue(input.headers, "x-forwarded-proto")) || "https";
      return `${proto === "http" ? "http" : "https"}://${requestHost}`;
    }
    if (isLoopback && env.NODE_ENV !== "production") {
      return `http://${requestHost}:${env.PORT || "3000"}`;
    }
  }

  // 3. Platform-provided hostnames, and only when they are genuinely public.
  for (const name of PLATFORM_HOST_ENV_NAMES) {
    const candidate = (env[name] ?? "").trim();
    if (candidate && isPublicHostname(candidate)) {
      return `https://${stripHost(candidate)}`;
    }
  }

  return null;
}
