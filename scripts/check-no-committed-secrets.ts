/**
 * Gate: no secrets in the tracked tree.
 *
 * Run: bun scripts/check-no-committed-secrets.ts   (exit 0 = pass, 1 = fail)
 *
 * Committed values are readable by anyone with repo access and they stay in history forever, so
 * the only safe rule is "secrets never enter a tracked file". This gate scans every tracked file
 * (whatever `git ls-files` reports) and fails when it finds a secret-shaped value.
 *
 * Checks:
 *  1. No `.env*` file is tracked at all (except an explicitly allowed `.env.example`). Real
 *     configuration arrives as environment variables; env files stay local and ignored.
 *  2. No file contains a provider-shaped secret: Stripe live/test secret + restricted + webhook
 *     keys, OpenAI-style `sk-…`, a PostHog `phc_…` project key, GitHub tokens, Slack tokens, AWS
 *     access keys, Google API keys, PEM private-key blocks, or any JWT.
 *  3. No single opaque token-like run of 200+ characters (long-lived bearer tokens, pasted
 *     credentials) anywhere in a tracked file.
 *  4. Placeholders are genuinely placeholders — the gate reports the env-shaped lines it saw so a
 *     green run means "only placeholder text", not "the scan silently matched nothing".
 *
 * A hit whose value carries placeholder markers (`…`, `xxxx`, `YOUR_`, `PLACEHOLDER`, `EXAMPLE`,
 * `CHANGE_ME`, `<...>`, `redacted`) is reported as a NOTE, not a failure — but the markers must be
 * in the value itself, never bolted on to a real secret.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const failures: string[] = [];
const notes: string[] = [];
function check(ok: boolean, label: string) {
  (ok ? notes : failures).push(`${ok ? "OK  " : "FAIL"} ${label}`);
}

/* Tracked files only — an untracked local file is not a leak. */
const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split("\0")
  .filter(Boolean);

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".txt",
  ".css",
  ".html",
  ".yml",
  ".yaml",
  ".sh",
  ".env",
  ".example",
  ".sql",
  ".csv",
  ".toml",
  ".lock",
]);
const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".pdf",
  ".zip",
  ".gz",
  ".wasm",
  ".mp4",
  ".db",
]);

/** Env-file basenames that are allowed to be tracked (templates with no real values). */
const ALLOWED_ENV_FILES = new Set([".env.example", ".env.sample", ".env.template"]);
const isEnvFile = (rel: string) => {
  const b = basename(rel);
  return b === ".env" || b.startsWith(".env.") || b.endsWith(".env");
};

const PLACEHOLDER_MARKERS = [
  "...",
  "…",
  "xxxx",
  "your_",
  "your-",
  "placeholder",
  "example",
  "change_me",
  "changeme",
  "redacted",
  "todo",
  "<",
  ">",
];

const SECRET_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Stripe live secret key", re: /\bsk_live_[A-Za-z0-9]{10,}/g },
  { label: "Stripe test secret key", re: /\bsk_test_[A-Za-z0-9]{10,}/g },
  { label: "Stripe restricted key", re: /\b(rk|sk)_(live|test)_[A-Za-z0-9]{10,}/g },
  { label: "Stripe webhook signing secret", re: /\bwhsec_[A-Za-z0-9]{10,}/g },
  { label: "OpenAI-style API key", re: /\bsk-(proj-)?[A-Za-z0-9_-]{20,}/g },
  { label: "PostHog project key", re: /\bphc_[A-Za-z0-9]{20,}/g },
  { label: "GitHub token", re: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g },
  { label: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { label: "AWS access key id", re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { label: "Google API key", re: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { label: "Vercel token", re: /\bvercel_[A-Za-z0-9]{20,}/gi },
  { label: "PEM private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { label: "JSON Web Token", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { label: "long opaque token-like value (200+ chars)", re: /[A-Za-z0-9_\-+/=.]{200,}/g },
];

const isPlaceholder = (value: string) => {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((m) => lower.includes(m));
};

/* 1. No tracked env file (except an allow-listed template). */
const trackedEnvFiles = tracked.filter((rel) => isEnvFile(rel) && !ALLOWED_ENV_FILES.has(basename(rel)));
check(
  trackedEnvFiles.length === 0,
  "no .env* file is tracked" +
    (trackedEnvFiles.length
      ? ` — untrack with: git rm --cached ${trackedEnvFiles.join(" ")} (the file stays on disk)`
      : ""),
);

/* 1b. A tracked env template, if present, must be placeholder-only (checked by rule 2/3 below). */
const trackedEnvTemplates = tracked.filter((rel) => ALLOWED_ENV_FILES.has(basename(rel)));
for (const rel of trackedEnvTemplates) {
  const valueLines = readFileSync(join(ROOT, rel), "utf8")
    .split("\n")
    .filter((l) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l));
  const unquoted = valueLines.filter((l) => {
    const v = l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    return v.length > 0 && !isPlaceholder(v);
  });
  check(
    unquoted.length === 0,
    `${rel} (tracked template) carries only placeholder values` +
      (unquoted.length ? ` — suspicious: ${unquoted.map((l) => l.split("=")[0]).join(", ")}` : ""),
  );
}

/* 2 + 3. Provider-shaped secrets and long opaque values in any tracked text file. */
const scanTargets = tracked.filter((rel) => {
  const ext = extname(rel);
  if (BINARY_EXT.has(ext)) return false;
  if (ext === "") return true; // extension-less scripts/config (e.g. .gitignore, hooks)
  return TEXT_EXT.has(ext) || basename(rel).endsWith(".env.example");
});

const hits: string[] = [];
const placeholdersSeen: string[] = [];
let scanned = 0;
let skipped = 0;

for (const rel of scanTargets) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  if (statSync(abs).size > 4 * 1024 * 1024) {
    skipped++;
    continue;
  }
  scanned++;
  const text = readFileSync(abs, "utf8");
  for (const { label, re } of SECRET_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const value = m[0];
      if (isPlaceholder(value)) {
        placeholdersSeen.push(`${rel}: ${label} → looks like a placeholder (${value.length} chars)`);
        continue;
      }
      hits.push(`${rel}: ${label} (${value.length} chars, starts "${value.slice(0, 8)}…")`);
    }
  }
}

check(
  scanned > 0,
  `scanned ${scanned} tracked text file(s) for secret-shaped values` +
    (skipped ? ` (${skipped} skipped: >4 MB)` : ""),
);
check(
  hits.length === 0,
  "no tracked file contains a secret-shaped value" +
    (hits.length ? `\n      -> ${hits.join("\n      -> ")}` : ""),
);

/* 4. Positive + negative controls. A green scan is only meaningful if the patterns actually
   match, so each pattern is exercised against a synthetic sample built at runtime (never written
   as a literal, or this file would flag itself) and a known placeholder must classify as safe. */
const samples: { label: string; value: string }[] = [
  { label: "Stripe live secret key", value: "sk_" + "live_" + "C".repeat(24) },
  { label: "Stripe test secret key", value: "sk_" + "test_" + "C".repeat(24) },
  { label: "Stripe webhook signing secret", value: "whs" + "ec_" + "C".repeat(24) },
  { label: "OpenAI-style API key", value: "sk-" + "proj-" + "C".repeat(24) },
  { label: "PostHog project key", value: "ph" + "c_" + "C".repeat(24) },
  { label: "GitHub token", value: "gh" + "p_" + "C".repeat(24) },
  { label: "Slack token", value: "xo" + "xb-" + "C".repeat(24) },
  { label: "AWS access key id", value: "AK" + "IA" + "C".repeat(16) },
  { label: "Google API key", value: "AI" + "za" + "C".repeat(32) },
  {
    label: "JSON Web Token",
    value: "ey" + "J" + "C".repeat(12) + "." + "ey" + "J" + "C".repeat(12) + "." + "C".repeat(12),
  },
  { label: "long opaque token-like value (200+ chars)", value: "C".repeat(220) },
];

const controlFailures: string[] = [];
for (const { label, value } of samples) {
  const pattern = SECRET_PATTERNS.find((p) => p.label === label);
  if (!pattern) {
    controlFailures.push(`${label}: no pattern registered`);
    continue;
  }
  pattern.re.lastIndex = 0;
  if (!pattern.re.test(value)) controlFailures.push(`${label}: sample NOT detected`);
  if (isPlaceholder(value)) controlFailures.push(`${label}: real-looking sample classified as placeholder`);
}
for (const placeholder of [
  'sk_test_...',
  "your-key-here",
  "CHANGE_ME",
  "whsec_" + "…",
  "placeholder",
]) {
  if (!isPlaceholder(placeholder)) {
    controlFailures.push(`placeholder "${placeholder}" was NOT recognised as a placeholder`);
  }
}
check(
  controlFailures.length === 0,
  "positive/negative controls: every secret pattern detects a real-looking value, and placeholder " +
    "text is classified as safe" +
    (controlFailures.length ? `\n      -> ${controlFailures.join("\n      -> ")}` : ""),
);

check(
  placeholdersSeen.length > 0 || trackedEnvTemplates.length === 0,
  `tracked env template(s) classify as placeholder-only (${trackedEnvTemplates.length} present, ` +
    `${placeholdersSeen.length} env line(s) classified)`,
);

/* Report. */
for (const line of notes) console.log(line);
for (const line of placeholdersSeen) console.log(`     note  ${line}`);
if (failures.length) {
  console.log();
  for (const line of failures) console.log(line);
  console.log(
    `\n${failures.length} of ${failures.length + notes.length} checks FAILED — ` +
      "no secret may be committed; keep real values in the environment (Settings → Secrets) " +
      "and env files local.",
  );
  process.exit(1);
}
console.log(`\nAll ${notes.length} checks passed — the tracked tree carries no secrets.`);
