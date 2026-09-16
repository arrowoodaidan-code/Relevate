/**
 * Creates/updates Stripe subscription products/prices with lookup_key metadata
 * for the Relevate checkout flow.
 *
 * Run: STRIPE_SECRET_KEY=sk_live_... bun run scripts/setup-stripe-subscriptions.ts
 *
 * IDEMPOTENT + SELF-CORRECTING: delegates to src/lib/stripe-prices.ts (shared with
 * the temporary prod setup route so the two can never drift).
 */
import Stripe from "stripe";
import { setupStripePrices, tiers, annualTiers } from "../src/lib/stripe-prices";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  console.error("STRIPE_SECRET_KEY not set");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_KEY);

async function main() {
  const result = await setupStripePrices(stripe);

  console.log("=== Monthly prices ===");
  for (const r of result.monthly) {
    const tier = tiers.find((t) => t.lookup_key === r.lookup_key);
    if (r.created) {
      console.log(`✅ ${r.lookup_key}: created ${r.priceId} at $${(r.amountCents / 100).toFixed(2)}/mo`);
    } else {
      console.log(`✅ ${r.lookup_key}: price already correct (${r.priceId}) at $${(r.amountCents / 100).toFixed(2)}/mo`);
    }
    if (tier && r.archived.length > 0) {
      for (const a of r.archived) {
        console.log(`  ⚠ ${r.lookup_key}: archived stale price ${a} (was $${(tier.amountCents / 100).toFixed(2)})`);
      }
    }
  }

  console.log("\n=== Annual prices (7% off) ===");
  for (const r of result.annual) {
    const tier = annualTiers.find((t) => t.lookup_key === r.lookup_key);
    if (r.created) {
      console.log(`✅ ${r.lookup_key}: created ${r.priceId} at $${(r.amountCents / 100).toFixed(2)}/yr`);
    } else {
      console.log(`✅ ${r.lookup_key}: price already correct (${r.priceId}) at $${(r.amountCents / 100).toFixed(2)}/yr`);
    }
    if (tier && r.archived.length > 0) {
      for (const a of r.archived) {
        console.log(`  ⚠ ${r.lookup_key}: archived stale price ${a} (was $${(tier.amountCents / 100).toFixed(2)})`);
      }
    }
  }

  console.log("\n--- Prices (active + archived) ---");
  for (const p of result.prices) {
    const perStr =
      p.interval === "year"
        ? `$${((p.amount || 0) / 100).toFixed(2)}/yr`
        : `$${((p.amount || 0) / 100).toFixed(2)}/mo`;
    console.log(`  ${p.lookup_key}: ${p.id} — ${perStr} (${p.interval}) [${p.active ? "ACTIVE" : "archived"}]`);
  }

  if (result.archivedAll.length > 0) {
    console.log("\n⚠ Archived (replaced) prices:", result.archivedAll.join(", "));
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
