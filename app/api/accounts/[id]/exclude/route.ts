import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { toErrorResponse, ApiError } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';

/**
 * Week 4 Day 1: toggle exclude_from_net_worth on a linked financial account.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    await requireActiveSubscription(user);
    const { id } = await context.params;
    if (!id) throw ApiError.badRequest('Account id required.');

    const body = await request.json();
    if (typeof body.exclude_from_net_worth !== 'boolean') {
      throw ApiError.badRequest('exclude_from_net_worth boolean required.');
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('financial_accounts')
      .update({
        exclude_from_net_worth: body.exclude_from_net_worth,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, exclude_from_net_worth, account_name, custom_name')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw ApiError.notFound('Account not found.');

    return NextResponse.json({ status: 'SUCCESS', account: data });
  } catch (error) {
    return toErrorResponse(error, 'account-exclude');
  }
}
