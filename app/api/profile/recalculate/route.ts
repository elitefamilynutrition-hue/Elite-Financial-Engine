import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { toErrorResponse } from '@/lib/http/api-error';
import { getServiceSupabase } from '@/lib/supabase-admin';
import { loadUserFinancials } from '@/lib/data/user-financials';
import { computeSurvivalFloor } from '@/lib/analytics/survival-floor';
import { computeWealthQuota } from '@/lib/analytics/wealth-quota';
import { computeFireProjection } from '@/lib/analytics/fire-projection';
import { computeLiveNetWorth } from '@/lib/analytics/net-worth';

/**
 * Week 4 Day 2: patch profile fields (optional) and return server-side recalculated
 * wealth quota, survival floor, and FI/RE target.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const supabase = getServiceSupabase();

    if (body && typeof body === 'object' && Object.keys(body).length > 0) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const allow = [
        'current_age',
        'target_retirement_age',
        'annual_gross_salary',
        'annual_bonus_target',
        'target_emergency_months',
        'marginal_tax_bracket',
        'safe_withdrawal_rate',
        'expected_inflation_rate',
        'relationship_status',
        'dependents_count',
        'employment_type',
        'housing_status',
        'state_of_residence',
        'health_plan_type',
        'traditional_ira_balance',
        'term_life_coverage',
        'living_trust_established',
        'rsu_vesting_flag',
        'mega_backdoor_eligible',
        'real_estate_tax_loophole_flag',
        'nqdc_participation_flag',
        'child_investment_accounts',
        'financial_kryptonite',
      ] as const;

      for (const key of allow) {
        if (body[key] !== undefined) patch[key] = body[key];
      }

      if (Object.keys(patch).length > 1) {
        const { error } = await supabase
          .from('user_financial_profiles')
          .update(patch)
          .eq('user_id', user.id);
        if (error) throw error;
      }
    }

    const financials = await loadUserFinancials(user.id);
    const survival = computeSurvivalFloor({
      transactions: financials.transactions,
      sinkingFunds: financials.sinkingFunds,
      targetMonths: Number(financials.profile?.target_emergency_months || 0) || null,
    });
    const quota = computeWealthQuota(
      financials.latestPaystub,
      Number(financials.profile?.annual_gross_salary || 0)
    );
    const nw = computeLiveNetWorth(financials.accounts);
    const fire = computeFireProjection({
      currentNetWorth: nw.netWorth,
      investedCapital: nw.investmentCapital,
      monthlyBurn: survival.monthly_burn_rate,
      safeWithdrawalRatePct: Number(financials.profile?.safe_withdrawal_rate || 4),
      inflationPct: Number(financials.profile?.expected_inflation_rate || 3),
      currentAge: Number(financials.profile?.current_age || 35),
      targetRetirementAge: Number(financials.profile?.target_retirement_age || 55),
      annualContribution: Math.max(0, quota.remaining_monthly) * 12,
      useRealReturns: false,
    });

    return NextResponse.json({
      status: 'SUCCESS',
      profile: financials.profile,
      telemetry: {
        wealth_quota: {
          gross_target: quota.target_annual,
          gross_monthly_target: quota.target_monthly,
          upstream_credited: quota.credited_annual,
          remaining_annual_requirement: quota.remaining_annual,
          remaining_monthly_requirement: quota.remaining_monthly,
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
        fire: {
          fire_target: fire.fireTarget,
          fire_multiplier: fire.fireMultiplier,
          progress_pct: fire.progressPct,
          is_on_pace: fire.isOnPace,
          pace_reason: fire.paceReason,
        },
        net_worth: nw,
      },
    });
  } catch (error) {
    return toErrorResponse(error, 'profile-recalculate');
  }
}
