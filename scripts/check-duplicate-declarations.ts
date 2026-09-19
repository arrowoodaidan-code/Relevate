/**
 * Duplicate top-level declaration scanner for src/ — the gate for the esbuild
 * "symbol X has already been declared" / "Multiple exports with the same name"
 * failure class. That class broke main on 2026-09-17 (EHO_LEGEND and
 * REALTOR_MARK each declared twice in src/lib/advertising-rules.ts).
 *
 * Parses every .ts/.tsx file under src/ with esbuild (the same parser vite's
 * build uses) and reports ONLY duplicate-declaration diagnostics. Other syntax
 * errors are intentionally left to `bunx tsc --noEmit` (check 4 of
 * scripts/preflight.sh) so this scanner stays narrowly about duplicates.
 *
 * Exit 0 = clean, exit 1 = duplicates found.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { transformSync } from "esbuild";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vercel"]);
const DUPLICATE_PATTERN =
  /already been declared|Multiple exports with the same name|Duplicate (declaration|export)/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

let offenders = 0;
let scanned = 0;
for (const file of walk("src")) {
  scanned++;
  const code = readFileSync(file, "utf8");
  try {
    transformSync(code, { loader: file.endsWith(".tsx") ? "tsx" : "ts" });
  } catch (err) {
    const messages: string[] =
      err &&
      typeof err === "object" &&
      Array.isArray((err as { errors?: unknown[] }).errors)
        ? ((err as { errors: Array<{ text?: unknown }> }).errors).map((e) =>
            String(e?.text ?? e),
          )
        : [String((err as { message?: unknown })?.message ?? err)];
    const duplicates = messages.filter((m) => DUPLICATE_PATTERN.test(m));
    if (duplicates.length > 0) {
      offenders++;
      console.log(`DUPLICATE DECLARATION in ${file}:`);
      for (const m of duplicates) console.log(`  - ${m}`);
    }
    // Non-duplicate transform errors are not this check's concern; tsc covers them.
  }
}

if (offenders > 0) {
  console.log(
    `\n${offenders} file(s) with duplicate declarations — fix before publishing.`,
  );
  process.exit(1);
}
console.log(`no duplicate declarations across ${scanned} src modules`);
