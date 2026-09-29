import Stripe from 'stripe';
import { stripe } from '@/utils/stripe/config';
import {
  upsertProductRecord,
  upsertPriceRecord,
  manageSubscriptionStatusChange,
  deleteProductRecord,
  deletePriceRecord
} from '@/utils/supabase/admin';
import { pilotDb, sendAlert } from '@/lib/noraya/pilot';

async function recordNorayaDayPass(session: Stripe.Checkout.Session) {
  if (session.payment_status !== 'paid') return;
  const md = session.metadata || {};
  const amountEur = (session.amount_total ?? 0) / 100;
  const { error } = await pilotDb().from('noraya_day_passes').insert({
    scope: md.scope,
    day: md.day,
    user_id: md.user_id || null,
    amount_eur: amountEur,
    source: 'stripe',
    stripe_session_id: session.id
  });
  // 23505 = το ίδιο webhook ήρθε δεύτερη φορά· έχει ήδη καταγραφεί.
  if (error && String(error.code) !== '23505') throw new Error(error.message);
  if (!error) {
    await sendAlert(
      `daypass-paid:${session.id}`,
      `Noraya: πληρωμή ξεκλειδώματος +€${amountEur}`,
      `<p>Ο λογαριασμός <b>${md.scope}</b> πλήρωσε €${amountEur} για πλήρες ξεκλείδωμα στις ${md.day}.</p>
       <p>Αν χρειάζεται, φόρτωσε υπόλοιπο στο Anthropic. Έσοδα/κόστος: σελίδα /admin/pilot.</p>`
    );
  }
}

const relevantEvents = new Set([
  'product.created',
  'product.updated',
  'product.deleted',
  'price.created',
  'price.updated',
  'price.deleted',
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
]);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event: Stripe.Event;

  try {
    if (!sig || !webhookSecret)
      return new Response('Webhook secret not found.', { status: 400 });
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    console.log(`🔔  Webhook received: ${event.type}`);
  } catch (err: any) {
    console.log(`❌ Error message: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (relevantEvents.has(event.type)) {
    try {
      switch (event.type) {
        case 'product.created':
        case 'product.updated':
          await upsertProductRecord(event.data.object as Stripe.Product);
          break;
        case 'price.created':
        case 'price.updated':
          await upsertPriceRecord(event.data.object as Stripe.Price);
          break;
        case 'price.deleted':
          await deletePriceRecord(event.data.object as Stripe.Price);
          break;
        case 'product.deleted':
          await deleteProductRecord(event.data.object as Stripe.Product);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          const subscription = event.data.object as Stripe.Subscription;
          await manageSubscriptionStatusChange(
            subscription.id,
            subscription.customer as string,
            event.type === 'customer.subscription.created'
          );
          break;
        case 'checkout.session.completed':
          const checkoutSession = event.data.object as Stripe.Checkout.Session;
          if (checkoutSession.mode === 'subscription') {
            const subscriptionId = checkoutSession.subscription;
            await manageSubscriptionStatusChange(
              subscriptionId as string,
              checkoutSession.customer as string,
              true
            );
          } else if (
            checkoutSession.mode === 'payment' &&
            checkoutSession.metadata?.kind === 'noraya_day_pass'
          ) {
            // Noraya: πληρωμή «Πλήρες ξεκλείδωμα ημέρας».
            await recordNorayaDayPass(checkoutSession);
          }
          break;
        default:
          throw new Error('Unhandled relevant event!');
      }
    } catch (error) {
      console.log(error);
      return new Response(
        'Webhook handler failed. View your Next.js function logs.',
        {
          status: 400
        }
      );
    }
  } else {
    return new Response(`Unsupported event type: ${event.type}`, {
      status: 400
    });
  }
  return new Response(JSON.stringify({ received: true }));
}
