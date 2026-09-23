/**
 * Gate: Relevate ships NO third-party analytics connection.
 *
 * Run: bun scripts/check-no-vendor-analytics.ts   (exit 0 = pass, 1 = fail)
 *
 * Owner directive: every connection to the analytics vendor was removed from the product, and it
 * must not creep back. This gate is static and offline (no network, no build of its own).
 *
 * Checks:
 *  1. The vendor name and its hostnames appear nowhere in `src/`, `package.json`, `bun.lock`,
 *     `package-lock.json`, any root `.env*` file, or the built output in `dist/` (when present).
 *  2. No other common analytics vendor is referenced from `src/` either.
 *  3. `src/routes/__root.tsx` injects no inline third-party loader — every <script> it renders is
 *     a `application/ld+json` metadata block.
 *  4. `src/lib/analytics.ts` is a documented NO-OP: `isAnalyticsEnabled()` returns false, and the
 *     module performs no request, beacon, global lookup or env read.
 *  5. `src/lib/analytics.ts` is the only analytics module, and the ~20 call sites still exist —
 *     they mark where first-party counting would go, so deleting them cannot quietly hide the
 *     fact that nothing is measured.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const VENDOR_NAME = "posthog"; // the vendor that was removed
const VENDOR_HOSTS = ["i.posthog.com"]; // API host + "-assets." asset host share this suffix

// Other known third-party analytics / session-recording vendors: same failure class.
const OTHER_VENDORS = [
  "google-analytics.com",
  "googletagmanager.com",
  "gtag/js",
  "mixpanel",
  "amplitude.com",
  "segment.io",
  "plausible.io",
  "matomo",
  "hotjar",
  "heap.io",
  "fullstory",
  "clarity.ms",
  "countly",
  "umami.is",
];

const failures: string[] = [];
const notes: string[] = [];
function check(ok: boolean, label: string) {
  (ok ? notes : failures).push(`${ok ? "OK  " : "FAIL"} ${label}`);
}

const TEXT_EXT = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".map",
  ".html",
  ".htm",
  ".css",
  ".txt",
  ".xml",
  ".svg",
]);

/** Every regular file under `dir`, recursively. Missing dir -> []. */
function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/** True when the file text contains any of `needles` (case-insensitive). Returns the hit. */
function hit(text: string, needles: string[]): string | null {
  const lower = text.toLowerCase();
  for (const n of needles) if (lower.includes(n.toLowerCase())) return n;
  return null;
}

const needles = [VENDOR_NAME, ...VENDOR_HOSTS];

/* 1 + 2. Source tree, manifests, lockfiles, env files. */
const scanned: string[] = [];
const offenders: string[] = [];

for (const rel of walk("src")) {
  scanned.push(rel);
  const found = hit(read(rel), needles);
  if (found) offenders.push(`${rel} (contains "${found}")`);
}

for (const rel of ["package.json", "bun.lock", "package-lock.json"]) {
  if (!existsSync(join(ROOT, rel))) continue;
  scanned.push(rel);
  const text = read(rel);
  const found = hit(text, needles);
  if (found) offenders.push(`${rel} (contains "${found}")`);
  // Lockfiles also pin the vendor's own scoped packages (e.g. @vendor/*).
  const scoped = new RegExp(`@${VENDOR_NAME}`, "i");
  if (scoped.test(text)) offenders.push(`${rel} (pins a @${VENDOR_NAME}/* package)`);
}

for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.startsWith(".env")) continue;
  const text = readFileSync(join(ROOT, entry.name), "utf8");
  scanned.push(entry.name);
  const found = hit(text, needles);
  if (found) offenders.push(`${entry.name} (contains "${found}")`);
}

check(
  scanned.length > 0,
  `scanned ${scanned.length} source/manifest/env file(s) for the removed vendor`,
);
check(
  offenders.length === 0,
  "no analytics vendor name, host or scoped package in src/, manifests, lockfiles or .env*" +
    (offenders.length ? `\n      -> ${offenders.join("\n      -> ")}` : ""),
);

/* 2 (cont). Other analytics vendors, source tree only (manifests may legitimately list none, but
   keep the check tight to avoid false positives on unrelated tooling). */
const otherOffenders: string[] = [];
for (const rel of walk("src")) {
  const found = hit(read(rel), OTHER_VENDORS);
  if (found) otherOffenders.push(`${rel} (contains "${found}")`);
}
check(
  otherOffenders.length === 0,
  "src/ references no other third-party analytics vendor" +
    (otherOffenders.length ? `\n      -> ${otherOffenders.join("\n      -> ")}` : ""),
);

/* 3. Built output, when it exists (run `bun run build` first for a full check). */
const distFiles = walk("dist");
if (distFiles.length === 0) {
  notes.push("OK  dist/ not present — built output not checked (run `bun run build` first)");
} else {
  const distOffenders: string[] = [];
  let distScanned = 0;
  for (const rel of distFiles) {
    if (!TEXT_EXT.has(extname(rel))) continue;
    const abs = join(ROOT, rel);
    if (statSync(abs).size > 8 * 1024 * 1024) continue;
    distScanned++;
    const found = hit(readFileSync(abs, "utf8"), needles);
    if (found) distOffenders.push(`${rel} (contains "${found}")`);
  }
  check(
    distScanned > 0,
    `scanned ${distScanned} built output file(s) in dist/`,
  );
  check(
    distOffenders.length === 0,
    "the built output carries no analytics vendor reference" +
      (distOffenders.length ? `\n      -> ${distOffenders.join("\n      -> ")}` : ""),
  );
}

/* 4. __root.tsx injects no inline third-party loader. */
const root = read("src/routes/__root.tsx");
check(
  /scripts:\s*\[/.test(root),
  "src/routes/__root.tsx still declares its scripts array explicitly",
);
check(
  !/children:\s*`/.test(root),
  "src/routes/__root.tsx injects no inline template-literal <script> (the vendor-loader class)",
);
check(
  (root.match(/type:\s*"application\/ld\+json"/g) ?? []).length === 2,
  "every script __root.tsx renders is an application/ld+json metadata block (2 expected)",
);
check(
  !/\b(window|globalThis)\.(posthog|gtag|dataLayer|mixpanel)\b/.test(root),
  "src/routes/__root.tsx touches no analytics global",
);

/* 5. The analytics module is a documented NO-OP and stays the only one. */
const analytics = read("src/lib/analytics.ts");
check(
  /export function isAnalyticsEnabled\(\)\s*:\s*boolean\s*\{\s*return false;/.test(analytics),
  "isAnalyticsEnabled() returns false unconditionally",
);
check(
  /export function trackEvent\(/.test(analytics) && /export function identifyUser\(/.test(analytics),
  "trackEvent() and identifyUser() are still exported (call sites keep compiling)",
);
check(
  !/\b(fetch|XMLHttpRequest|sendBeacon|localStorage|process\.env)\b/.test(analytics),
  "the analytics module performs no request, beacon, storage write or env read",
);
check(
  /NO-OP/i.test(analytics) && /no third-party analytics/i.test(analytics),
  "the module header states plainly that analytics is off and no third-party connection exists",
);

const otherModules = walk("src").filter(
  (rel) => /analytics/i.test(rel) && rel !== "src/lib/analytics.ts",
);
check(
  otherModules.length === 0,
  "src/lib/analytics.ts is the only analytics module" +
    (otherModules.length ? ` (also found: ${otherModules.join(", ")})` : ""),
);

const callSites = walk("src")
  .filter((rel) => rel !== "src/lib/analytics.ts")
  .reduce((n, rel) => {
    const m = read(rel).match(/\b(trackEvent|identifyUser|isAnalyticsEnabled)\s*\(/g);
    return n + (m ? m.length : 0);
  }, 0);
check(
  callSites >= 15,
  `analytics call sites are still present as documented hooks (found ${callSites}, expected >= 15)`,
);

/* Report. */
for (const line of notes) console.log(line);
if (failures.length) {
  console.log();
  for (const line of failures) console.log(line);
  console.log(
    `\n${failures.length} of ${failures.length + notes.length} checks FAILED — ` +
      "Relevate must ship with no third-party analytics connection.",
  );
  process.exit(1);
}
console.log(
  `\nAll ${notes.length} checks passed — no third-party analytics connection in this tree.`,
);
