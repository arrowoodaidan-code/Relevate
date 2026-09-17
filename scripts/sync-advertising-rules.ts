/**
 * Re-generate the VERBATIM data block inside src/lib/advertising-rules.ts from the
 * compliance researcher's findings file.
 *
 *   bun scripts/sync-advertising-rules.ts
 *   bun scripts/sync-advertising-rules.ts <path-to-json> <path-to-module>
 *
 * Why this exists: the module must stay byte-identical to the research file (that is
 * what scripts/check-advertising-rules.ts enforces), and hand-copying 24 rules is how
 * the module went stale — it still carried the retracted `tx-535-153-candidate` after
 * Texas was promoted to 22 TAC 535.155. This script makes the copy machine-produced:
 * key order, escaping and values all come from the JSON.
 *
 * It replaces ONLY the region from `export const ADVERTISING_RULES_META` through the
 * closing `];` of `ADVERTISING_RULES`; every type, doc comment and derived-copy map
 * below it is left untouched. It asserts the anchors and the per-rule key set before
 * writing, so a shape change fails loudly instead of producing a corrupt module.
 */
import { readFileSync, writeFileSync } from "node:fs";

const JSON_PATH = process.argv[2] ?? "/home/team/shared/compliance/advertising-rules.json";
const MODULE = process.argv[3] ?? "src/lib/advertising-rules.ts";

const data = JSON.parse(readFileSync(JSON_PATH, "utf8")) as {
  meta: Record<string, string>;
  rules: Record<string, unknown>[];
};

/** The rule key order in the research file — JSON.stringify equality depends on it. */
const KEY_ORDER = [
  "id",
  "jurisdiction",
  "surface",
  "type",
  "requirement",
  "why",
  "satisfied_by",
  "severity",
  "source_url",
  "accessed",
  "notes",
  "confidence",
];

function valueLines(key: string, value: unknown, indent: string): string[] {
  if (Array.isArray(value)) {
    const inline = `${indent}${key}: [${value.map((v) => JSON.stringify(v)).join(", ")}],`;
    if (inline.length <= 110) return [inline];
    return [`${indent}${key}: [`, ...value.map((v) => `${indent}  ${JSON.stringify(v)},`), `${indent}],`];
  }
  if (typeof value === "string") {
    const inline = `${indent}${key}: ${JSON.stringify(value)},`;
    if (inline.length <= 110) return [inline];
    return [`${indent}${key}:`, `${indent}  ${JSON.stringify(value)},`];
  }
  return [`${indent}${key}: ${JSON.stringify(value)},`];
}

const out: string[] = [];

out.push("export const ADVERTISING_RULES_META: AdvertisingRulesMeta = {");
for (const k of Object.keys(data.meta)) out.push(...valueLines(k, data.meta[k], "  "));
out.push("};");
out.push("");
out.push("export const ADVERTISING_RULES: AdvertisingRule[] = [");
for (const rule of data.rules) {
  const keys = Object.keys(rule);
  // `notes` is optional in the AdvertisingRule interface (2 of the 24 rules omit it).
  const missing = KEY_ORDER.filter((k) => k !== "notes" && !keys.includes(k));
  const extra = keys.filter((k) => !KEY_ORDER.includes(k));
  if (missing.length || extra.length) {
    throw new Error(
      `rule ${rule.id} has an unexpected key set (missing: ${missing.join(",")} | extra: ${extra.join(",")}) — update KEY_ORDER and the AdvertisingRule interface together`,
    );
  }
  out.push("  {");
  for (const k of KEY_ORDER) {
    if (!(k in rule)) continue;
    out.push(...valueLines(k, rule[k], "    "));
  }
  out.push("  },");
}
out.push("];");

const lines = readFileSync(MODULE, "utf8").split("\n");
const start = lines.findIndex((l) => l.startsWith("export const ADVERTISING_RULES_META"));
if (start < 0) throw new Error("could not find the ADVERTISING_RULES_META anchor");
const end = lines.findIndex((l, i) => i > start && l === "];");
if (end < 0) throw new Error("could not find the closing ]; of the rules array");

writeFileSync(MODULE, [...lines.slice(0, start), ...out, ...lines.slice(end + 1)].join("\n"));
console.log(
  `replaced ${MODULE} lines ${start + 1}..${end + 1} with ${out.length} lines — ${data.rules.length} rules, meta v${data.meta.version}`,
);
