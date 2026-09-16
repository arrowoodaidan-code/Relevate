// Cleanup script: delete a QA/test user and all FK-dependent rows.
// Usage: bun scripts/delete-qa-user.ts <email>
//
// Accepts test-account emails commonly created during live verification:
// qa-* foo@ctomail.io (UI runs), uitesagent.*@gmail.com (live UI test agent),
// sig-* / sigw-* (signup stall repro), etc. For safety this deliberately only
// deletes users whose email clearly indicates a throwaway test account — use
// exact email or a prefix you can name, NEVER a real customer.
import { sql } from "../src/db";
const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Usage: bun scripts/delete-qa-user.ts <email>");
  process.exit(1);
}
// Only allow clearly-throwaway prefixes to guard against nuking a real user.
if (!/^(qa-|uitesagent\.|sig-|sigw-|qab-|qbz-|qbr-)/i.test(email)) {
  console.error(
    "Refusing: email does not look like a test account (qa-*, uitesagent.*, sig-*, qab-*, etc.).",
  );
  process.exit(1);
}
const db = sql();
async function run() {
  const users = await db`SELECT id, email FROM users WHERE email = ${email}`;
  if (users.length === 0) {
    console.log("NO_USER:", email);
    return;
  }
  const userId = users[0].id;
  console.log("found user:", userId, users[0].email);
  // generated_content hangs off properties (no user_id column of its own)
  const gen = await db`DELETE FROM generated_content WHERE property_id IN (SELECT id FROM properties WHERE user_id = ${userId})`;
  const p = await db`DELETE FROM properties WHERE user_id = ${userId}`;
  const s = await db`DELETE FROM sessions WHERE user_id = ${userId}`;
  const dt = await db`DELETE FROM design_templates WHERE user_id = ${userId}`;
  const t = await db`DELETE FROM templates WHERE user_id = ${userId}`;
  const u = await db`DELETE FROM users WHERE id = ${userId}`;
  console.log(
    `deleted: gen_content=${gen.length} properties=${p.length} sessions=${s.length} design_templates=${dt.length} templates=${t.length} user=${u.length}`,
  );
  const left = await db`SELECT id FROM users WHERE id = ${userId}`;
  console.log(left.length === 0 ? "USER_REMOVED" : "USER_STILL_PRESENT");
  console.log("CLEANUP_DONE");
}
run().catch((e) => {
  console.error("CLEANUP_FAIL:", e);
  process.exit(1);
});
