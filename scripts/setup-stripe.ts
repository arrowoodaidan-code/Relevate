/**
 * Stripe Setup Script — Creates subscription products and prices.
 *
 * Run with: bun run scripts/setup-stripe.ts
 * Requires: STRIPE_SECRET_KEY in environment
 *
 * This creates:
 * - 1 product ("Relevate Subscription")
 * - 3 prices with lookup_keys: starter ($29/mo), pro ($79/mo), team ($199/mo)
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key || key.length === 0) {
  console.error("ERROR: STRIPE_SECRET_KEY is not set in the environment.");
  console.error("Set it first, then run: bun run scripts/setup-stripe.ts");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2025-06-16.basil" as any });

const PRICES = {
  starter: { amount: 2900, lookup_key: "starter", name: "Starter — $29/mo" },
  pro: { amount: 7900, lookup_key: "pro", name: "Pro — $79/mo" },
  team: { amount: 19900, lookup_key: "team", name: "Team — $199/mo" },
} as const;

async function main() {
  // Step 1: Check if the product already exists
  const existingProducts = await stripe.products.list({
    limit: 100,
  });

  let product = existingProducts.data.find(
    (p) => p.name === "Relevate Subscription"
  );

  if (!product) {
    product = await stripe.products.create({
      name: "Relevate Subscription",
      description:
        "AI-powered marketing assistant for real estate agents. Generate property descriptions, open house flyers, social media posts, email campaigns, and listing summaries.",
    });
    console.log(`✅ Created product: ${product.id}`);
  } else {
    console.log(`📦 Using existing product: ${product.id}`);
  }

  // Step 2: Create or update prices for each tier
  for (const [tier, config] of Object.entries(PRICES)) {
    // Check if a price with this lookup_key already exists
    const existingPrices = await stripe.prices.list({
      lookup_keys: [config.lookup_key],
      limit: 1,
      active: true,
    });

    if (existingPrices.data.length > 0) {
      console.log(
        `📦 Price "${tier}" exists: ${existingPrices.data[0].id} ($${(existingPrices.data[0].unit_amount! / 100).toFixed(2)}/${existingPrices.data[0].recurring?.interval})`,
      );
    } else {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: config.amount,
        currency: "usd",
        recurring: { interval: "month" },
        lookup_key: config.lookup_key,
        nickname: config.name,
      });
      console.log(
        `✅ Created price "${tier}": ${price.id} — $${config.amount / 100}/mo (lookup_key: ${config.lookup_key})`,
      );
    }
  }

  console.log("\n🎉 Stripe setup complete!");
  console.log("The checkout endpoint at /api/create-checkout-session is now ready.");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
