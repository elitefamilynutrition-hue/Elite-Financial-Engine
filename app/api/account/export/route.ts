import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { toErrorResponse } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';

const TX_LIMIT = 2000;
const SNAPSHOT_LIMIT = 365;

/**
 * Session-scoped data export. Tenant is always the signed-in user.
 * Omits Plaid access token ciphertext — metadata only for plaid_items.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const supabase = getServiceSupabase();
    const userId = user.id;

    const [
      profileRes,
      accountsRes,
      manualRes,
      txRes,
      histRes,
      monthlyRes,
      paystubRes,
      windfallsRes,
      plaidRes,
      investTxRes,
      sinkingRes,
      liquidityRes,
      manualTxRes,
      rulesRes,
    ] = await Promise.all([
      supabase.from('user_financial_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('financial_accounts').select('*').eq('user_id', userId),
      supabase.from('manual_accounts').select('*').eq('user_id', userId),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(TX_LIMIT),
      supabase
        .from('historical_snapshots')
        .select('*')
        .eq('user_id', userId)
        .order('snapshot_date', { ascending: false })
        .limit(SNAPSHOT_LIMIT),
      supabase
        .from('monthly_telemetry_snapshots')
        .select('*')
        .eq('user_id', userId)
        .order('snapshot_date', { ascending: false })
        .limit(SNAPSHOT_LIMIT),
      supabase.from('paystub_records').select('*').eq('user_id', userId),
      supabase.from('capital_windfalls').select('*').eq('user_id', userId),
      supabase
        .from('plaid_items')
        .select('id, user_id, item_id, institution_id, institution_name, next_cursor, created_at, updated_at')
        .eq('user_id', userId),
      supabase.from('investment_transactions').select('*').eq('user_id', userId).limit(TX_LIMIT),
      supabase.from('sinking_funds').select('*').eq('user_id', userId),
      supabase.from('future_liquidity_events').select('*').eq('user_id', userId),
      supabase
        .from('manual_account_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .limit(TX_LIMIT),
      supabase.from('user_custom_categorization_rules').select('*').eq('user_id', userId),
    ]);

    return NextResponse.json({
      status: 'SUCCESS',
      exported_at: new Date().toISOString(),
      user_id: userId,
      email: user.email || null,
      limits: {
        transactions: TX_LIMIT,
        investment_transactions: TX_LIMIT,
        manual_account_transactions: TX_LIMIT,
        snapshots: SNAPSHOT_LIMIT,
      },
      data: {
        profile: profileRes.data,
        financial_accounts: accountsRes.data || [],
        manual_accounts: manualRes.data || [],
        transactions: txRes.data || [],
        investment_transactions: investTxRes.data || [],
        historical_snapshots: histRes.data || [],
        monthly_telemetry_snapshots: monthlyRes.data || [],
        paystub_records: paystubRes.data || [],
        capital_windfalls: windfallsRes.data || [],
        plaid_items: plaidRes.data || [],
        sinking_funds: sinkingRes.data || [],
        future_liquidity_events: liquidityRes.data || [],
        manual_account_transactions: manualTxRes.data || [],
        user_custom_categorization_rules: rulesRes.data || [],
      },
    });
  } catch (error) {
    return toErrorResponse(error, 'account-export');
  }
}
