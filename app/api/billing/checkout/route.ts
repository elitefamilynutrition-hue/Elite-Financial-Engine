import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { toErrorResponse, ApiError } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { getAppUrl, getStripe, getStripePriceId } from '@/lib/stripe';

/**
 * Creates a Stripe Checkout Session for the signed-in user.
 * Tenant is always the session user — never accept userId from the client body.
 */
export async function POST() {
  try {
    const user = await requireUser();
    const stripe = getStripe();
    const priceId = getStripePriceId();
    const appUrl = getAppUrl();
    const supabase = getServiceSupabase();

    const { data: profile, error: profileError } = await supabase
      .from('user_financial_profiles')
      .select('stripe_customer_id, subscription_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    let customerId = profile?.stripe_customer_id || null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      const { error: upsertError } = await supabase.from('user_financial_profiles').upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          subscription_status: profile?.subscription_status || 'inactive',
        },
        { onConflict: 'user_id' }
      );
      if (upsertError) throw upsertError;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?billing=success`,
      cancel_url: `${appUrl}/?billing=cancel`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 7,
        metadata: { supabase_user_id: user.id },
      },
    });

    if (!session.url) {
      throw ApiError.badRequest('Stripe did not return a checkout URL.');
    }

    return NextResponse.json({ status: 'SUCCESS', url: session.url });
  } catch (error) {
    return toErrorResponse(error, 'billing-checkout');
  }
}
