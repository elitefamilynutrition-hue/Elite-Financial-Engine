import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { toErrorResponse } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { loadUserFinancials } from '@/lib/data/user-financials';
import { computeSurvivalFloor } from '@/lib/analytics/survival-floor';
import { computeWealthQuota } from '@/lib/analytics/wealth-quota';
import { computeLiveNetWorth } from '@/lib/analytics/net-worth';

/**
 * Sole snapshot writer: stamps today's balance sheet into `historical_snapshots`
 * (charts + /api/audit read this table; do not write monthly_telemetry_snapshots).
 *
 * SECURITY: the tenant comes from the session. This route previously read
 * `?userId=` straight off the query string, so any signed-in user could
 * overwrite another tenant's snapshot by guessing a UUID.
 */
export async function POST() {
  try {
    const user = await requireUser();
    const financials = await loadUserFinancials(user.id);

    const nw = computeLiveNetWorth(financials.accounts);
    const liquidCapital = nw.liquidCapital;
    const investmentCapital = nw.investmentCapital;
    const revolvingDebt = nw.revolvingDebt;

    const manualDebt = sum(financials.manualAccounts.map((account) => account.current_balance));
    const totalLiabilities = revolvingDebt + manualDebt;

    const survival = computeSurvivalFloor({
      transactions: financials.transactions,
      sinkingFunds: financials.sinkingFunds,
      targetMonths: Number(financials.profile?.target_emergency_months || 0) || null,
    });

    const quota = computeWealthQuota(
      financials.latestPaystub,
      Number(financials.profile?.annual_gross_salary || 0)
    );

    const today = new Date().toISOString().split('T')[0];
    const supabase = getServiceSupabase();

    const { error: insertError } = await supabase.from('historical_snapshots').upsert(
      {
        user_id: user.id,
        snapshot_date: today,
        liquid_capital: round2(liquidCapital),
        investment_capital: round2(investmentCapital),
        total_liabilities: round2(totalLiabilities),
        survival_floor: survival.survival_floor,
        monthly_burn_rate: survival.monthly_burn_rate,
        wealth_quota_target: quota.target_annual,
        wealth_quota_actual: quota.credited_annual,
      },
      { onConflict: 'user_id,snapshot_date' }
    );

    if (insertError) throw insertError;

    return NextResponse.json({
      status: 'SUCCESS',
      message: `Historical snapshot stamped for ${today}.`,
      telemetry: {
        liquid_capital: round2(liquidCapital),
        investment_capital: round2(investmentCapital),
        total_liabilities: round2(totalLiabilities),
        survival_floor: survival.survival_floor,
        monthly_burn_rate: survival.monthly_burn_rate,
      },
    });
  } catch (error) {
    return toErrorResponse(error, 'snapshot');
  }
}

function sum(values: (number | string | null | undefined)[]): number {
  return values.reduce<number>((total, value) => {
    const parsed = Number(value ?? 0);
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
