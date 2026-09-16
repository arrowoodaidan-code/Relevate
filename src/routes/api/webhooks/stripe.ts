/**
 * Stripe Webhook endpoint — HTTP handler (not createServerFn).
 * Receives raw body for signature verification.
 *
 * POST /api/webhooks/stripe
 */
import Stripe from "stripe";
import { sql as neonSql } from "../../../db";
import { PRICE_KEY_TO_TIER } from "../../../lib/price-keys";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

export async function POST(request: Request): Promise<Response> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response("STRIPE_WEBHOOK_SECRET not configured", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    return new Response(`Webhook signature verification failed: ${err.message}`, {
      status: 400,
    });
  }

  const db = neonSql();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;
      const priceLookupKey = session.metadata?.price_lookup_key;

      if (!userId) {
        console.warn("checkout.session.completed without user_id metadata");
        break;
      }

      const tier = PRICE_KEY_TO_TIER[priceLookupKey || ""] || "starter";

      await db`
        UPDATE users
        SET stripe_customer_id = ${customerId || null},
            subscription_status = 'active',
            subscription_tier = ${tier}
        WHERE id = ${userId}
      `;

      console.log(
        `Provisioned: user=${userId}, tier=${tier}, customer=${customerId}`,
      );
      break;
    }

    case "customer.subscription.deleted":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id;

      if (!customerId) break;

      const status =
        subscription.status === "active" ? "active" : "inactive";

      await db`
        UPDATE users
        SET subscription_status = ${status}
        WHERE stripe_customer_id = ${customerId}
      `;
      console.log(`Subscription update: customer=${customerId}, status=${status}`);
      break;
    }

    default:
      console.log(`Unhandled event: ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
