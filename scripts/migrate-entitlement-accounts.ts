/**
 * Migration for EXISTING accounts under entitlement enforcement.
 *
 * ⚠️ DO NOT RUN without the owner's approval — the lead explicitly asked that
 * this script be built and reported on, NOT executed (task, 2026-11-20). Run
 * it only after the owner picks a mode:
 *
 *   bun scripts/migrate-entitlement-accounts.ts            # DRY RUN (default) — read-only report
 *   bun scripts/migrate-entitlement-accounts.ts --apply --mode=keep
 *   bun scripts/migrate-entitlement-accounts.ts --apply --mode=trial-from-created
 *
 * Modes (what happens to legacy rows):
 *   keep                — rows are untouched. The code path grandfathers rows
 *                         that were never provisioned by Stripe (no
 *                         stripe_customer_id): they keep their tier's monthly
 *                         quota exactly as before enforcement. They keep
 *                         working, still unlabelled as trials.
 *   trial-from-created  — each legacy row becomes the same thing a new signup
 *                         gets today: tier 'free', a 14-day window measured
 *                         from the row's original created_at. Because every
 *                         legacy row predates today, nearly all windows end
 *                         immediately — the agent logs in, sees "Trial ended"
 *                         and the Stripe checkout prompt, and must subscribe
 *                         to generate.
 *
 * Never touched in any mode:
 *   - demo/team rows (isFullAccessTier) — demos and reels must keep working.
 *   - rows provisioned by Stripe (stripe_customer_id IS NOT NULL) — real
 *     customers live on their webhook-set subscription_status, not this script.
 *
 * Idempotent: the WHERE clause only matches rows still missing a window, so
 * running it twice is a no-op the second time.
 */
import { sql } from "../src/db";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const modeIdx = args.indexOf("--mode");
const mode = modeIdx >= 0 ? args[modeIdx + 1] : undefined;
if (apply && mode !== "keep" && mode !== "trial-from-created") {
  console.error("--apply requires --mode=keep or --mode=trial-from-created");
  process.exit(1);
}

const db = sql();

// The neon HTTP client interpolates template values as BIND PARAMETERS, never
// as SQL fragments — so the predicate is composed as a plain string and the
// queries below are built with sql.raw-style string templates.
const LEGACY = `subscription_tier IN ('starter', 'pro') AND stripe_customer_id IS NULL AND access_expires_at IS NULL`;

async function main() {
  const total = await db`SELECT COUNT(*)::int AS n FROM users`;
  const byTier = await db`SELECT subscription_tier, COUNT(*)::int AS n FROM users GROUP BY 1 ORDER BY 2 DESC`;
  const stripeRows = await db`SELECT COUNT(*)::int AS n FROM users WHERE stripe_customer_id IS NOT NULL`;
  const legacy = await db.query(
    `SELECT subscription_tier, COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '14 days')::int AS older_than_14d
       FROM users WHERE ${LEGACY} GROUP BY 1 ORDER BY 2 DESC`);

  console.log("== current state ==");
  console.log("total users:", (total[0] as { n: number }).n);
  for (const r of byTier as unknown as Array<{ subscription_tier: string; n: number }>)
    console.log(`  tier ${r.subscription_tier}: ${r.n}`);
  console.log("rows provisioned by Stripe (never touched by any mode):", (stripeRows[0] as { n: number }).n);
  console.log("== legacy rows (paid tier, no stripe customer, no window) ==");
  for (const r of legacy as unknown as Array<{ subscription_tier: string; n: number; older_than_14d: number }>)
    console.log(`  tier ${r.subscription_tier}: ${r.n} (older than 14 days: ${r.older_than_14d})`);

  if (!apply) {
    console.log("\nDRY RUN — nothing changed. Mode that would apply: NOT SET (pass --apply --mode=…)");
    if (mode === "trial-from-created" || mode === "keep") console.log(`requested mode: ${mode}`);
    console.log("  keep                → 0 rows change; legacy rows grandfathered by the code path.");
    console.log(
      "  trial-from-created  → each legacy row: tier→'free', access_starts_at=created_at,\n" +
        "                        access_expires_at=created_at + 14 days. Rows older than 14 days\n" +
        "                        (see counts above) expire immediately: login still works, but\n" +
        "                        /api/generate refuses with the Starter checkout prompt.",
    );
    return;
  }

  if (mode === "keep") {
    console.log("\nAPPLIED mode=keep — 0 rows changed; legacy rows grandfathered by the code path.");
    return;
  }

  // trial-from-created
  const result = await db.query(
    `UPDATE users
        SET subscription_tier = 'free',
            access_starts_at = created_at,
            access_expires_at = created_at + INTERVAL '14 days'
      WHERE ${LEGACY}`);
  const after = await db`SELECT subscription_tier, COUNT(*)::int AS n FROM users GROUP BY 1 ORDER BY 2 DESC`;
  console.log(`\nAPPLIED mode=trial-from-created — rows updated: ${result.length}`);
  for (const r of after as unknown as Array<{ subscription_tier: string; n: number }>)
    console.log(`  tier ${r.subscription_tier}: ${r.n}`);
  const readBack = await db`
    SELECT id, email, subscription_tier, access_starts_at, access_expires_at
      FROM users WHERE access_expires_at IS NOT NULL LIMIT 5`;
  console.log("read-back (first 5 rows with windows):");
  for (const r of readBack as unknown as Array<Record<string, unknown>>)
    console.log(" ", JSON.stringify(r));
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
