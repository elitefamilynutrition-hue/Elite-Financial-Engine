import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { toErrorResponse, ApiError } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { getAppUrl, getStripe } from '@/lib/stripe';

/**
 * Creates a Stripe Customer Portal session for the signed-in user.
 * Enable the portal in Stripe Dashboard → Settings → Billing → Customer portal.
 */
export async function POST() {
  try {
    const user = await requireUser();
    const stripe = getStripe();
    const appUrl = getAppUrl();
    const supabase = getServiceSupabase();

    const { data: profile, error: profileError } = await supabase
      .from('user_financial_profiles')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const customerId = profile?.stripe_customer_id;
    if (!customerId) {
      throw ApiError.badRequest(
        'No Stripe customer on file. Start a trial from the paywall first.'
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/`,
    });

    if (!session.url) {
      throw ApiError.badRequest('Stripe did not return a portal URL.');
    }

    return NextResponse.json({ status: 'SUCCESS', url: session.url });
  } catch (error) {
    return toErrorResponse(error, 'billing-portal');
  }
}
