/**
 * editor-alignment-guard.ts  —  PERMANENT deterministic regression guard.
 *
 * Owner escalation (task 2b24da95): the owner reported "still not coming out
 * right" across FOUR previews; this is the automatic prevention so they never
 * have to report this class of bug again. It asserts the inline-editor
 * invariant "canvas container width == reference image display width (overlay
 * basis)" at the pure/logic layer, deterministically (no vision, no network),
 * and FAILS LOUDLY with a non-zero exit — exactly like the vision gate.
 *
 * RUN (from /home/team/shared/site):
 *   bun scripts/editor-alignment-guard.ts
 *
 * It runs the positive invariant, the no-drift invariant, and three NEGATIVE
 * tests that deliberately introduce size drift / source-of-truth violations
 * and assert the guard reports FAIL for each. If any check (especially a
 * negative) fails, the guard exits non-zero: the guard itself would be broken
 * and must not be trusted.
 *
 * The same pure functions drive the live in-DOM measurements on /qa-editor
 * (QA-6 reference alignment + QA-7 no-drift), so both the browser surface and
 * this CLI use one shared, deterministic source of truth.
 */
import {
  runEditorAlignmentSelfTest,
  formatAlignment,
} from "../src/lib/editor-alignment-check";

const results = runEditorAlignmentSelfTest();

console.log("=== editor-alignment guard (deterministic, task 2b24da95) ===");
let failCount = 0;
for (const [i, r] of results.entries()) {
  console.log(`  [${i + 1}/${results.length}] ${formatAlignment(r)}`);
  if (!r.pass) failCount++;
}

// Each negative test's `pass` is TRUE when the guard correctly caught the
// deliberately-introduced drift (i.e. `pass` == "the negative test succeeded at
// demonstrating the guard catches drift"). So every negative MUST have pass:true;
// if any has pass:false, the guard failed to catch a real drift and is broken.
// Order of tests: 0-1 positive alignment + positive reference==canvas, 2 positive
// no-drift, 3 positive text-centered, then 4+ are the negatives (text top-aligned,
// width drift, reference!=canvas, source-of-truth, no-drift).
const negatives = results.slice(4);
const caught = negatives.filter((r) => r.pass).length;
if (caught !== negatives.length) {
  console.error(
    `\nGUARD FAILURE: ${negatives.length - caught} of ${negatives.length} negative test(s) reported pass:false — ` +
      `the guard ran but did NOT flag a real drift; it cannot be trusted.`,
  );
} else {
  console.log(
    `\n  Guard caught all ${negatives.length} deliberately-introduced size drifts (negative proof OK).`,
  );
}

console.log(`\nRESULT: ${failCount === 0 ? "PASS ✅" : "FAIL ❌"} (${failCount} check(s) failed)`);
process.exit(failCount === 0 ? 0 : 1);
