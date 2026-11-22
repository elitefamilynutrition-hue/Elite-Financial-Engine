import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { requireActiveSubscription } from '@/lib/auth/require-entitlement';
import { toErrorResponse } from '@/lib/http/api-error';
import { loadUserFinancials } from '@/lib/data/user-financials';
import { computeSurvivalFloor } from '@/lib/analytics/survival-floor';
import { computeWealthQuota } from '@/lib/analytics/wealth-quota';

/**
 * Returns the two headline numbers for the Command Center: the 20% Gross Wealth
 * Quota and the Survival Floor.
 *
 * SECURITY: the tenant is derived from the session only. This route previously
 * accepted `?userId=` and, when it was missing or empty, dropped every row filter
 * and aggregated all users' data. That path is gone.
 */
export async function GET() {
  try {
    const user = await requireUser();
    await requireActiveSubscription(user);
    const financials = await loadUserFinancials(user.id);

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
    return toErrorResponse(error, 'baseline');
  }
}
