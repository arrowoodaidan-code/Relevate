/**
 * Regression gate: deleting a saved property from /app must actually work.
 *
 * History (live, 2026-10-02): "delete" on a saved property answered
 * `DELETE /api/properties/<id>` -> HTTP 500 with `{"success":false,"error":"Failed to delete property"}`
 * and left the listing in place. The server log line for that request was:
 *
 *   API /api/properties delete error: NeonDbError: update or delete on table "properties"
 *   violates foreign key constraint "generated_content_property_id_fkey" on table
 *   "generated_content"  [code 23503]
 *   detail: Key (id)=<property id> is still referenced from table "generated_content".
 *
 * deleteProperty() removed the `properties` row before its `generated_content` children, and
 * generated_content.property_id has no ON DELETE CASCADE, so Postgres refused the parent delete.
 *
 * This check exercises the exact function the route calls (src/lib/properties.deleteProperty),
 * against the same database the app uses, and fails BY NAME when the route would answer non-2xx:
 *
 *   FAIL(delete-property): DELETE /api/properties/<id> would answer HTTP 500 — ...
 *   FAIL(delete-property): DELETE /api/properties/<id> would answer HTTP 404 — ...
 *
 * It builds its fixture through real product code (auth.signup + properties.upsertPropertyWithContent),
 * so it is not a second, hand-written copy of the write path, and it removes every row it created —
 * including on failure. It never touches a property it did not create.
 *
 * Usage:
 *   bun scripts/check-delete-property.ts
 *
 * Required env: DATABASE_URL (the same database the app uses).
 */
const CHECK = "delete-property";
const OWNER_EMAIL = "delete-path-check@relevate-internal.test";
const OTHER_EMAIL = "delete-path-check-other@relevate-internal.test";
const PASSWORD = "check-fixture-only";

const failures: string[] = [];
function fail(message: string): void {
  failures.push(message);
  console.log(`FAIL(${CHECK}): ${message}`);
}

if (!process.env.DATABASE_URL) {
  // A gate that silently skips is how a bug ships. This one needs the app's database.
  fail(
    "DATABASE_URL is not configured, so the delete path cannot be exercised at all. " +
      "Run this check where the app's environment is available.",
  );
  console.log(`\n${CHECK} gate FAILED (${failures.length}):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

// Imported after the env check so a missing DATABASE_URL reports as a gate failure with a
// readable reason instead of a module-initialisation stack trace.
const { sql } = await import("../src/lib/db");
const { signup } = await import("../src/lib/auth");
const { deleteProperty, upsertPropertyWithContent } = await import("../src/lib/properties");

/** Remove every row this check could have created, for both fixture accounts. */
async function purgeFixtureRows(): Promise<void> {
  for (const email of [OWNER_EMAIL, OTHER_EMAIL]) {
    await sql`
      DELETE FROM generated_content WHERE property_id IN (
        SELECT p.id FROM properties p JOIN users u ON u.id = p.user_id WHERE u.email = ${email}
      )
    `;
    await sql`DELETE FROM properties WHERE user_id IN (SELECT id FROM users WHERE email = ${email})`;
    await sql`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ${email})`;
    await sql`DELETE FROM users WHERE email = ${email}`;
  }
}

async function main(): Promise<void> {
  console.log(`--- ${CHECK}: deleting a saved property must not 5xx ---`);

  await purgeFixtureRows();

  // Fixture through the real write path: the same calls POST /api/properties makes.
  const owner = await signup(OWNER_EMAIL, "Delete Path Check", PASSWORD);
  const ownerId = owner.user.id;

  const propertyId = await upsertPropertyWithContent(
    ownerId,
    "1 Delete Path Check Lane, Columbia, SC 29201",
    null,
    "summary",
    "Fixture content written by scripts/check-delete-property.ts.",
  );
  if (!propertyId) {
    fail("could not create the fixture property (upsertPropertyWithContent returned null)");
    return;
  }

  // The delete the DELETE /api/properties/<id> route performs.
  let threw: unknown = null;
  let deleted = false;
  try {
    deleted = await deleteProperty(ownerId, propertyId);
  } catch (error) {
    threw = error;
  }

  if (threw) {
    const e = threw as { code?: string; message?: string };
    fail(
      `DELETE /api/properties/<id> would answer HTTP 500 — deleteProperty() threw` +
        (e?.code ? ` [${e.code}]` : "") +
        `: ${e?.message ?? String(threw)}`,
    );
  } else if (!deleted) {
    fail(
      "DELETE /api/properties/<id> would answer HTTP 404 — deleteProperty() returned false " +
        "for a saved property the user owns",
    );
  }

  const propLeft = await sql`SELECT id FROM properties WHERE id = ${propertyId}`;
  const contentLeft = await sql`SELECT id FROM generated_content WHERE property_id = ${propertyId}`;
  if (propLeft.length > 0) fail("the property row survived its own delete");
  if (contentLeft.length > 0) fail("generated content rows survived the property delete");

  // Ownership must be established before anything is removed: a stranger's request must change nothing.
  const keep = await upsertPropertyWithContent(
    ownerId,
    "2 Delete Path Check Lane, Columbia, SC 29201",
    null,
    "summary",
    "Fixture content that must survive a stranger's delete attempt.",
  );
  if (!keep) {
    fail("could not create the second fixture property");
  } else {
    const stranger = await signup(OTHER_EMAIL, "Delete Path Check Other", PASSWORD);
    const strangerVerdict = await deleteProperty(stranger.user.id, keep);
    if (strangerVerdict !== false) {
      fail("deleteProperty() reported success for a property owned by a different user");
    }
    const keptRows = await sql`SELECT id FROM properties WHERE id = ${keep}`;
    const keptContent = await sql`SELECT id FROM generated_content WHERE property_id = ${keep}`;
    if (keptRows.length === 0) fail("a different user's delete removed the owner's property row");
    if (keptContent.length === 0) {
      fail("a different user's delete removed the owner's generated content");
    }
    console.log(`stranger delete verdict: ${String(strangerVerdict)} (expected false -> route answers 404)`);
  }

  console.log(`fixture property: ${propertyId}`);
  console.log(`owner delete verdict: ${deleted ? "true (route answers 200)" : "false"}`);
}

try {
  await main();
} finally {
  try {
    await purgeFixtureRows();
    console.log(`fixture accounts removed (${OWNER_EMAIL}, ${OTHER_EMAIL})`);
  } catch (error) {
    fail(`could not remove the fixture rows: ${String(error)}`);
  }
}

if (failures.length > 0) {
  console.log(`\n${CHECK} gate FAILED (${failures.length}):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`\n${CHECK} gate OK — DELETE of a saved property succeeds and stays owner-scoped.`);
process.exit(0);
