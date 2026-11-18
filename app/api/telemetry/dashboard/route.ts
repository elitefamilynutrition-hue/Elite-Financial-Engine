import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { toErrorResponse } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { loadUserFinancials } from '@/lib/data/user-financials';
import { computeSurvivalFloor } from '@/lib/analytics/survival-floor';
import { computeWealthQuota } from '@/lib/analytics/wealth-quota';
import { aggregateCategoryBurn, detectAnomalies } from '@/lib/analytics/burn-aggregate';

const RECENT_TX_DAYS = 90;
const RECENT_TX_LIMIT = 500;

/**
 * Session-scoped dashboard payload: accounts + recent txs + baseline telemetry.
 * recent_transactions are scoped to LIVE financial_accounts only (orphan Plaid
 * account_ids after re-link must not inflate Category Burn).
 */
export async function GET() {
  try {
    const user = await requireUser();
    const financials = await loadUserFinancials(user.id);
    const supabase = getServiceSupabase();

    const liveAccountIds = financials.accounts
      .map((a) => a.plaid_account_id)
      .filter(Boolean);
    const liveSet = new Set(liveAccountIds);

    const since = new Date();
    since.setDate(since.getDate() - RECENT_TX_DAYS);
    const sinceIso = since.toISOString().split('T')[0];

    let recentTx: Record<string, unknown>[] = [];

    if (liveAccountIds.length > 0) {
      const { data, error: txError } = await supabase
        .from('transactions')
        .select(
          'id, amount, category, date, name, merchant_name, transaction_intent, is_internal_transfer, account_id, pending, user_intent_override, exclude_from_burn, override_reason, reimbursement_tx_id'
        )
        .eq('user_id', user.id)
        .in('account_id', liveAccountIds)
        .gte('date', sinceIso)
        .order('date', { ascending: false })
        .limit(RECENT_TX_LIMIT);

      if (txError) throw txError;
      recentTx = data || [];
    }

    const quota = computeWealthQuota(
      financials.latestPaystub,
      Number(financials.profile?.annual_gross_salary || 0)
    );

    const survival = computeSurvivalFloor({
      transactions: financials.transactions,
      sinkingFunds: financials.sinkingFunds,
      targetMonths: Number(financials.profile?.target_emergency_months || 0) || null,
    });

    const burn = aggregateCategoryBurn(recentTx as never, liveSet, 30);
    const anomalies = detectAnomalies(recentTx as never, liveSet);

    const sinkingSummary = (financials.sinkingFunds || []).map((f, idx) => ({
      id: idx,
      target_amount: Number(f.target_amount || 0),
      recurring_schedule: f.recurring_schedule || 'Annual',
    }));

    // Enrich sinking summary with names when available from a second query.
    const { data: sinkingNamed } = await supabase
      .from('sinking_funds')
      .select('id, fund_name, target_amount, recurring_schedule, due_date')
      .eq('user_id', user.id)
      .order('due_date', { ascending: true });

    return NextResponse.json({
      status: 'SUCCESS',
      user_id: user.id,
      accounts: financials.accounts,
      recent_transactions: recentTx || [],
      burn: {
        window_days: 30,
        operational_burn: burn.operationalBurn,
        buckets: burn.buckets,
      },
      anomalies,
      sinking_funds: sinkingNamed || sinkingSummary,
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
