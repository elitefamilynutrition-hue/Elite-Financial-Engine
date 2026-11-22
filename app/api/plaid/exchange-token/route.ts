import { NextResponse } from 'next/server';
import { plaidClient } from '@/lib/plaid';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { encryptToken } from '@/lib/crypto';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { toErrorResponse } from '@/lib/http/api-error';

export async function POST(req: Request) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await requireActiveSubscription(user);

    const { public_token, institution_id, institution_name } = await req.json();

    if (!public_token) {
      return NextResponse.json({ error: 'Missing public_token' }, { status: 400 });
    }

    const exchangeRes = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const accessToken = exchangeRes.data.access_token;
    const itemId = exchangeRes.data.item_id;

    const supabaseService = getServiceSupabase();

    // 1. Encrypt raw token before saving to Supabase
    const encryptedAccessToken = encryptToken(accessToken);

    const { error: itemError } = await supabaseService.from('plaid_items').upsert(
      {
        item_id: itemId,
        user_id: user.id,
        access_token: encryptedAccessToken,
        institution_id: institution_id || null,
        institution_name: institution_name || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'item_id' }
    );

    if (itemError) {
      console.error('Error saving plaid_item:', itemError);
      throw itemError;
    }

    // 2. Fetch and persist accounts
    const accountsRes = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accounts = accountsRes.data.accounts.map((acc) => ({
      user_id: user.id,
      plaid_account_id: acc.account_id,
      account_name: acc.name,
      account_type: acc.type,
      account_subtype: acc.subtype || null,
      current_balance: acc.balances.current || 0,
      available_balance: acc.balances.available || null,
      currency_code: acc.balances.iso_currency_code || 'USD',
      updated_at: new Date().toISOString(),
    }));

    const { error: accError } = await supabaseService
      .from('financial_accounts')
      .upsert(accounts, { onConflict: 'plaid_account_id' });

    if (accError) {
      console.error('Error saving accounts:', accError);
      throw accError;
    }

    return NextResponse.json({ status: 'SUCCESS', item_id: itemId });
  } catch (error: unknown) {
    const apiRes = toErrorResponse(error, 'plaid-exchange');
    if (apiRes.status !== 500) return apiRes;
    const err = error as { response?: { data?: { error_message?: string } }; message?: string };
    console.error('Exchange Token Error:', err?.response?.data || err.message || error);
    return NextResponse.json(
      { error: err?.response?.data?.error_message || err.message || 'Token exchange failed.' },
      { status: 500 }
    );
  }
}