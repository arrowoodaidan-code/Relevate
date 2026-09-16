/**
 * Guard for the rendered-image suggestion box (task b7c34a42).
 * Exercises the pure suggestion→style resolver end-to-end (the same function the
 * /api/resolve-render-suggestion endpoints in serve.ts and vercel-entry.ts call).
 *
 * Verifies:
 *  1. Supported style suggestions map to a brandStyle the renderer consumes.
 *  2. Unsupported categories (text size, layout, background, photo regen) return
 *     an HONEST ok:false reason — never a fake applied change.
 *  3. `changed` is false when the suggestion matches the current style.
 *  4. Every resolved brandStyle is in the supported set (aligned with accentFor).
 */
import { resolveRenderSuggestion, SUPPORTED_STYLES } from "../src/lib/render-suggestions";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (!cond) {
    failures++;
    console.error(`  FAIL: ${name}${detail ? " — " + detail : ""}`);
  } else {
    console.log(`  ok:   ${name}`);
  }
}

const acceptedStyles: string[] = SUPPORTED_STYLES.map((s) => s.brandStyle.toLowerCase());

console.log("1) Supported style suggestions → real brandStyle");
const supported: Array<[string, string]> = [
  ["coastal blue theme", "coastal"],
  ["make it a navy blue ocean vibe", "coastal"],
  ["use rose pink accents", "rose"],
  ["modern silver minimal", "modern"],
  ["gold luxury elegant", "gold"],
  ["warm classic premium", "gold"],
];
for (const [sugg, expect] of supported) {
  const r = resolveRenderSuggestion({ suggestion: sugg });
  check(`"${sugg}" → ok`, r.ok === true);
  if (r.ok) {
    check(`"${sugg}" brandStyle contains ${expect}`, r.brandStyle.toLowerCase().includes(expect), r.brandStyle);
    check(`"${sugg}" in supported set`, acceptedStyles.some((s) => r.brandStyle.toLowerCase().includes(s.split(" ")[0])), r.brandStyle);
  }
}

console.log("2) Unsupported suggestions → honest ok:false (never faked)");
const unsupported = [
  "make the text bigger",
  "make text smaller",
  "rearrange the layout",
  "use a lighter background",
  "regenerate a new photo",
];
for (const sugg of unsupported) {
  const r = resolveRenderSuggestion({ suggestion: sugg });
  check(`"${sugg}" → ok:false + reason`, r.ok === false && (r.ok === false ? !!r.reason : false));
  check(`"${sugg}" reason is truthful`, r.ok === false && /(n't|not|separate|isn't)/i.test(r.reason));
}

console.log("3) changed flag reflects current style");
{
  const r = resolveRenderSuggestion({ suggestion: "coastal blue", currentStyle: "navy coastal" });
  check("same style → changed:false", r.ok === true && r.changed === false);
}
{
  const r = resolveRenderSuggestion({ suggestion: "coastal blue", currentStyle: "gold luxury" });
  check("different style → changed:true", r.ok === true && r.changed === true);
}

console.log("4) empty input → honest error");
check("empty suggestion handled", resolveRenderSuggestion({ suggestion: "" }).ok === false);

console.log(`\n${failures === 0 ? "ALL CHECKS PASS" : failures + " CHECK(S) FAILED"}`);
if (failures > 0) process.exit(1);
