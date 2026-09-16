/**
 * Creates a Stripe webhook endpoint and outputs the signing secret.
 * 
 * Run: STRIPE_SECRET_KEY=sk_live_... bun run scripts/setup-stripe-webhook.ts
 */
import Stripe from "stripe";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  console.error("STRIPE_SECRET_KEY not set");
  process.exit(1);
}

const DOMAIN = process.argv[2] || "https://site-gray-five-32.vercel.app";
const WEBHOOK_URL = `${DOMAIN}/api/webhooks/stripe`;

const stripe = new Stripe(STRIPE_KEY);

const events = [
  "checkout.session.completed",
  "customer.subscription.deleted",
  "customer.subscription.updated",
];

async function main() {
  // Check if a webhook endpoint already exists for this URL
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = existing.data.find((wh) => wh.url === WEBHOOK_URL);

  if (match) {
    console.log(`Webhook already exists: ${match.id}`);
    console.log(`URL: ${match.url}`);
    console.log(`Secret: ${match.secret}`);
    console.log(`Events: ${match.enabled_events.join(", ")}`);
    return;
  }

  const webhook = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: events,
  });

  console.log(`✅ Webhook created: ${webhook.id}`);
  console.log(`URL: ${webhook.url}`);
  console.log(`Secret: ${webhook.secret}`);
  console.log(`Events: ${webhook.enabled_events.join(", ")}`);
  console.log("");
  console.log("=== IMPORTANT ===");
  console.log(`Add to your environment: STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
