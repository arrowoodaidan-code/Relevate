import Stripe from "stripe";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const OLD_DOMAIN = "https://site-gray-five-32.vercel.app";
const NEW_DOMAIN = "https://site-rf1azvdn5-aidan-1616.vercel.app";
const NEW_WEBHOOK_URL = `${NEW_DOMAIN}/api/webhooks/stripe`;

if (!STRIPE_KEY) { console.error("STRIPE_SECRET_KEY not set"); process.exit(1); }

const stripe = new Stripe(STRIPE_KEY);

async function main() {
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  
  // Delete old webhook
  for (const wh of existing.data) {
    if (wh.url.includes("site-gray-five-32") || wh.url.includes("site-rf1azvdn")) {
      await stripe.webhookEndpoints.del(wh.id);
      console.log(`Deleted old webhook: ${wh.id} (${wh.url})`);
    }
  }
  
  // Create new webhook
  const webhook = await stripe.webhookEndpoints.create({
    url: NEW_WEBHOOK_URL,
    enabled_events: [
      "checkout.session.completed",
      "customer.subscription.deleted",
      "customer.subscription.updated",
    ],
  });
  
  console.log(`New webhook: ${webhook.id}`);
  console.log(`URL: ${webhook.url}`);
  console.log(`Secret: ${webhook.secret}`);
  console.log(`\nUpdate env: STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
