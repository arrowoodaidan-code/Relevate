import Stripe from "stripe";
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_URL = "https://site-pduuf9ouc-aidan-1616.vercel.app/api/webhooks/stripe";
if (!STRIPE_KEY) { console.error("STRIPE_SECRET_KEY not set"); process.exit(1); }
const stripe = new Stripe(STRIPE_KEY);
async function main() {
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  for (const wh of existing.data) {
    await stripe.webhookEndpoints.del(wh.id);
    console.log(`Deleted: ${wh.id}`);
  }
  const webhook = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: ["checkout.session.completed","customer.subscription.deleted","customer.subscription.updated"],
  });
  console.log(`New: ${webhook.id}\nSecret: ${webhook.secret}`);
}
main().catch((err) => { console.error(err.message); process.exit(1); });
