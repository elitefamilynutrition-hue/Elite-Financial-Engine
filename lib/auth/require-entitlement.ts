import type { User } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { ApiError } from '@/lib/http/api-error';
import { isSubscriptionActive } from '@/lib/billing/subscription';

export { isSubscriptionActive };

/**
 * Blocks product routes unless the user has an active or trialing Stripe
 * subscription. Throws ApiError 402 when inactive.
 */
export async function requireActiveSubscription(user: User): Promise<void> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('user_financial_profiles')
    .select('subscription_status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[entitlement] profile lookup failed:', error.message);
    throw ApiError.paymentRequired('Unable to verify subscription status.');
  }

  if (!isSubscriptionActive(data?.subscription_status)) {
    throw ApiError.paymentRequired(
      'An active Elite Capital Engine subscription is required. Start your 7-day trial ($20/mo after) to continue.'
    );
  }
}
