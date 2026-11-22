import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { toErrorResponse } from '@/lib/http/api-error';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await requireActiveSubscription(user);

    const body = await request.json();
    const { account_name, institution_name, current_balance, interest_rate, minimum_payment } = body;

    if (!account_name || !current_balance) {
      return NextResponse.json({ error: 'Account name and current balance are required.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('manual_accounts')
      .insert({
        user_id: user.id,
        account_name,
        institution_name: institution_name || 'Manual Lender',
        current_balance: Number(current_balance),
        interest_rate: Number(interest_rate || 0),
        minimum_payment: Number(minimum_payment || 0),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ status: 'SUCCESS', account: data });
  } catch (error: unknown) {
    const apiRes = toErrorResponse(error, 'manual-accounts');
    if (apiRes.status !== 500) return apiRes;
    const message = error instanceof Error ? error.message : 'Failed to create manual liability.';
    console.error('Manual Account Creation Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}