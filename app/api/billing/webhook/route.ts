import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';

/**
 * Stripe webhook — signature verified before any DB writes.
 * Exempt from auth proxy (Stripe has no session cookies).
 */
export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[billing-webhook] STRIPE_WEBHOOK_SECRET is not configured.');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    console.warn(`[billing-webhook] Signature verification failed: ${message}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          session.metadata?.supabase_user_id ||
          session.client_reference_id ||
          null;
        const customerId =
          typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id || null;

        if (userId) {
          await supabase.from('user_financial_profiles').upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: 'active',
            },
            { onConflict: 'user_id' }
          );
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id || null;
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer?.id || null;
        const status =
          event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status;

        if (userId) {
          await supabase
            .from('user_financial_profiles')
            .update({
              stripe_subscription_id: subscription.id,
              subscription_status: status,
              stripe_customer_id: customerId,
            })
            .eq('user_id', userId);
        } else if (customerId) {
          await supabase
            .from('user_financial_profiles')
            .update({
              stripe_subscription_id: subscription.id,
              subscription_status: status,
            })
            .eq('stripe_customer_id', customerId);
        }
        break;
      }

      default:
        break;
    }
  } catch (err: unknown) {
    console.error(
      '[billing-webhook] Handler error:',
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
