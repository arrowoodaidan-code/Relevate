/**
 * Guard test for the demo-lead capture funnel (signup/activation pipeline).
 *
 * Verifies:
 *  1. validateDemoLead rejects invalid payloads (missing name, bad email,
 *     overlong fields).
 *  2. validateDemoLead accepts a valid payload and strips optional fields.
 *  3. captureDemoLead persists a lead to Neon (idempotent table creation),
 *     is idempotent on the table DDL, and returns the stored row.
 *  4. The stored lead is queryable / has the expected shape.
 *
 * Calls captureDemoLead directly (NOT the /api/leads endpoint), so no team
 * notification email is triggered. A test-marker row is inserted and removed
 * afterwards.
 *
 * Run: bun scripts/test-leads-funnel.ts
 * Requires DATABASE_URL in the environment.
 */
import { captureDemoLead, validateDemoLead } from "../src/lib/leads";
import { sql } from "../src/lib/db";

let failures = 0;
const ok = (msg: string) => console.log(`  [PASS] ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.error(`  [FAIL] ${msg}`);
};

console.log("test-leads-funnel: validate + capture round-trip");

// --- 1. validation negatives ---
const negs: Array<[unknown, string]> = [
  [null, "null body"],
  [{ name: "", email: "a@b.com" }, "empty name"],
  [{ email: "a@b.com" }, "missing name"],
  [{ name: "Jane", email: "not-an-email" }, "bad email"],
  [{ name: "x".repeat(121), email: "a@b.com" }, "name too long"],
  [{ name: "Jane", email: "a@b", brokerage: "x".repeat(201) }, "brokerage too long"],
];
let negPass = true;
for (const [input, label] of negs) {
  const r = validateDemoLead(input);
  if (r.ok) {
    negPass = false;
    fail(`validation should reject: ${label}`);
  }
}
if (negPass) ok(`rejected ${negs.length} invalid payloads`);

// --- 2. validation accept ---
const validInput = validateDemoLead({
  name: "  Demo Tester  ",
  email: "demo.tester@example.com",
  brokerage: "  Acme Realty  ",
  source: "landing-hero",
});
if (validInput.ok && validInput.data.name === "Demo Tester" && validInput.data.email === "demo.tester@example.com") {
  ok("validation accepts & trims valid payload");
} else {
  fail("validation should accept valid payload");
}

// --- 3. capture round-trip (live Neon) ---
const TEST_EMAIL = `test-lead-${Date.now()}@example.com`;
try {
  const lead = await captureDemoLead({
    name: "Demo Tester",
    email: TEST_EMAIL,
    brokerage: "Acme Realty",
    source: "guard-test",
  });
  if (!lead) {
    fail("captureDemoLead returned null (DB write failed)");
  } else {
    // confirm shape
    let shapeOk =
      typeof lead.id === "string" &&
      lead.id.length > 0 &&
      lead.name === "Demo Tester" &&
      lead.email === TEST_EMAIL &&
      lead.brokerage === "Acme Realty" &&
      lead.source === "guard-test" &&
      typeof lead.created_at === "string";
    if (shapeOk) ok("captureDemoLead stored lead with expected shape");
    else fail("captured lead shape mismatch: " + JSON.stringify(lead));

    // confirm idempotent re-capture of a second lead (table already exists)
    const lead2 = await captureDemoLead({
      name: "Demo Tester 2",
      email: TEST_EMAIL.replace("test-lead", "test-lead2"),
      source: "guard-test",
    });
    if (lead2 && lead2.id !== lead.id && lead2.brokerage === null) {
      ok("idempotent table create + optional brokerage omitted -> null");
    } else {
      fail("second capture should create a distinct row");
    }

    // --- 4. cleanup test rows ---
    const del = await sql`DELETE FROM leads WHERE email IN (${TEST_EMAIL}, ${TEST_EMAIL.replace("test-lead", "test-lead2")}) RETURNING id`;
    if (Array.isArray(del) && del.length >= 1) ok(`cleaned up ${del.length} test lead row(s)`);
    else fail("cleanup delete returned no rows");
  }
} catch (e) {
  fail("capture threw: " + (e as Error).message);
}

console.log(failures === 0 ? "RESULT: PASS ✅" : `RESULT: FAIL (${failures} check(s) failed)`);
process.exit(failures === 0 ? 0 : 1);
