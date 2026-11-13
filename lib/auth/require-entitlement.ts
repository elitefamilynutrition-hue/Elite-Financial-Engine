import type { User } from '@supabase/supabase-js';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { ApiError } from '@/lib/http/api-error';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export function isSubscriptionActive(status: string | null | undefined): boolean {
  return ACTIVE_STATUSES.has((status || '').toLowerCase());
}

/**
 * Blocks Gemini-heavy routes unless the user's profile has an active/trialing
 * Stripe subscription. Throws ApiError 402 when inactive.
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
      'An active BudgetDog subscription is required for AI features. Use Upgrade to subscribe.'
    );
  }
}
