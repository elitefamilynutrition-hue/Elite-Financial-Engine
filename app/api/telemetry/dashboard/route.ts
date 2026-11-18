import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { toErrorResponse } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { loadUserFinancials } from '@/lib/data/user-financials';
import { computeSurvivalFloor } from '@/lib/analytics/survival-floor';
import { computeWealthQuota } from '@/lib/analytics/wealth-quota';

const RECENT_TX_DAYS = 90;
const RECENT_TX_LIMIT = 500;

/**
 * Session-scoped dashboard payload: accounts + recent txs + baseline telemetry.
 * Avoids loading the full transaction history into the browser on every load.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const financials = await loadUserFinancials(user.id);
    const supabase = getServiceSupabase();

    const since = new Date();
    since.setDate(since.getDate() - RECENT_TX_DAYS);
    const sinceIso = since.toISOString().split('T')[0];

    const { data: recentTx, error: txError } = await supabase
      .from('transactions')
      .select(
        'id, amount, category, date, name, merchant_name, transaction_intent, is_internal_transfer, account_id, pending, user_intent_override, exclude_from_burn, override_reason, reimbursement_tx_id'
      )
      .eq('user_id', user.id)
      .gte('date', sinceIso)
      .order('date', { ascending: false })
      .limit(RECENT_TX_LIMIT);

    if (txError) throw txError;

    const quota = computeWealthQuota(
      financials.latestPaystub,
      Number(financials.profile?.annual_gross_salary || 0)
    );

    const survival = computeSurvivalFloor({
      transactions: financials.transactions,
      sinkingFunds: financials.sinkingFunds,
      targetMonths: Number(financials.profile?.target_emergency_months || 0) || null,
    });

    return NextResponse.json({
      status: 'SUCCESS',
      user_id: user.id,
      accounts: financials.accounts,
      recent_transactions: recentTx || [],
      telemetry: {
        wealth_quota: {
          gross_target: quota.target_annual,
          gross_monthly_target: quota.target_monthly,
          upstream_credited: quota.credited_annual,
          remaining_annual_requirement: quota.remaining_annual,
          remaining_monthly_requirement: quota.remaining_monthly,
          periods_per_year: quota.periods_per_year,
          net_monthly_inflow: quota.net_monthly_inflow,
        },
        survival_matrix: {
          target_months: survival.target_months,
          window_days: survival.window_days,
          survival_spend: survival.survival_spend,
          monthly_sinking_pad: survival.monthly_sinking_pad,
          monthly_baseline_burn: survival.monthly_burn_rate,
          required_emergency_floor: survival.survival_floor,
        },
      },
    });
  } catch (error) {
    return toErrorResponse(error, 'dashboard');
  }
}
